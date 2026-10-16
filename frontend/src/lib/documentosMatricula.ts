const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Texto para el acudiente sobre qué archivos admite la matrícula (coincide con lo que el servidor acepta). */
export const AYUDA_ARCHIVO_DOCUMENTO = 'PDF, JPG, PNG o WEBP de máximo 5 MB.';

/** Revisión previa en el navegador de un documento de matrícula; el servidor vuelve a validar el tipo real y el tamaño. Devuelve el problema o null. */
export function validarArchivoDocumento(file: File): string | null {
  if (!TIPOS_ACEPTADOS.includes(file.type)) return 'Solo se aceptan archivos PDF, JPG, PNG o WEBP.';
  if (file.size > MAX_BYTES) return 'El archivo supera el máximo de 5 MB.';
  return null;
}
