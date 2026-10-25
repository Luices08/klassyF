import { useImagenNoticia, useNoticiaDetalle } from '../../hooks/useNoticias';
import { cuandoEs } from '../../lib/noticias';
import { Alert, errorMessage } from '../ui/Alert';
import { Chip } from '../ui/Badge';
import { ContenidoRico } from '../ui/ContenidoRico';
import { Drawer } from '../ui/Drawer';
import { Spinner } from '../ui/Spinner';
import { CalendarIcon } from '../ui/icons';

/**
 * Una noticia completa: su portada, la bajada, quién la publicó, cuándo y dónde, y el cuerpo con su formato. El cuerpo lo pide el servidor al abrirla (los listados no lo
 * traen) y ya viene limpio. Una noticia anterior, sin formato, se lee como texto en párrafos.
 */
export function NoticiaDetalleDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: n, isLoading, isError, error } = useNoticiaDetalle(id);
  const { data: portada } = useImagenNoticia(n?.id ?? '', n?.imagen_version ?? null);
  const cuando = n ? cuandoEs(n) : null;

  return (
    <Drawer open={id !== null} onClose={onClose} title={n?.titulo ?? 'Noticia'} size="lg">
      {isLoading && (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      )}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {n && (
        <article className="space-y-4">
          {n.imagen_version !== null && portada && (
            <img
              src={portada}
              alt={`Portada de «${n.titulo}»`}
              className="aspect-[16/9] w-full rounded-xl border border-border object-cover"
              style={{ objectPosition: `${n.enfoque_x}% ${n.enfoque_y}%` }}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={n.categoria.tono}>{n.categoria.nombre}</Chip>
            {n.fijada && <Chip tone="blue">Fijada</Chip>}
            {n.afecta_clases && <Chip tone="orange">Afecta las clases</Chip>}
          </div>
          <h3 className="text-h2 text-ink">{n.titulo}</h3>
          {n.subtitulo && <p className="text-body font-medium">{n.subtitulo}</p>}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {n.autor && <span>Por {n.autor}</span>}
            {cuando && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                {cuando}
              </span>
            )}
            {n.lugar && <span>{n.lugar}</span>}
          </p>
          {n.contenido_html ? <ContenidoRico html={n.contenido_html} className="contenido-editorial" /> : <p className="whitespace-pre-line text-body">{n.descripcion}</p>}
        </article>
      )}
    </Drawer>
  );
}
