import { type ComponentType, type SVGProps, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useNoticiasParaMi } from '../../hooks/useNoticias';
import { useAnunciosGestion } from '../../hooks/useNotificaciones';
import { diasHastaFinDelDia, formatoFechaLocal, formatoRangoCalendario } from '../../lib/fechas';
import { cuandoEs } from '../../lib/noticias';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { CalendarIcon, ChevronRightIcon, FileTextIcon, MegaphoneIcon, PlusIcon } from '../ui/icons';

const MAX_ANUNCIOS = 3;
const MAX_EVENTOS = 2;
const MAX_NOTICIAS = 3;
/** La versión en lista no se alarga: cuatro entradas bastan, el resto está en «Ver todos». */
const MAX_ITEMS_LISTA = 4;

interface ItemDeLista {
  clave: string;
  titulo: string;
  cuando: string | null;
  etiqueta: string;
  tono: Tone;
  to: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
}
/** Los eventos que importan son los próximos: más allá de un mes ya no son «lo que viene». */
const DIAS_DE_ANTICIPACION = 30;

/**
 * El panel lateral de comunicación de rectoría y coordinación: los últimos anuncios vigentes, los próximos eventos del calendario del año y el botón para
 * redactar un comunicado. El formulario es el de la pantalla de Anuncios y lo abre la página (`onRedactar`), porque también cuelga de un acceso rápido.
 * Lee lo que ya existe: no guarda nada propio.
 */
export function PanelComunicacion({ onRedactar, variante = 'secciones' }: { onRedactar: () => void; variante?: 'secciones' | 'lista' }) {
  const gestion = useAnunciosGestion(true);
  const noticias = useNoticiasParaMi(MAX_NOTICIAS);
  const { anio } = useAnioDeTrabajo();

  const anuncios = (gestion.data ?? []).filter((a) => a.vigente).slice(0, MAX_ANUNCIOS);
  const eventos = useMemo(
    () =>
      (anio?.eventos ?? [])
        .filter((e) => diasHastaFinDelDia(e.fecha_fin) >= 0 && diasHastaFinDelDia(e.fecha_inicio) <= DIAS_DE_ANTICIPACION)
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
        .slice(0, MAX_EVENTOS),
    [anio]
  );

  if (variante === 'lista') {
    // Avisos y noticias en una sola lista, uno debajo del otro; el evento más cercano del calendario cierra el panel.
    const items: ItemDeLista[] = [
      ...anuncios.slice(0, 2).map((a): ItemDeLista => ({ clave: `a-${a.id}`, titulo: a.titulo, cuando: formatoFechaLocal(a.publicar_desde), etiqueta: a.fijado ? 'Fijado' : 'Aviso', tono: 'blue', to: '/anuncios', icono: MegaphoneIcon })),
      ...(noticias.data ?? []).map((n): ItemDeLista => ({ clave: `n-${n.id}`, titulo: n.titulo, cuando: cuandoEs(n), etiqueta: n.categoria.nombre, tono: n.categoria.tono, to: '/noticias', icono: n.fecha_inicio ? CalendarIcon : FileTextIcon })),
    ].slice(0, MAX_ITEMS_LISTA);
    const proximo = eventos[0];

    return (
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 text-ink">Noticias y comunicados</h2>
          <Link to="/noticias" className="text-sm font-semibold text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        <Button onClick={onRedactar} className="w-full">
          <PlusIcon className="h-4 w-4" />
          Redactar comunicado
        </Button>

        {gestion.isLoading || noticias.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">No hay avisos ni noticias vigentes. Publica uno con «Redactar comunicado».</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.clave}>
                <Link to={i.to} className="group flex items-center gap-3 py-3 first:pt-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <i.icono className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink group-hover:text-primary">{i.titulo}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {i.cuando && <span>{i.cuando}</span>}
                      <Chip tone={i.tono}>{i.etiqueta}</Chip>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl bg-gradient-to-br from-primary-soft to-surface p-4">
          <p className="text-xs font-semibold text-muted">Próximo evento</p>
          {proximo ? (
            <>
              <p className="mt-1 text-sm font-semibold text-ink">{proximo.nombre}</p>
              <p className="text-xs text-muted">{formatoRangoCalendario(proximo.fecha_inicio, proximo.fecha_fin)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">No hay fechas del calendario en los próximos {DIAS_DE_ANTICIPACION} días.</p>
          )}
          <Link to="/anio-lectivo" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Ver calendario →
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <CardHeader
        title="Comunicación institucional"
        action={
          <Button onClick={onRedactar}>
            <PlusIcon className="h-4 w-4" />
            Redactar comunicado
          </Button>
        }
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-label font-semibold text-ink">Avisos vigentes</h3>
          <Link to="/anuncios" className="text-sm font-semibold text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        {gestion.isLoading ? (
          <Spinner />
        ) : anuncios.length === 0 ? (
          <p className="text-sm text-muted">No hay avisos vigentes. Publica uno con «Redactar comunicado».</p>
        ) : (
          anuncios.map((a) => (
            <div key={a.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                {a.titulo}
                {a.fijado && <Chip tone="blue">Fijado</Chip>}
              </p>
              <p className="line-clamp-2 whitespace-pre-line text-sm text-body">{a.cuerpo}</p>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-label font-semibold text-ink">Noticias y eventos</h3>
          <Link to="/noticias" className="text-sm font-semibold text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        {noticias.isLoading ? (
          <Spinner />
        ) : (noticias.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No hay noticias ni eventos vigentes.</p>
        ) : (
          noticias.data?.slice(0, MAX_NOTICIAS).map((n) => (
            <div key={n.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                {n.titulo}
                <Chip tone={n.categoria.tono}>{n.categoria.nombre}</Chip>
              </p>
              {cuandoEs(n) && <p className="text-xs text-muted">{cuandoEs(n)}{n.lugar ? ` · ${n.lugar}` : ''}</p>}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-label font-semibold text-ink">Calendario académico</h3>
          <Link to="/anio-lectivo" className="text-sm font-semibold text-primary hover:underline">
            Ver calendario
          </Link>
        </div>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted">No hay fechas del calendario en los próximos {DIAS_DE_ANTICIPACION} días.</p>
        ) : (
          eventos.map((e) => (
            <div key={e._id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-semibold text-ink">{e.nombre}</p>
              <p className="text-xs text-muted">{formatoRangoCalendario(e.fecha_inicio, e.fecha_fin)}</p>
            </div>
          ))
        )}
      </section>
    </Card>
  );
}
