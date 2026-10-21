import type { ReactNode } from 'react';
import type { Noticia } from '../../hooks/useNoticias';
import { cuandoEs } from '../../lib/noticias';
import { Chip } from '../ui/Badge';
import { CalendarIcon } from '../ui/icons';
import { ImagenNoticia } from './ImagenNoticia';

interface TarjetaNoticiaProps {
  noticia: Noticia;
  /** Se muestra completa o recortada a unas líneas (listas compactas). */
  compacta?: boolean;
  /** Botones o información extra de quien gestiona. */
  pie?: ReactNode;
}

/** Una noticia o evento: categoría, título, cuándo y dónde, y su descripción. El color de la categoría nunca es la única señal: siempre va su nombre. */
export function TarjetaNoticia({ noticia: n, compacta = false, pie }: TarjetaNoticiaProps) {
  const cuando = cuandoEs(n);
  return (
    <article className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={n.categoria.tono}>{n.categoria.nombre}</Chip>
        {n.fijada && <Chip tone="blue">Fijada</Chip>}
        {n.afecta_clases && <Chip tone="orange">Afecta las clases</Chip>}
      </div>
      <h3 className="text-h3 text-ink">{n.titulo}</h3>
      <ImagenNoticia id={n.id} version={n.imagen_version} titulo={n.titulo} compacta={compacta} />
      {(cuando || n.lugar) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-body">
          {cuando && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4 text-muted" />
              {cuando}
            </span>
          )}
          {n.lugar && <span>{n.lugar}</span>}
        </p>
      )}
      <p className={`whitespace-pre-line text-sm text-body ${compacta ? 'line-clamp-2' : ''}`}>{n.descripcion}</p>
      {pie}
    </article>
  );
}
