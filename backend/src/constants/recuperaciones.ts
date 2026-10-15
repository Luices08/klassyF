// M18: Recuperaciones. La norma (Decreto 1290/2009, compilado en el 1075/2015) no impone una prueba, una fecha ni un número de
// recuperaciones: lo define el SIEE de cada colegio. Por eso nada de esto está quemado: es política configurable por año lectivo.

/** Cuándo se hace la recuperación de un periodo: al terminarlo o al comenzar el periodo siguiente. */
export const MOMENTOS_RECUPERACION = ['FIN_PERIODO', 'INICIO_SIGUIENTE_PERIODO'] as const;
export type MomentoRecuperacion = (typeof MOMENTOS_RECUPERACION)[number];

export const NOMBRES_MOMENTO_RECUPERACION: Record<MomentoRecuperacion, string> = {
  FIN_PERIODO: 'Al finalizar el periodo',
  INICIO_SIGUIENTE_PERIODO: 'Al iniciar el periodo siguiente',
};

/**
 * Qué pasa con la nota cuando el estudiante recupera:
 * - REEMPLAZA: queda la nota de la recuperación.
 * - LIMITA_A_APROBATORIA: queda la de la recuperación pero sin pasar de la nota aprobatoria (la «nota mínima de aprobado»).
 * - PROMEDIA: promedio de la nota original y la de la recuperación.
 * - LA_MAYOR: la más alta de las dos (nunca baja la nota).
 */
export const EFECTOS_RECUPERACION = ['REEMPLAZA', 'LIMITA_A_APROBATORIA', 'PROMEDIA', 'LA_MAYOR'] as const;
export type EfectoRecuperacion = (typeof EFECTOS_RECUPERACION)[number];

export const NOMBRES_EFECTO_RECUPERACION: Record<EfectoRecuperacion, string> = {
  REEMPLAZA: 'Reemplaza la nota',
  LIMITA_A_APROBATORIA: 'Reemplaza, con tope en la nota aprobatoria',
  PROMEDIA: 'Promedia con la nota original',
  LA_MAYOR: 'Conserva la más alta',
};

export const TIPOS_RECUPERACION = ['PERIODO', 'ANUAL'] as const;
export type TipoRecuperacion = (typeof TIPOS_RECUPERACION)[number];

// PENDIENTE: el estudiante debe recuperar y aún no hay intento. SUPERADA / NO_SUPERADA salen del resultado del mejor intento.
export const ESTADOS_RECUPERACION = ['PENDIENTE', 'SUPERADA', 'NO_SUPERADA'] as const;
export type EstadoRecuperacion = (typeof ESTADOS_RECUPERACION)[number];

export const MAX_INTENTOS_RECUPERACION = 5;
export const MAX_CARACTERES_TEXTO_SIEE = 4000;
export const MAX_CARACTERES_OBSERVACION_INTENTO = 1000;

/** Se guarda en `periodo_numero` de una recuperación anual (el índice único no admite null repetido de forma útil). */
export const PERIODO_DE_RECUPERACION_ANUAL = 0;

/**
 * Cómo entra la nota de una recuperación de periodo a la nota de la asignatura (cada colegio decide):
 * - NOTA_FINAL: se trabaja sobre la nota final de la asignatura con el `efecto` elegido (reemplaza, promedia, la mayor…).
 * - REEMPLAZA_NOTA_MAS_BAJA: la nota de la recuperación ocupa el lugar de la casilla más baja y la asignatura se recalcula.
 * - REEMPLAZA_BLOQUE: la nota de la recuperación pasa a ser la nota de un bloque del molde (p. ej. Heteroevaluación).
 * - CASILLA_ADICIONAL: la recuperación se suma como una casilla más de un bloque, con su propio peso.
 */
export const MODOS_INTEGRACION = ['NOTA_FINAL', 'REEMPLAZA_NOTA_MAS_BAJA', 'REEMPLAZA_BLOQUE', 'CASILLA_ADICIONAL'] as const;
export type ModoIntegracion = (typeof MODOS_INTEGRACION)[number];

export const NOMBRES_MODO_INTEGRACION: Record<ModoIntegracion, string> = {
  NOTA_FINAL: 'Sobre la nota final de la asignatura',
  REEMPLAZA_NOTA_MAS_BAJA: 'Reemplaza la nota más baja',
  REEMPLAZA_BLOQUE: 'Reemplaza la nota de un bloque',
  CASILLA_ADICIONAL: 'Se suma como una nota adicional',
};
