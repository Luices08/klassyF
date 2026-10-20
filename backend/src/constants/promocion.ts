// M19: Promoción y cierre del año. La norma (Decreto 1290/2009, compilado en el 1075/2015) deja a cada colegio definir en su SIEE cuándo se
// promueve y cuándo no; por eso nada de esto está quemado: es una política configurable por año lectivo que el motor evalúa.
import { TIPOS_SITUACION } from './convivencia';

/**
 * Qué se cuenta como «perdido» al aplicar las reglas: cada asignatura, cada área (la nota del área sale de los pesos de M06) o ambas a la vez
 * (lo habitual bajo el Decreto 1290: «3 asignaturas o 2 áreas»).
 */
export const UNIDADES_PROMOCION = ['ASIGNATURA', 'AREA', 'AMBAS'] as const;
export type UnidadPromocion = (typeof UNIDADES_PROMOCION)[number];

/** Cuándo se evalúa: al cerrar el año (antes de la recuperación final) o ya con las notas de la recuperación final aplicadas. */
export const MOMENTOS_PROMOCION = ['CIERRE', 'TRAS_RECUPERACION'] as const;
export type MomentoPromocion = (typeof MOMENTOS_PROMOCION)[number];

/**
 * Qué puede ordenar una regla cuando se cumple. `NO_RENUEVA_CUPO` no toca el resultado académico: es una consecuencia de permanencia.
 * La precedencia entre acciones disparadas a la vez es el orden de `PRECEDENCIA_ACCIONES`.
 */
export const ACCIONES_REGLA = ['PROPONE_RETIRO', 'NO_PROMUEVE', 'ENVIA_A_COMISION', 'PENDIENTE_RECUPERACION', 'NO_RENUEVA_CUPO'] as const;
export type AccionRegla = (typeof ACCIONES_REGLA)[number];
export const PRECEDENCIA_ACCIONES: readonly AccionRegla[] = ['PROPONE_RETIRO', 'NO_PROMUEVE', 'ENVIA_A_COMISION', 'PENDIENTE_RECUPERACION'];

/**
 * Lo que decide el motor para un estudiante. Es el resultado ACADÉMICO: la titulación (graduado, aprobó pero no graduado) es otra
 * dimensión y vive aparte, para que graduar por ventanilla no obligue a reescribir un año cerrado.
 * - INCOMPLETO: falta alguna nota anual y ninguna regla alcanzó a decidir; no se puede cerrar al estudiante.
 * - RETIRO_PROPUESTO: el motor sugiere un retiro de oficio (deserción no formalizada); lo confirma una persona en M04.
 */
/**
 * Niveles donde ningún estudiante reprueba ni repite grado: en Preescolar la evaluación es cualitativa y el niño avanza según su ritmo de
 * desarrollo (Decreto 2247 de 1997; validar la numeración con la norma vigente). El motor los promueve sin mirar notas, reglas ni asistencia.
 */
export const NIVELES_SIN_REPROBACION: readonly string[] = ['PREESCOLAR'];

export const RESULTADOS_PROMOCION = [
  'PROMOVIDO',
  'PENDIENTE_RECUPERACION',
  'PROMOVIDO_POR_RECUPERACION',
  'PROMOVIDO_CON_ARRASTRE',
  'NO_PROMOVIDO',
  'EN_COMISION',
  'RETIRO_PROPUESTO',
  'INCOMPLETO',
] as const;
export type ResultadoPromocion = (typeof RESULTADOS_PROMOCION)[number];

/** Los resultados con los que un estudiante queda resuelto para el año. Los demás esperan recuperación, comisión, una persona o notas. */
export const RESULTADOS_FINALES: readonly ResultadoPromocion[] = ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE', 'NO_PROMOVIDO'];

/**
 * Condiciones que una regla puede combinar (todas deben cumplirse). Una regla nueva es un tipo más aquí, su metadato y su caso en
 * `cumpleCondicion` (utils/promocion.ts), nunca una colección nueva.
 */
export const TIPOS_CONDICION = [
  'PERDIDAS_AL_MENOS',
  'PERDIDAS_COMO_MAXIMO',
  'PIERDE_ASIGNATURAS',
  'PIERDE_AREAS',
  'INASISTENCIA_GLOBAL_SUPERA',
  'INASISTENCIA_ASIGNATURA_SUPERA',
  'PROMEDIO_GENERAL_MENOR',
  'SIN_NOTA_AL_MENOS',
  'RECUPERACION_NO_SUPERADA_AL_MENOS',
  'FALTAS_CONVIVENCIA_AL_MENOS',
  'TIENE_PIAR',
] as const;
export type TipoCondicion = (typeof TIPOS_CONDICION)[number];

/** A qué asignaturas se refiere un conteo: todas, solo las críticas o solo las que no lo son. */
export const FILTROS_CRITICIDAD = ['TODAS', 'CRITICAS', 'NO_CRITICAS'] as const;
export type FiltroCriticidad = (typeof FILTROS_CRITICIDAD)[number];

/** Qué inasistencias cuentan para el porcentaje. */
export const FALTAS_COMPUTABLES = ['SOLO_INJUSTIFICADAS', 'TODAS'] as const;
export type FaltasComputables = (typeof FALTAS_COMPUTABLES)[number];

