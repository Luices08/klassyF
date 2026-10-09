// M12: Evaluación y notas.

/** De dónde sale la nota de un bloque: del promedio de sus actividades (M11) o de una nota que el docente digita directo (p. ej. autoevaluación). */
export const ORIGENES_COMPONENTE = ['ACTIVIDADES', 'NOTA_DIRECTA'] as const;
export type OrigenComponente = (typeof ORIGENES_COMPONENTE)[number];

// Flujo de la nota de una asignatura de un estudiante en un periodo:
//   PENDIENTE (faltan notas) <-> BORRADOR (completa y editable) -> CERRADO (el docente) -> DEFINITIVO (coordinación)
// PENDIENTE y BORRADOR los fija el sistema solo; CERRADO y DEFINITIVO los fijan personas y se reabren con motivo.
export const ESTADOS_NOTA = ['PENDIENTE', 'BORRADOR', 'CERRADO', 'DEFINITIVO'] as const;
export type EstadoNota = (typeof ESTADOS_NOTA)[number];

export const ESTADOS_NOTA_ABIERTOS: readonly EstadoNota[] = ['PENDIENTE', 'BORRADOR'];
export const ESTADOS_NOTA_CERRADOS: readonly EstadoNota[] = ['CERRADO', 'DEFINITIVO'];

export const MAX_COMPONENTES_EVALUATIVOS = 8;

export const MAX_BYTES_EXCEL_NOTAS = 2 * 1024 * 1024;
