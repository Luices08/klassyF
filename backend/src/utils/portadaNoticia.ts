import { MAX_BYTES_IMAGEN_NOTICIA, TIPOS_IMAGEN_NOTICIA } from '../constants/noticias';
import ApiError from './ApiError';
import { detectarFirmaArchivo } from './firmasArchivo';

/**
 * La portada de una noticia viaja dentro del JSON como data URI (el navegador la reduce antes de enviarla), igual que las imágenes del cuerpo: así la noticia y su
 * foto se guardan juntas y no puede quedar publicada sin portada. Lo que declara el navegador no se cree: el contenido se confirma por la firma de bytes.
 */
export interface PortadaDecodificada {
  mime: string;
  datos: Buffer;
}

const PATRON = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export function decodificarPortada(dataUri: string): PortadaDecodificada {
  const partes = PATRON.exec(dataUri);
  if (!partes) throw new ApiError(400, 'La portada debe ser una imagen PNG, JPG o WEBP.');
  const datos = Buffer.from(partes[2] as string, 'base64');
  if (datos.length > MAX_BYTES_IMAGEN_NOTICIA) throw new ApiError(400, 'La portada supera el tamaño máximo permitido (2 MB).');
  const firma = detectarFirmaArchivo(partes[1] as string, datos);
  if (!firma || !(TIPOS_IMAGEN_NOTICIA as readonly string[]).includes(firma.mimetype)) throw new ApiError(400, 'La portada debe ser un PNG, JPG o WEBP válido.');
  return { mime: firma.mimetype, datos };
}
