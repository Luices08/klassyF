import path from 'path';

// Fuera del repositorio (ver .gitignore): documentos reales de matricula,
// nunca se versionan. Vive junto al proceso del backend en el VPS del colegio.
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
export const MATRICULAS_DIR = path.join(UPLOADS_ROOT, 'matriculas');

/** Carpeta de una matricula puntual, para aislar sus documentos del resto. */
export function carpetaMatricula(enrollmentId: string): string {
  return path.join(MATRICULAS_DIR, enrollmentId);
}