/** `ALGUNA` = basta con que pierda una de la lista; `TODAS` = debe perder todas a la vez (p. ej. matemáticas y español). */
export const MODOS_LISTA = ['ALGUNA', 'TODAS'] as const;
export type ModoLista = (typeof MODOS_LISTA)[number];

export const GRAVEDADES_CONVIVENCIA = TIPOS_SITUACION;

/**
 * Las faltas de convivencia no pueden reprobar el año (Corte Constitucional, T-341/93 y T-967/07): lo disciplinario solo incide en la
 * permanencia o se delibera en comisión. Una regla con esta condición solo admite estas acciones.
 */
export const ACCIONES_PERMITIDAS_POR_CONVIVENCIA: readonly AccionRegla[] = ['ENVIA_A_COMISION', 'NO_RENUEVA_CUPO'];

export const NIVELES_ACCION_SIN_REGLA = ['PENDIENTE_RECUPERACION', 'NO_PROMUEVE', 'ENVIA_A_COMISION'] as const;
export type AccionSinRegla = (typeof NIVELES_ACCION_SIN_REGLA)[number];

/** Qué se le exige a quien pasa de grado debiendo asignaturas (promoción con arrastre). */
export const CONDICIONES_ARRASTRE = ['NINGUNA', 'PLAN_APOYO_PRIMER_PERIODO', 'NOTA_MINIMA_PRIMER_PERIODO', 'NOTA_PARA_APROBAR_ANIO_ANTERIOR'] as const;
export type CondicionArrastre = (typeof CONDICIONES_ARRASTRE)[number];

/** Qué pasa si el estudiante no cumple la condición del arrastre en el plazo. */
export const CONSECUENCIAS_INCUMPLIR_ARRASTRE = ['SOLO_ALERTA', 'ENVIA_A_COMISION', 'PIERDE_PROMOCION'] as const;
export type ConsecuenciaIncumplirArrastre = (typeof CONSECUENCIAS_INCUMPLIR_ARRASTRE)[number];

/** Qué nota queda al aprobar la recuperación final: la mínima aprobatoria o la nota real. Se refleja en `anual.efecto` de M18. */
export const EFECTOS_NOTA_RECUPERACION = ['LIMITA_A_APROBATORIA', 'REEMPLAZA'] as const;
export type EfectoNotaRecuperacion = (typeof EFECTOS_NOTA_RECUPERACION)[number];

/**
 * Qué pasa con quien pierde una materia (o área) imprescindible. `RECUPERA` = ninguna regla propia: va a recuperación como las demás.
 * `null` = política anterior a esta opción, que no derivaba nada (se conserva su comportamiento hasta que se guarde de nuevo).
 */
export const EFECTOS_IMPRESCINDIBLES = ['NO_PROMUEVE', 'RECUPERA', 'COMISION'] as const;
export type EfectoImprescindibles = (typeof EFECTOS_IMPRESCINDIBLES)[number];

/** Claves de las reglas que el motor deriva de las tarjetas de la política (no se guardan en `reglas[]`; una regla propia no puede usarlas). */
export const CLAVE_REGLA_INASISTENCIA = 'auto-inasistencia';
export const CLAVE_REGLA_REPRUEBA_ASIGNATURAS = 'auto-reprueba-asignaturas';
export const CLAVE_REGLA_REPRUEBA_AREAS = 'auto-reprueba-areas';
export const CLAVE_REGLA_IMPRESCINDIBLE_ASIGNATURAS = 'auto-imprescindible-asignaturas';
export const CLAVE_REGLA_IMPRESCINDIBLE_AREAS = 'auto-imprescindible-areas';
export const CLAVES_REGLAS_DERIVADAS: readonly string[] = [
  CLAVE_REGLA_INASISTENCIA,
  CLAVE_REGLA_REPRUEBA_ASIGNATURAS,
  CLAVE_REGLA_REPRUEBA_AREAS,
  CLAVE_REGLA_IMPRESCINDIBLE_ASIGNATURAS,
  CLAVE_REGLA_IMPRESCINDIBLE_AREAS,
];

export const MAX_REGLAS_PROMOCION = 40;
export const MAX_CONDICIONES_POR_REGLA = 8;
export const PATRON_CLAVE_REGLA = /^[a-z0-9_-]{2,40}$/;
export const MAX_NOMBRE_REGLA = 120;
export const MAX_CARACTERES_TEXTO_SIEE_PROMOCION = 4000;

/**
 * Cómo se dice el resultado en el informe final (boletín, M17). Los resultados internos (retiro por confirmar, notas incompletas) no se
 * muestran a la familia: el boletín deja las casillas en blanco hasta que haya algo que decir.
 */
export const TEXTO_PROMOCION_BOLETIN: Partial<Record<ResultadoPromocion, string>> = {
  PROMOVIDO: 'Promovido al grado siguiente',
  PROMOVIDO_POR_RECUPERACION: 'Promovido al grado siguiente (tras la recuperación)',
  PROMOVIDO_CON_ARRASTRE: 'Promovido con asignatura(s) pendiente(s)',
  NO_PROMOVIDO: 'No promovido',
  PENDIENTE_RECUPERACION: 'Pendiente de recuperación',
  EN_COMISION: 'En estudio de la Comisión de Evaluación y Promoción',
};
