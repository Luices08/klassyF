import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import ApiError from './ApiError';
import { ImagenGuardada } from './certificados';
import { rutaImagenAutenticacion } from './uploadPaths';

/**
 * Almacén de imágenes de los certificados (firmas, sello y escudo): cada archivo se nombra por la huella de su contenido, nunca
 * se sobrescribe ni se borra, y el documento expedido solo guarda esa huella. Así una reimpresión sale idéntica, y volver a cargar
 * la misma imagen original recrea exactamente el mismo archivo (la recuperación cuando el archivo se pierde).
 */
export const huellaDeImagen = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

export async function guardarImagenPorContenido(buffer: Buffer, ext: string): Promise<ImagenGuardada> {
  const hash = huellaDeImagen(buffer);
  const destino = rutaImagenAutenticacion(hash, ext);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer);
  return { hash, ext };
}

export async function existeImagen(imagen: ImagenGuardada | null | undefined): Promise<boolean> {
  if (!imagen) return false;
  try {
    await fs.access(rutaImagenAutenticacion(imagen.hash, imagen.ext));
    return true;
  } catch {
    return false;
  }
}

/** Lee una imagen del almacén. Si falta, explica cómo recuperarla en vez de dejar un 500 sin salida. */
export async function leerImagenGuardada(imagen: ImagenGuardada, etiqueta: string): Promise<Buffer> {
  try {
    return await fs.readFile(rutaImagenAutenticacion(imagen.hash, imagen.ext));
  } catch {
    throw new ApiError(
      409,
      `Falta en el servidor el archivo de la imagen de ${etiqueta} (huella ${imagen.hash.slice(0, 12)}) que se estampó al expedir este documento. ` +
        'Se recupera volviendo a cargar la imagen original en «Firmas y sellos»: se identifica por su contenido y queda igual que antes.'
    );
  }
}

/** Una imagen en data URI (como se guarda el logo en M01) a bytes y extensión; null si no es PNG/JPG. */
export function imagenDesdeDataUri(dataUri: string | null | undefined): { buffer: Buffer; ext: '.png' | '.jpg' } | null {
  const coincide = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUri ?? '');
  if (!coincide) return null;
  return { buffer: Buffer.from(coincide[2] as string, 'base64'), ext: coincide[1]!.toLowerCase() === 'png' ? '.png' : '.jpg' };
}
