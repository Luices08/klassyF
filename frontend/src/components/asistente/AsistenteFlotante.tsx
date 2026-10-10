import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrientarAsistente } from '../../hooks/useAsistente';
import { buscarDestinos, destinoClaro, destinosParaServidor, type Coincidencia } from '../../lib/asistente';
import type { NavItem } from '../layout/navigation';
import { Button } from '../ui/Button';
import { MessageCircleIcon, SendIcon, XIcon } from '../ui/icons';

interface Mensaje {
  id: number;
  autor: 'asistente' | 'usuario';
  texto: string;
  opciones?: Coincidencia[];
}

const SALUDO: Mensaje = {
  id: 0,
  autor: 'asistente',
  texto: 'Hola, dime qué buscas (por ejemplo: «dónde veo la intensidad horaria») y te llevo a la pantalla correcta.',
};

interface AsistenteFlotanteProps {
  /** Pantallas del menú ya filtradas por rol y modalidad: el asistente nunca manda a una que el usuario no puede abrir. */
  items: NavItem[];
}

export function AsistenteFlotante({ items }: AsistenteFlotanteProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([SALUDO]);
  const orientar = useOrientarAsistente();
  const finRef = useRef<HTMLDivElement>(null);
  const contador = useRef(1);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, abierto]);

  function agregar(...nuevos: Omit<Mensaje, 'id'>[]) {
    setMensajes((actuales) => [...actuales, ...nuevos.map((m) => ({ ...m, id: contador.current++ }))]);
  }

  function irA(destino: Coincidencia) {
    if (destino.item.to === pathname) {
      agregar({ autor: 'asistente', texto: `Ya estás en «${destino.item.label}». ${destino.descripcion}` });
      return;
    }
    agregar({ autor: 'asistente', texto: `Te llevo a «${destino.item.label}». ${destino.descripcion}` });
    navigate(destino.item.to);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const pregunta = texto.trim();
    if (!pregunta) return;
    setTexto('');
    agregar({ autor: 'usuario', texto: pregunta });

    orientar.mutate(
      { pregunta, destinos: destinosParaServidor(items) },
      {
        onSuccess: (r) => {
          const destino = items.find((i) => i.to === r.ruta);
          if (!destino) {
            agregar({ autor: 'asistente', texto: r.mensaje });
            return;
          }
          agregar({ autor: 'asistente', texto: r.mensaje });
          if (destino.to !== pathname || r.grado_id) {
            navigate(r.grado_id ? `${destino.to}?grado=${r.grado_id}` : destino.to);
          }
        },
        // Sin clave configurada, sin red o con el modelo caído: la búsqueda local sigue sirviendo.
        onError: () => responderLocal(pregunta),
      }
    );
  }

  function responderLocal(pregunta: string) {
    const coincidencias = buscarDestinos(pregunta, items);
    const claro = destinoClaro(coincidencias);
    if (claro) {
      irA(claro);
    } else if (coincidencias.length > 0) {
      agregar({ autor: 'asistente', texto: 'Encontré varias opciones, ¿cuál buscas?', opciones: coincidencias.slice(0, 4) });
    } else {
      agregar({
        autor: 'asistente',
        texto: 'No encontré una pantalla para eso entre las que tienes disponibles. Prueba con otras palabras, como «plan de estudios», «notas» o «asistencia».',
      });
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {abierto && (
        <section
          aria-label="Asistente de Klassy"
          className="flex h-[28rem] max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Asistente</p>
              <p className="text-xs text-muted">Te ayudo a encontrar cada pantalla</p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
              className="rounded-full p-1.5 text-muted hover:bg-soft"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-soft px-4 py-3">
            {mensajes.map((m) => (
              <div key={m.id} className={m.autor === 'usuario' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.autor === 'usuario' ? 'bg-primary text-white' : 'bg-surface text-body ring-1 ring-inset ring-border'
                  }`}
                >
                  <p>{m.texto}</p>
                  {m.opciones && (
                    <div className="mt-2 flex flex-col gap-2">
                      {m.opciones.map((o) => (
                        <Button key={o.item.to} type="button" variant="soft-edit" className="justify-start" onClick={() => irA(o)}>
                          <o.item.icon className="h-4 w-4 shrink-0" />
                          {o.item.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {orientar.isPending && <p className="text-xs text-muted">Buscando…</p>}
            <div ref={finRef} />
          </div>

          <form onSubmit={enviar} className="flex items-center gap-2 border-t border-border px-3 py-3">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="¿Qué estás buscando?"
              aria-label="Pregunta para el asistente"
              className="block w-full rounded-lg border-0 px-3 py-2 text-sm text-ink ring-1 ring-inset ring-border placeholder:text-muted focus:ring-2 focus:ring-inset focus:ring-primary"
            />
            <Button type="submit" aria-label="Enviar" disabled={!texto.trim() || orientar.isPending} className="px-3">
              <SendIcon className="h-4 w-4" />
            </Button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'}
        aria-expanded={abierto}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {abierto ? <XIcon className="h-6 w-6" /> : <MessageCircleIcon className="h-6 w-6" />}
      </button>
    </div>
  );
}
