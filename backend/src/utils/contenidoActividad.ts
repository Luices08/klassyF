import sanitizeHtml from 'sanitize-html';
import { MAX_BYTES_CONTENIDO_HTML, ProveedorVideo } from '../constants/actividades';
import ApiError from './ApiError';

/**
 * Lo que escribe el docente en el editor de la actividad lo ven los estudiantes dentro de la página: se limpia en el servidor
 * (nunca se confía en el navegador) y solo sobrevive un conjunto cerrado de etiquetas. Las imágenes pegadas viajan como data URI
 * de imagen (el navegador las reduce antes de enviarlas); cualquier otro origen se descarta, así no hay imágenes remotas ni scripts.
 */
const OPCIONES: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'hr', 'img', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data'] },
  transformTags: {
    a: (tag, attribs) => ({ tagName: tag, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
  },
  exclusiveFilter: (marco) => marco.tag === 'img' && !/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(marco.attribs.src ?? ''),
};

/** Las mismas reglas, para que otros módulos con texto enriquecido (noticias) las amplíen sin copiarlas. */
export const OPCIONES_CONTENIDO = OPCIONES;

export function sanitizarContenido(html: string): string {
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES_CONTENIDO_HTML * 2) {
    throw new ApiError(400, 'El contenido de la actividad es demasiado grande: reduce o quita algunas imágenes.');
  }
  const limpio = sanitizeHtml(html, OPCIONES).trim();
  if (Buffer.byteLength(limpio, 'utf8') > MAX_BYTES_CONTENIDO_HTML) {
    throw new ApiError(400, 'El contenido de la actividad supera 2 MB: reduce o quita algunas imágenes.');
  }
  return limpio;
}

/** El texto sin etiquetas: es lo que se ve en listados y avisos. */
export function textoPlano(html: string): string {
  // Sin el espacio, el fin de un párrafo pega la última palabra con la primera del siguiente.
  return sanitizeHtml(html.replace(/<\/(p|li|h[1-6]|blockquote|pre)>|<br\s*\/?>/gi, ' '), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface VideoNormalizado {
  proveedor: ProveedorVideo;
  video_id: string;
}

/** YouTube (watch, youtu.be, shorts, embed) y Vimeo; cualquier otra dirección no se acepta como video incrustado. */
export function normalizarVideo(entrada: string): VideoNormalizado | null {
  let url: URL;
  try {
    url = new URL(entrada.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const idYoutube = /^[A-Za-z0-9_-]{11}$/;

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return idYoutube.test(id) ? { proveedor: 'YOUTUBE', video_id: id } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parteUno = url.pathname.split('/')[1];
    const id = parteUno === 'watch' ? (url.searchParams.get('v') ?? '') : (url.pathname.split('/')[2] ?? '');
    if (parteUno === 'watch' || parteUno === 'embed' || parteUno === 'shorts') return idYoutube.test(id) ? { proveedor: 'YOUTUBE', video_id: id } : null;
    return null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((parte) => /^\d{6,}$/.test(parte));
    return id ? { proveedor: 'VIMEO', video_id: id } : null;
  }
  return null;
}

/** La dirección de incrustación segura que dibuja el navegador. */
export function urlIncrustada(video: VideoNormalizado): string {
  return video.proveedor === 'YOUTUBE'
    ? `https://www.youtube-nocookie.com/embed/${video.video_id}`
    : `https://player.vimeo.com/video/${video.video_id}`;
}
