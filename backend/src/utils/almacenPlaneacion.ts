import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { MAX_NOMBRE_ARCHIVO } from '../constants/planeacion';
import ApiError from './ApiError';
import { detectarFirmaArchivo } from './firmasArchivo';
import { UPLOADS_ROOT } from './uploadPaths';

/** Lo que se guarda en Mongo de un PDF de planeación: nunca el contenido, solo dónde está y su huella. */
export interface ArchivoPlaneacion {
  nombre: string;
  /** Relativa al directorio de trabajo, como en el resto de módulos que guardan archivos. */
  ruta: string;
  bytes: number;
  sha256: string;
}

export interface PdfSubido {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

function destinoNuevo(carpeta: string, prefijo: string): string {
  return path.join(carpeta, `${prefijo}-${Date.now()}-${randomBytes(3).toString('hex')}.pdf`);
}

/** Exige un PDF real (lo decide la firma de bytes, no el mimetype que declara el cliente) y lo guarda en `carpeta`. */
export async function guardarPdf(carpeta: string, prefijo: string, archivo: PdfSubido | undefined): Promise<ArchivoPlaneacion> {
  if (!archivo) throw new ApiError(400, 'Adjunta el documento en formato PDF.');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma || firma.ext !== '.pdf') throw new ApiError(400, 'El archivo no es un PDF válido.');

  await fs.mkdir(carpeta, { recursive: true });
  const destino = destinoNuevo(carpeta, prefijo);
  await fs.writeFile(destino, archivo.buffer);
  return {
    nombre: archivo.originalname.slice(0, MAX_NOMBRE_ARCHIVO),
    ruta: path.relative(process.cwd(), destino),
    bytes: archivo.buffer.length,
    sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
  };
}

/** Una adopción no comparte el archivo del plan original: copia el PDF para que cada plan conserve el suyo. */
export async function copiarPdf(origen: Pick<ArchivoPlaneacion, 'nombre' | 'ruta' | 'bytes' | 'sha256'>, carpeta: string, prefijo: string): Promise<ArchivoPlaneacion> {
  await fs.mkdir(carpeta, { recursive: true });
  const destino = destinoNuevo(carpeta, prefijo);
  await fs.copyFile(rutaAbsoluta(origen), destino);
  return { nombre: origen.nombre, ruta: path.relative(process.cwd(), destino), bytes: origen.bytes, sha256: origen.sha256 };
}

/** Las rutas las genera el servidor; aun así, nunca se sirve ni se copia algo que quede fuera de `uploads/`. */
export function rutaAbsoluta(archivo: Pick<ArchivoPlaneacion, 'ruta'>): string {
  const ruta = path.resolve(process.cwd(), archivo.ruta);
  if (!ruta.startsWith(UPLOADS_ROOT + path.sep)) throw new ApiError(404, 'El archivo ya no está disponible.');
  return ruta;
}

export async function borrarArchivo(archivo: Pick<ArchivoPlaneacion, 'ruta'> | null | undefined): Promise<void> {
  if (archivo) await fs.rm(rutaAbsoluta(archivo), { force: true });
}
