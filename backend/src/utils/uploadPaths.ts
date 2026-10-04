import path from 'path';

// Fuera del repositorio (ver .gitignore): documentos reales de matricula,
// nunca se versionan. Vive junto al proceso del backend en el VPS del colegio.
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
export const MATRICULAS_DIR = path.join(UPLOADS_ROOT, 'matriculas');
export const ASISTENCIA_DIR = path.join(UPLOADS_ROOT, 'asistencia');
export const INCLUSION_DIR = path.join(UPLOADS_ROOT, 'inclusion');

/** Carpeta de una matricula puntual, para aislar sus documentos del resto. */
export function carpetaMatricula(enrollmentId: string): string {
  return path.join(MATRICULAS_DIR, enrollmentId);
}

/** Soportes de justificaciones de asistencia (M13), una carpeta por planilla. */
export function carpetaAsistencia(attendanceId: string): string {
  return path.join(ASISTENCIA_DIR, attendanceId);
}

/** Soportes clínicos y documentos firmados de un expediente de inclusión (M16): confidenciales, solo se descargan con sesión y permiso. */
export function carpetaInclusion(expedienteId: string): string {
  return path.join(INCLUSION_DIR, expedienteId);
}
