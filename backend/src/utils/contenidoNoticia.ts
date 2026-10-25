import sanitizeHtml from 'sanitize-html';
import { MAX_BYTES_CONTENIDO_HTML } from '../constants/actividades';
import { MAX_DESCRIPCION_NOTICIA } from '../constants/noticias';
import ApiError from './ApiError';
import { OPCIONES_CONTENIDO, textoPlano } from './contenidoActividad';

/**
 * El cuerpo de una noticia lo escribe quien publica en el editor y lo ven todos los lectores: se limpia en el servidor (nunca se confía en el navegador) con las mismas
 * reglas del texto de una actividad (etiquetas cerradas, imágenes solo como data URI) y una sola cosa más: la letra capital, que es la clase `letra-capital` en un
 * párrafo. Cualquier otra clase, estilo o atributo se descarta.
 */
export const CLASE_LETRA_CAPITAL = 'letra-capital';

const OPCIONES_NOTICIA: sanitizeHtml.IOptions = {
  ...OPCIONES_CONTENIDO,
  allowedAttributes: { ...OPCIONES_CONTENIDO.allowedAttributes, p: ['class'] },
  allowedClasses: { p: [CLASE_LETRA_CAPITAL] },
};

export function sanitizarContenidoNoticia(html: string): string {
  if (Buffer.byteLength(html, 'utf8') > MAX_BYTES_CONTENIDO_HTML * 2) {
    throw new ApiError(400, 'El cuerpo de la noticia es demasiado grande: reduce o quita algunas imágenes.');
  }
  const limpio = sanitizeHtml(html, OPCIONES_NOTICIA).trim();
  if (Buffer.byteLength(limpio, 'utf8') > MAX_BYTES_CONTENIDO_HTML) {
    throw new ApiError(400, 'El cuerpo de la noticia supera 2 MB: reduce o quita algunas imágenes.');
  }
  return limpio;
}

/**
 * Lo que se guarda del cuerpo: el HTML limpio y su texto sin formato (la `descripcion` de los listados y avisos). Quien manda solo texto plano (la forma anterior de
 * publicar) lo conserva como está, sin formato.
 */
export function resolverContenidoNoticia(entrada: { descripcion?: string; contenido_html?: string }): { descripcion: string; contenido_html: string } {
  const html = entrada.contenido_html ? sanitizarContenidoNoticia(entrada.contenido_html) : '';
  const texto = html ? textoPlano(html) : (entrada.descripcion ?? '').trim();
  // Un cuerpo que es solo una imagen no tiene texto: los listados necesitan algo que mostrar.
  if (!texto && !/<img\b/i.test(html)) throw new ApiError(400, 'Escribe el cuerpo de la noticia.');
  return { descripcion: (texto || 'Ver el contenido de la noticia.').slice(0, MAX_DESCRIPCION_NOTICIA), contenido_html: html };
}
