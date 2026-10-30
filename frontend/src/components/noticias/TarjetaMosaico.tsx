import type { TamanoMosaico } from '../../hooks/useNoticias';
import { FONDO_DE_TONO } from '../../lib/mosaicoNoticias';
import { Chip, type Tone } from '../ui/Badge';

export interface DatosDeTarjeta {
  titulo: string;
  subtitulo: string;
  categoria: { nombre: string; tono: Tone };
  autor: string;
  /** La fecha ya escrita («25 may 2026, 9:30»); vacía si no hay. */
  cuando: string;
  fijada?: boolean;
  /** El texto sin formato de la noticia (la banda lo usa si no hay bajada). */
  descripcion?: string;
}

interface TarjetaMosaicoProps {
  datos: DatosDeTarjeta;
  tamano: TamanoMosaico;
  /** La portada ya resuelta (dirección local o data URI). `null` = sin portada: solo las noticias anteriores a que fuera obligatoria. */
  portadaUrl: string | null;
  enfoque: { x: number; y: number };
  /** Con él, la tarjeta es un botón que abre la noticia. */
  onAbrir?: () => void;
}

/** Cómo se escribe el título y cuánto texto cabe en cada tamaño: el pequeño solo lleva título, el grande lleva bajada y más renglones. */
const ESTILO: Record<TamanoMosaico, { titulo: string; bajada: string | null }> = {
  PRINCIPAL: { titulo: 'text-h3 sm:text-h2 line-clamp-4', bajada: 'line-clamp-3 text-sm sm:text-base' },
  DESTACADA: { titulo: 'text-h3 line-clamp-2', bajada: 'line-clamp-1 text-sm' },
  ESTANDAR: { titulo: 'text-h3 line-clamp-4', bajada: 'line-clamp-3 text-sm' },
  BREVE: { titulo: 'text-sm font-semibold leading-snug line-clamp-3', bajada: null },
  // La banda se dibuja con `TarjetaBanda`; este valor solo completa el tipo.
  BANDA: { titulo: 'text-h3 line-clamp-2', bajada: 'line-clamp-1 text-sm' },
};

/**
 * Una noticia en el mosaico. Con portada, la foto llena la tarjeta (hacia donde indica el punto de enfoque, para no cortar rostros) y el texto va sobre un degradado
 * oscuro que lo mantiene legible; sin portada (una noticia anterior) se pinta con el color suave de su categoría. El nombre de la categoría siempre está escrito: el
 * color nunca es la única señal.
 */
export function TarjetaMosaico({ datos, tamano, portadaUrl, enfoque, onAbrir }: TarjetaMosaicoProps) {
  const conFoto = portadaUrl !== null;
  const estilo = ESTILO[tamano];
  const texto = conFoto ? 'text-surface' : 'text-ink';
  const secundario = conFoto ? 'text-surface/85' : 'text-body';
  const clases = `group relative isolate flex h-full w-full overflow-hidden rounded-2xl text-left ${conFoto ? 'bg-ink' : `${FONDO_DE_TONO[datos.categoria.tono]} ring-1 ring-inset ring-border`} ${
    onAbrir ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : ''
  }`;

  const contenido = (
    <>
      {conFoto && (
        <>
          <img
            src={portadaUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ objectPosition: `${enfoque.x}% ${enfoque.y}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/40 to-ink/5" aria-hidden="true" />
        </>
      )}
      <div className="relative z-10 mt-auto flex w-full min-w-0 flex-col gap-1.5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={datos.categoria.tono}>{datos.categoria.nombre}</Chip>
          {datos.fijada && <Chip tone="blue">Fijada</Chip>}
        </div>
        <h3 className={`${estilo.titulo} ${texto}`}>{datos.titulo}</h3>
        {estilo.bajada && datos.subtitulo && <p className={`${estilo.bajada} ${secundario}`}>{datos.subtitulo}</p>}
        <p className={`truncate text-xs ${secundario}`}>
          {datos.autor}
          {tamano !== 'BREVE' && datos.cuando ? ` · ${datos.cuando}` : ''}
        </p>
      </div>
    </>
  );

  return onAbrir ? (
    <button type="button" onClick={onAbrir} className={clases}>
      {contenido}
    </button>
  ) : (
    <article className={clases}>{contenido}</article>
  );
}
