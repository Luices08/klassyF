import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrientarAsistente } from '../../hooks/useAsistente';
import { buscarDestinos, destinoClaro, destinosParaServidor, registrarVisita, type Coincidencia, type LugarVisitado } from '../../lib/asistente';
import type { NavItem } from '../layout/navigation';
import { Button } from '../ui/Button';
import { MessageCircleIcon, SendIcon, XIcon } from '../ui/icons';
import { useBotonArrastrable } from './useBotonArrastrable';

interface Mensaje {
  id: number;
  autor: 'asistente' | 'usuario';
  texto: string;
  opciones?: Coincidencia[];
  destino?: LugarVisitado;
}

const TAMANO_BOTON = 56;
const SEPARACION = 12;
const ANCHO_PANEL = 384;
const ALTO_PANEL = 448;

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
  const { pathname, search } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([SALUDO]);
  // Solo en memoria, igual que la conversación: se reinicia al cerrar o recargar la página (y al cerrar sesión, porque el asistente se desmonta).
  const [visitados, setVisitados] = useState<LugarVisitado[]>([]);
  const orientar = useOrientarAsistente();
  const finRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const contador = useRef(1);
  const { posicion, ventana, margen, debeIgnorarClic, handlers } = useBotonArrastrable(TAMANO_BOTON);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, abierto]);

  // Con el chat abierto, un clic o toque fuera de él (y fuera del botón, que ya alterna) lo cierra, igual que Escape.
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: PointerEvent) => {
      const objetivo = e.target as Node;
      if (panelRef.current?.contains(objetivo) || botonRef.current?.contains(objetivo)) return;
      setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', alPresionar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alPresionar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  // El panel sigue al botón: alineado a su borde derecho, arriba si cabe y si no debajo, siempre dentro de la ventana.
  const anchoPanel = Math.min(ANCHO_PANEL, ventana.ancho - 2 * margen);
  const altoPanel = Math.min(ALTO_PANEL, ventana.alto - 2 * margen);
  const izquierdaPanel = Math.min(
    Math.max(posicion.x + TAMANO_BOTON - anchoPanel, margen),
    Math.max(margen, ventana.ancho - anchoPanel - margen)
  );
  const arribaDelBoton = posicion.y - SEPARACION - altoPanel;
  const debajoDelBoton = posicion.y + TAMANO_BOTON + SEPARACION;
  const arribaPanel =
    arribaDelBoton >= margen
      ? arribaDelBoton
      : debajoDelBoton + altoPanel <= ventana.alto - margen
        ? debajoDelBoton
        : Math.max(margen, ventana.alto - altoPanel - margen);

  function agregar(...nuevos: Omit<Mensaje, 'id'>[]) {
    setMensajes((actuales) => [...actuales, ...nuevos.map((m) => ({ ...m, id: contador.current++ }))]);
  }

  // Los lugares visitados son solo las pantallas a las que el asistente llevó: se anotan en el mismo momento en que redirige.
  // Si el usuario cambia de perfil, solo se muestran los que su menú todavía le permite abrir.
  const visitadosVisibles = useMemo(
    () => visitados.flatMap((v) => {
      const item = items.find((i) => i.to === v.ruta);
      return item ? [{ ...v, icono: item.icon }] : [];
    }),
    [visitados, items]
  );

  function redirigirA(ruta: string, url: string, nombre: string, respuesta?: string) {
    agregar({
      autor: 'asistente',
      texto: `${respuesta ?? `Te llevo a «${nombre}».`} 📍 Lugar visitado: «${nombre}».`,
      destino: { ruta, url, nombre },
    });
    navigate(url);
    setVisitados((actuales) => registrarVisita(actuales, { ruta, url, nombre }));
  }

  function irA(destino: Coincidencia) {
    if (destino.item.to === pathname) {
      agregar({ autor: 'asistente', texto: `Ya estás en «${destino.item.label}». ${destino.descripcion}` });
      return;
    }
    redirigirA(destino.item.to, destino.item.to, destino.item.label, `Te llevo a «${destino.item.label}». ${destino.descripcion}`);
  }

  function volverA(lugar: LugarVisitado) {
    if (lugar.url === `${pathname}${search}`) {
      agregar({ autor: 'asistente', texto: `Ya estás en «${lugar.nombre}».` });
      return;
    }
    redirigirA(lugar.ruta, lugar.url, lugar.nombre, `Te llevo de nuevo a «${lugar.nombre}».`);
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
          if (destino.to !== pathname || r.grado_id) {
            redirigirA(destino.to, r.grado_id ? `${destino.to}?grado=${r.grado_id}` : destino.to, destino.label, r.mensaje);
          } else {
            agregar({ autor: 'asistente', texto: r.mensaje });
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
    <>
      {abierto && (
        <section
          ref={panelRef}
          aria-label="Asistente de Klassy"
          style={{ left: izquierdaPanel, top: arribaPanel, width: anchoPanel, height: altoPanel }}
          className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
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

          {visitadosVisibles.length > 0 && (
            <nav aria-label="Lugares visitados con el asistente" className="border-b border-border bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-muted">Lugares visitados</p>
              <ul className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                {visitadosVisibles.map((v) => {
                  const actual = v.ruta === pathname;
                  return (
                    <li key={v.ruta} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => volverA(v)}
                        aria-current={actual ? 'page' : undefined}
                        title={actual ? 'Estás aquí' : `Volver a «${v.nombre}»`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-border ${
                          actual ? 'bg-primary-soft text-primary' : 'bg-surface text-body hover:bg-soft'
                        }`}
                      >
                        <v.icono className="h-3.5 w-3.5 shrink-0" />
                        {v.nombre}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto bg-soft px-4 py-3">
            {mensajes.map((m) => (
              <div key={m.id} className={m.autor === 'usuario' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.autor === 'usuario' ? 'bg-primary text-white' : 'bg-surface text-body ring-1 ring-inset ring-border'
                  }`}
                >
                  <p>{m.texto}</p>
                  {m.destino && (() => {
                    const destino = m.destino;
                    const destinoItem = items.find((i) => i.to === destino.ruta);
                    if (!destinoItem) return null;
                    const IconoDestino = destinoItem.icon;
                    const yaEsta = destino.url === `${pathname}${search}`;
                    return (
                      <Button
                        type="button"
                        variant="soft-edit"
                        className="mt-2 w-full justify-start"
                        onClick={() => volverA(destino)}
                        aria-current={yaEsta ? 'page' : undefined}
                        title={yaEsta ? 'Estás aquí' : `Ir a «${destino.nombre}»`}
                      >
                        <IconoDestino className="h-4 w-4 shrink-0" />
                        {yaEsta ? 'Estás en' : 'Ir a'} {destino.nombre}
                      </Button>
                    );
                  })()}
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
        ref={botonRef}
        type="button"
        {...handlers}
        onClick={() => {
          if (!debeIgnorarClic()) setAbierto((v) => !v);
        }}
        aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente (puedes arrastrarlo)'}
        aria-expanded={abierto}
        title="Arrastra para moverlo"
        style={{ left: posicion.x, top: posicion.y }}
        className="fixed z-40 flex h-14 w-14 cursor-grab touch-none select-none items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
      >
        {abierto ? <XIcon className="h-6 w-6" /> : <MessageCircleIcon className="h-6 w-6" />}
      </button>
    </>
  );
}
