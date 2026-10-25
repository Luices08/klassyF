/**
 * Cómo se numera el Libro de Matrícula (M04). Lo define cada colegio al configurarlo; nada de esto va quemado en el servicio.
 * - ANUAL: el libro se llama como la vigencia (2026) y el folio arranca en 1 cada año.
 * - CONTINUO: el libro y el folio siguen donde iba el archivo físico del colegio; nunca reinician por cambio de año.
 */
export const ESQUEMAS_FOLIATURA = ['ANUAL', 'CONTINUO'] as const;
export type EsquemaFoliatura = (typeof ESQUEMAS_FOLIATURA)[number];

export const NOMBRES_ESQUEMA_FOLIATURA: Record<EsquemaFoliatura, string> = {
  ANUAL: 'Anual por vigencia',
  CONTINUO: 'Consecutivo histórico continuo',
};

/** Partes que admite la máscara del código: `{libro}`, `{folio:6}` (con ceros a la izquierda), `{año}`. */
export const MASCARA_INICIAL = 'L{libro}-F{folio:6}-{año}';

/** El código completo no puede pasar de este largo (el formato del reporte al SIMAT admite hasta 20 caracteres). */
export const MAX_LARGO_CODIGO_FOLIO = 20;
export const MAX_LARGO_MASCARA = 40;

export const MAX_LIBRO = 99_999;
export const MAX_FOLIO = 999_999;
export const MAX_CAPACIDAD_POR_LIBRO = 5000;

/** Id fijo del documento de configuración (uno por instalación). */
export const ID_CONFIGURACION_FOLIATURA = 'FOLIATURA';
