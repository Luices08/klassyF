import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { IAdjuntoActividad } from '../models/activity.model';
import {
  MAX_ADJUNTOS_POR_ACTIVIDAD,
  MAX_BYTES_ADJUNTO,
  MAX_VIDEOS_POR_ACTIVIDAD,
  TIPOS_ADJUNTO,
  TipoAdjunto,
} from '../constants/actividades';
import Activity from '../models/activity.model';
import ApiError from '../utils/ApiError';
import { detectarAdjunto } from '../utils/adjuntosActividad';
import { VideoNormalizado, normalizarVideo } from '../utils/contenidoActividad';
import { rutaAdjuntoActividad } from '../utils/uploadPaths';

export interface ArchivoTemporal {
  /** Dónde lo dejó multer. */
  path: string;
  originalname: string;
  mimetype: string;
}

/** Lo que el navegador manda de vuelta al crear la actividad: la huella y la extensión que devolvió la subida y el nombre a mostrar. */
export interface ReferenciaAdjunto {
  id: string;
  ext: string;
  nombre: string;
}

const EXTENSIONES_POR_TIPO: Record<string, TipoAdjunto> = {
  '.pdf': 'PDF',
  '.docx': 'WORD',
  '.xlsx': 'EXCEL',
  '.pptx': 'POWERPOINT',
  '.jpg': 'IMAGEN',
  '.png': 'IMAGEN',
  '.webp': 'IMAGEN',
  '.mp3': 'AUDIO',
  '.mp4': 'VIDEO',
};
export const EXTENSIONES_ADJUNTO = Object.keys(EXTENSIONES_POR_TIPO);

/**
 * Recibe lo que multer dejó en una carpeta temporal, confirma por los bytes qué es cada archivo y lo guarda con el nombre de su
 * huella. Siempre borra los temporales, también cuando alguno es rechazado: nada queda a medias en disco.
 */
export async function guardarAdjuntos(archivos: ArchivoTemporal[]): Promise<IAdjuntoActividad[]> {
  const guardados: IAdjuntoActividad[] = [];
  try {
    for (const archivo of archivos) {
      const buffer = await fs.readFile(archivo.path);
      if (buffer.length > MAX_BYTES_ADJUNTO) throw new ApiError(400, `«${archivo.originalname}» supera los ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB permitidos.`);
      const detectado = detectarAdjunto(archivo.mimetype, archivo.originalname, buffer);
      if (!detectado) {
        throw new ApiError(400, `«${archivo.originalname}» no es un archivo válido (se aceptan JPG, PNG, WEBP, PDF, Word, Excel, PowerPoint, MP3 y MP4).`);
      }
      const id = createHash('sha256').update(buffer).digest('hex');
      const destino = rutaAdjuntoActividad(id, detectado.ext);
      await fs.mkdir(path.dirname(destino), { recursive: true });
      await fs.writeFile(destino, buffer);
      guardados.push({ id, nombre: archivo.originalname.slice(0, 120), tipo: detectado.tipo, ext: detectado.ext, bytes: buffer.length });
    }
    return guardados;
  } finally {
    await Promise.all(archivos.map((a) => fs.rm(a.path, { force: true })));
  }
}

/** Convierte las referencias que manda el navegador en adjuntos de la actividad, comprobando que el archivo existe en el almacén. */
export async function resolverAdjuntos(referencias: readonly ReferenciaAdjunto[]): Promise<IAdjuntoActividad[]> {
  if (referencias.length > MAX_ADJUNTOS_POR_ACTIVIDAD) {
    throw new ApiError(400, `Una actividad admite hasta ${MAX_ADJUNTOS_POR_ACTIVIDAD} archivos adjuntos.`);
  }
  if (new Set(referencias.map((r) => r.id)).size !== referencias.length) throw new ApiError(400, 'Hay un archivo adjunto repetido.');

  const resultado: IAdjuntoActividad[] = [];
  for (const ref of referencias) {
    const tipo = EXTENSIONES_POR_TIPO[ref.ext];
    if (!tipo || !TIPOS_ADJUNTO.includes(tipo)) throw new ApiError(400, `«${ref.nombre}» tiene un formato que no se admite como adjunto.`);
    let bytes: number;
    try {
      bytes = (await fs.stat(rutaAdjuntoActividad(ref.id, ref.ext))).size;
    } catch {
      throw new ApiError(400, `El archivo «${ref.nombre}» no se encuentra en el servidor: vuelve a subirlo.`);
    }
    resultado.push({ id: ref.id, nombre: ref.nombre, tipo, ext: ref.ext, bytes });
  }
  return resultado;
}

export function resolverVideos(urls: readonly string[]): VideoNormalizado[] {
  if (urls.length > MAX_VIDEOS_POR_ACTIVIDAD) throw new ApiError(400, `Una actividad admite hasta ${MAX_VIDEOS_POR_ACTIVIDAD} videos.`);
  const videos: VideoNormalizado[] = [];
  for (const url of urls) {
    const video = normalizarVideo(url);
    if (!video) throw new ApiError(400, `«${url}» no es un enlace de YouTube o Vimeo.`);
    if (!videos.some((v) => v.proveedor === video.proveedor && v.video_id === video.video_id)) videos.push(video);
  }
  return videos;
}

/** Quita del disco los archivos que ya ninguna actividad usa (varias copias de una actividad comparten el mismo). */
export async function liberarAdjuntosSinUso(adjuntos: ReadonlyArray<Pick<IAdjuntoActividad, 'id' | 'ext'>>): Promise<void> {
  for (const adjunto of adjuntos) {
    if (await Activity.exists({ 'adjuntos.id': adjunto.id })) continue;
    await fs.rm(rutaAdjuntoActividad(adjunto.id, adjunto.ext), { force: true });
  }
}

export function rutaDelAdjunto(adjunto: Pick<IAdjuntoActividad, 'id' | 'ext'>): string {
  return rutaAdjuntoActividad(adjunto.id, adjunto.ext);
}
