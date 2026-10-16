import fs from 'fs/promises';
import path from 'path';
import ApiError from '../utils/ApiError';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaMatricula } from '../utils/uploadPaths';

/**
 * Escribe en disco el archivo de un documento del checklist de matrícula (M04) y devuelve su ruta relativa, lista para `cargarDocumento`.
 * El mimetype lo declara el cliente (barato de falsificar): el contenido se confirma por firma de bytes y la extensión sale de ella, nunca
 * del nombre que mandó el cliente. Lo usan el personal, el sitio público de preinscripción y el portal del acudiente.
 */
export async function guardarArchivoDeDocumento(
  enrollmentId: string,
  tipoDocumento: string,
  archivo: { buffer: Buffer; mimetype: string }
): Promise<string> {
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaMatricula(enrollmentId);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${tipoDocumento}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, archivo.buffer);
  return path.relative(process.cwd(), destino);
}
