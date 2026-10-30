import { type ComponentType, type SVGProps, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';
import { useNoticiasParaMi } from '../../hooks/useNoticias';
import { useAnunciosGestion } from '../../hooks/useNotificaciones';
import { diasHastaFinDelDia, formatoFechaLocal, formatoRangoCalendario } from '../../lib/fechas';
import { cuandoEs } from '../../lib/noticias';
import { Chip, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { CalendarIcon, ChevronRightIcon, FileTextIcon, MegaphoneIcon, PlusIcon } from '../ui/icons';

const MAX_ANUNCIOS = 2;
const MAX_NOTICIAS = 3;
/** La banda no se alarga: cuatro entradas y el próximo evento bastan, el resto está en «Ver todos». */
const MAX_ITEMS = 4;
/** Los eventos que importan son los próximos: más allá de un mes ya no son «lo que viene». */
const DIAS_DE_ANTICIPACION = 30;

interface ItemComunicacion {
  clave: string;
  titulo: string;
  cuando: string | null;
  etiqueta: string;
  tono: Tone;
  to: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * La banda de comunicación del panel de rectoría, a todo el ancho: los avisos vigentes y las noticias más recientes como entradas en rejilla, y el próximo evento
 * del calendario del año. El formulario del comunicado es el de la pantalla de Anuncios y lo abre la página (`onRedactar`), porque también cuelga de un acceso rápido.
 * Lee lo que ya existe: no guarda nada propio. Los demás perfiles ven las noticias como mosaico (`MosaicoNoticiasInicio`).
 */
export function PanelComunicacion({ onRedactar }: { onRedactar: () => void }) {
  const gestion = useAnunciosGestion(true);
  const noticias = useNoticiasParaMi(MAX_NOTICIAS);
  const { anio } = useAnioDeTrabajo();

  const anuncios = (gestion.data ?? []).filter((a) => a.vigente).slice(0, MAX_ANUNCIOS);
  const proximo = useMemo(
    () =>
      (anio?.eventos ?? [])
        .filter((e) => diasHastaFinDelDia(e.fecha_fin) >= 0 && diasHastaFinDelDia(e.fecha_inicio) <= DIAS_DE_ANTICIPACION)
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))[0],
    [anio]
  );

  const items: ItemComunicacion[] = [
    ...anuncios.map((a): ItemComunicacion => ({ clave: `a-${a.id}`, titulo: a.titulo, cuando: formatoFechaLocal(a.publicar_desde), etiqueta: a.fijado ? 'Fijado' : 'Aviso', tono: 'blue', to: '/anuncios', icono: MegaphoneIcon })),
    ...(noticias.data ?? []).map((n): ItemComunicacion => ({ clave: `n-${n.id}`, titulo: n.titulo, cuando: cuandoEs(n), etiqueta: n.categoria.nombre, tono: n.categoria.tono, to: '/noticias', icono: n.fecha_inicio ? CalendarIcon : FileTextIcon })),
  ].slice(0, MAX_ITEMS);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-h3 text-ink">Noticias y comunicados</h2>
          <Link to="/noticias" className="text-sm font-semibold text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        <Button onClick={onRedactar}>
          <PlusIcon className="h-4 w-4" />
          Redactar comunicado
        </Button>
      </div>

      {gestion.isLoading || noticias.isLoading ? (
        <Spinner />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted sm:col-span-2 xl:col-auto">No hay avisos ni noticias vigentes. Publica uno con «Redactar comunicado».</li>
          )}
          {items.map((i) => (
            <li key={i.clave}>
              <Link to={i.to} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <i.icono className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-primary">{i.titulo}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {i.cuando && <span>{i.cuando}</span>}
                    <Chip tone={i.tono}>{i.etiqueta}</Chip>
                  </span>
                </span>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
          <li className="rounded-xl bg-gradient-to-br from-primary-soft to-surface p-4">
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
          </li>
        </ul>
      )}
    </Card>
  );
}
