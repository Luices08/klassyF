// M19 (fase 6): promoción anticipada (Decreto 1290/2009, art. 7). La norma pone el procedimiento (comisión recomienda, familia consiente, Consejo
// Directivo decide, resolución rectoral) pero deja a cada colegio los criterios y el trato de las notas: aquí solo viven los catálogos cerrados.

/**
 * RENDIMIENTO_EXCEPCIONAL: estudiante que en el periodo de evaluación muestra un desempeño superior al esperado para su grado.
 * REINICIANTE: estudiante no promovido el año anterior que, repitiendo el grado, demuestra haber superado lo que le faltaba.
 */
export const TIPOS_ANTICIPADA = ['RENDIMIENTO_EXCEPCIONAL', 'REINICIANTE'] as const;
export type TipoAnticipada = (typeof TIPOS_ANTICIPADA)[number];

/**
 * SOLICITADA → LISTA_PARA_RESOLUCION (cumplidos los pasos que el colegio exige) → RESUELTA (resolución rectoral emitida) → APLICADA (el estudiante
 * ya está en el grupo del grado siguiente). RECHAZADA y ANULADA cierran el trámite sin tocar la matrícula.
 */
export const ESTADOS_ANTICIPADA = ['SOLICITADA', 'LISTA_PARA_RESOLUCION', 'RESUELTA', 'APLICADA', 'RECHAZADA', 'ANULADA'] as const;
export type EstadoAnticipada = (typeof ESTADOS_ANTICIPADA)[number];

/**
 * Qué se hace con las notas de los periodos que el estudiante no cursó en el grado nuevo.
 * - NIVELACION: cada asignatura del grado nuevo exige una nota de nivelación (valor de partida: la opción más conservadora).
 * - COPIAR_EQUIVALENTES: se copia la nota de la misma asignatura del grado anterior; la que no tiene equivalente (materia que arranca en el grado
 *   nuevo, o sin nota cerrada) exige nivelación solo para ella.
 * - DEJAR_SIN_NOTA: el periodo no se califica y su porcentaje se reparte entre los periodos restantes del estudiante.
 */
export const TRATAMIENTOS_NOTAS = ['NIVELACION', 'COPIAR_EQUIVALENTES', 'DEJAR_SIN_NOTA'] as const;
export type TratamientoNotas = (typeof TRATAMIENTOS_NOTAS)[number];

/** Cómo quedó resuelta una asignatura del grado nuevo para los periodos que no cursó. */
export const MODOS_NOTA_PERIODO = ['COPIADA', 'NIVELACION', 'SIN_NOTA'] as const;
export type ModoNotaPeriodo = (typeof MODOS_NOTA_PERIODO)[number];

export const DECISIONES_ANTICIPADA_COMISION = ['RECOMENDAR_ANTICIPADA', 'NO_RECOMENDAR_ANTICIPADA'] as const;
export const DECISIONES_ANTICIPADA_CONSEJO = ['APROBAR_ANTICIPADA', 'NO_APROBAR_ANTICIPADA'] as const;
export const DECISIONES_ANTICIPADA = [...DECISIONES_ANTICIPADA_COMISION, ...DECISIONES_ANTICIPADA_CONSEJO] as const;

/** Quién puede dar el consentimiento por el estudiante: un acudiente vinculado, o el propio estudiante si es mayor de edad. */
export const MEDIOS_CONSENTIMIENTO = ['FORMATO_FIRMADO', 'ACTA_DE_REUNION', 'CORREO', 'OTRO'] as const;
export type MedioConsentimiento = (typeof MEDIOS_CONSENTIMIENTO)[number];

/** Prefijo del consecutivo anual de la resolución rectoral: `RPA-2026-001`. */
export const PREFIJO_RESOLUCION_ANTICIPADA = 'RPA';

export const MAX_TEXTO_ANTICIPADA = 3000;
