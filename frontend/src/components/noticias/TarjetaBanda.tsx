import { FONDO_DE_TONO } from '../../lib/mosaicoNoticias';
import { Chip } from '../ui/Badge';
import { CalendarIcon, ChevronRightIcon } from '../ui/icons';
import type { DatosDeTarjeta } from './TarjetaMosaico';

interface TarjetaBandaProps {
  datos: DatosDeTarjeta;
  /** La portada ya resuelta (dirección local o data URI). `null` = sin portada: solo las noticias anteriores a que fuera obligatoria. */
  portadaUrl: string | null;
  enfoque: { x: number; y: number };
  onAbrir?: () => void;
  /** La noticia más importante (Principal, Destacada o Banda) lleva la foto un poco más alta. */
  alta?: boolean;
  /** Dentro del mosaico la banda llena la fila que le toca; sola (una o dos noticias) toma la altura que pide su contenido. */
  llenarAlto?: boolean;
}

/**
 * Una noticia a todo el ancho: la foto a un lado y, al otro, la categoría, el título, la bajada, la fecha y el autor sobre fondo blanco (sin degradado oscuro: el
 * texto se lee igual de bien). Es la forma de mostrar una o dos noticias, y el tamaño «Banda» del mosaico. Usa el ancho de su propio contenedor (no el de la
 * pantalla), así se acomoda igual en el inicio y en la vista previa angosta del formulario: en un ancho corto, la foto va arriba.
 */
export function TarjetaBanda({ datos, portadaUrl, enfoque, onAbrir, alta = false, llenarAlto = false }: TarjetaBandaProps) {
  const texto = datos.subtitulo || datos.descripcion || '';
  const clases = `group flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-2 text-left shadow-xs transition-colors @lg:flex-row @lg:items-stretch ${
    llenarAlto ? 'h-full' : ''
  } ${onAbrir ? 'cursor-pointer hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : ''}`;

  const contenido = (
    <>
      <div
        className={`relative aspect-[16/9] shrink-0 overflow-hidden rounded-xl ${portadaUrl ? 'bg-soft' : FONDO_DE_TONO[datos.categoria.tono]} @lg:aspect-auto @lg:w-64 @3xl:w-80 ${
          llenarAlto ? '@lg:min-h-0' : alta ? '@lg:min-h-52' : '@lg:min-h-40'
        }`}
      >
        {portadaUrl ? (
          <img
            src={portadaUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ objectPosition: `${enfoque.x}% ${enfoque.y}%` }}
          />
        ) : (
          <CalendarIcon className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-muted/60" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-1 pb-1 @lg:px-2 @lg:py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={datos.categoria.tono}>{datos.categoria.nombre}</Chip>
          {datos.fijada && <Chip tone="blue">Fijada</Chip>}
        </div>
        <h3 className="line-clamp-2 text-h3 text-ink group-hover:text-primary">{datos.titulo}</h3>
        {texto && <p className="line-clamp-2 text-sm text-muted">{texto}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {datos.cuando && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {datos.cuando}
            </span>
          )}
          <span className="truncate">{datos.autor}</span>
        </p>
      </div>

      {onAbrir && <ChevronRightIcon className="hidden h-5 w-5 shrink-0 self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary @lg:mr-3 @lg:block" />}
    </>
  );

  return (
    <div className="@container w-full min-w-0 h-full">
      {onAbrir ? (
        <button type="button" onClick={onAbrir} className={clases}>
          {contenido}
        </button>
      ) : (
        <article className={clases}>{contenido}</article>
      )}
    </div>
  );
}
