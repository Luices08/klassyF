// Traslados extemporáneos y homologación de notas (M04/M26, con efecto en M12, M17, M18 y M19/M20).

/**
 * Cómo queda una asignatura de un periodo que el estudiante no cursó aquí porque llegó después:
 *  - HOMOLOGADA_EXTERNA: secretaría registró la nota oficial de la institución de procedencia, ya convertida a la escala del año.
 *  - EXENTA_POR_TRASLADO: el colegio de origen no la impartía; no tiene nota y no cuenta ni en el promedio ni en la reprobación.
 */
export const ESTADOS_NOTA_TRASLADO = ['HOMOLOGADA_EXTERNA', 'EXENTA_POR_TRASLADO'] as const;
export type EstadoNotaTraslado = (typeof ESTADOS_NOTA_TRASLADO)[number];

export const NOMBRES_ESTADO_NOTA_TRASLADO: Record<EstadoNotaTraslado, string> = {
  HOMOLOGADA_EXTERNA: 'Homologada',
  EXENTA_POR_TRASLADO: 'Exenta por traslado',
};

/** Una escala de otra institución es numérica (1–10, 0–100...) o puramente conceptual (Excelente, Bueno...). */
export const TIPOS_ESCALA_EXTERNA = ['NUMERICA', 'CONCEPTUAL'] as const;
export type TipoEscalaExterna = (typeof TIPOS_ESCALA_EXTERNA)[number];

/**
 * LINEAL: proporción entre los extremos (anclada en la nota aprobatoria de origen si se conoce, para que aprobar allá sea aprobar aquí).
 * RANGOS: tabla de equivalencias que definió el colegio («de 9.0 a 10 equivale a 5.0»).
 */
export const METODOS_CONVERSION = ['LINEAL', 'RANGOS'] as const;
export type MetodoConversion = (typeof METODOS_CONVERSION)[number];

/** Una escala usada no se borra (lo homologado la copia, pero el historial la nombra): se desactiva. */
export const ESTADOS_ESCALA_EXTERNA = ['activo', 'inactivo'] as const;
export type EstadoEscalaExterna = (typeof ESTADOS_ESCALA_EXTERNA)[number];

export const MAX_RANGOS_ESCALA_EXTERNA = 20;
export const MAX_CONCEPTOS_ESCALA_EXTERNA = 20;
/** Trimestres, semestres, bimestres...: el esquema de la institución de procedencia. */
export const MAX_PERIODOS_ORIGEN = 12;
export const MAX_FUENTES_NOTA_HOMOLOGADA = 6;
export const MAX_SOPORTES_TRASLADO = 5;
export const MAX_BYTES_SOPORTE_TRASLADO = 5 * 1024 * 1024;
export const MIN_LONGITUD_MOTIVO_TRASLADO = 5;
