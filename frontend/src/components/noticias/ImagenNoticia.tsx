import { useImagenNoticia } from '../../hooks/useNoticias';

/** La imagen de una noticia (afiche o foto del evento), pedida con la sesión. Sin imagen o mientras carga no ocupa espacio: la noticia se lee igual. */
export function ImagenNoticia({ id, version, titulo, compacta = false }: { id: string; version: number | null; titulo: string; compacta?: boolean }) {
  const { data: url } = useImagenNoticia(id, version);
  if (version === null || !url) return null;
  return <img src={url} alt={`Imagen de «${titulo}»`} loading="lazy" className={`w-full rounded-lg border border-border object-cover ${compacta ? 'max-h-40' : 'max-h-72'}`} />;
}
