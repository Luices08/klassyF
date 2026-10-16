import path from 'path';

// Fuera del repositorio (ver .gitignore): documentos reales de matricula,
// nunca se versionan. Vive junto al proceso del backend en el VPS del colegio.
// `UPLOADS_DIR` solo la fijan las pruebas, para que no toquen (ni borren) los archivos reales de quien desarrolla.
export const UPLOADS_ROOT = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(process.cwd(), 'uploads');
export const MATRICULAS_DIR = path.join(UPLOADS_ROOT, 'matriculas');
export const ASISTENCIA_DIR = path.join(UPLOADS_ROOT, 'asistencia');
export const INCLUSION_DIR = path.join(UPLOADS_ROOT, 'inclusion');
export const CERTIFICADOS_DIR = path.join(UPLOADS_ROOT, 'certificados');
export const ACTIVIDADES_DIR = path.join(UPLOADS_ROOT, 'actividades');
export const PAZ_Y_SALVO_DIR = path.join(UPLOADS_ROOT, 'paz-y-salvo');
export const PLANEACION_DIR = path.join(UPLOADS_ROOT, 'planeacion');

/** Carpeta de una matricula puntual, para aislar sus documentos del resto. */
export function carpetaMatricula(enrollmentId: string): string {
  return path.join(MATRICULAS_DIR, enrollmentId);
}

/** Paz y salvo de fin de año (M04), una carpeta por año lectivo. */
export function carpetaPazYSalvo(anioId: string): string {
  return path.join(PAZ_Y_SALVO_DIR, anioId);
}

/** Soportes de justificaciones de asistencia (M13), una carpeta por planilla. */
export function carpetaAsistencia(attendanceId: string): string {
  return path.join(ASISTENCIA_DIR, attendanceId);
}

/** Evidencias que los estudiantes entregan en una actividad (M11), una carpeta por actividad. */
export function carpetaActividad(activityId: string): string {
  return path.join(ACTIVIDADES_DIR, activityId);
}

/** PDF de apoyo (DBA, estándares, lineamientos) que coordinación carga por área y grados (M07). */
export function carpetaDocumentoReferencia(documentoId: string): string {
  return path.join(PLANEACION_DIR, 'documentos-referencia', documentoId);
}

/** Cada versión del plan de área anual (M07) conserva su PDF, una carpeta por plan. */
export function carpetaPlanArea(planId: string): string {
  return path.join(PLANEACION_DIR, 'planes-area', planId);
}

/** Cada versión del plan de aula de un periodo (M07) conserva su PDF, una carpeta por plan. */
export function carpetaPlanAula(planId: string): string {
  return path.join(PLANEACION_DIR, 'planes-aula', planId);
}

/** Soportes clínicos y documentos firmados de un expediente de inclusión (M16): confidenciales, solo se descargan con sesión y permiso. */
export function carpetaInclusion(expedienteId: string): string {
  return path.join(INCLUSION_DIR, expedienteId);
}

/** Imágenes de firma y sello (M26), nombradas por su huella: no se sobrescriben, así lo ya emitido se puede reimprimir igual. */
export function rutaImagenAutenticacion(hash: string, ext: string): string {
  return path.join(CERTIFICADOS_DIR, 'imagenes', `${hash}${ext}`);
}
