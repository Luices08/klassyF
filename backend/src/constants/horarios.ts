/**
 * M09 — Motor de horarios. Fuente única de verdad del catálogo de variables (restricciones y preferencias) que
 * consumen el modelo `VariableHorario`, los validadores Joi y el motor (`utils/motorHorarios`).
 */

// A quién aplica una variable: a todos los grados o a una lista de grados del catálogo `Grade` que la institución tiene
// activo (M01). Nunca se nombran grados en el código: así M09 sirve igual a un colegio solo de secundaria que a uno con
// preescolar. "Un solo grado" y "un grupo de grados" son la misma forma con una lista de distinto tamaño. Si dos
// variables del mismo tipo chocan, gana la más específica: ver `especificidad` en utils/motorHorarios/alcance.ts.
export const TIPOS_ALCANCE_HORARIO = ['GLOBAL', 'GRADOS'] as const;
export type TipoAlcanceHorario = (typeof TIPOS_ALCANCE_HORARIO)[number];

// DURA: el horario no se publica si se incumple. BLANDA: preferencia optimizable, pesa según `peso` (1–10).
export const SEVERIDADES_VARIABLE_HORARIO = ['DURA', 'BLANDA'] as const;
export type SeveridadVariableHorario = (typeof SEVERIDADES_VARIABLE_HORARIO)[number];

export const PESO_MIN_VARIABLE = 1;
export const PESO_MAX_VARIABLE = 10;

// Celda de la malla de disponibilidad ("tiempo libre"). Lo no marcado se entiende disponible.
// NO_DISPONIBLE respeta la severidad de la variable; CONDICIONAL siempre es una preferencia blanda.
export const VALORES_DISPONIBILIDAD = ['NO_DISPONIBLE', 'CONDICIONAL'] as const;
export type ValorDisponibilidad = (typeof VALORES_DISPONIBILIDAD)[number];

export const ORDENES_CONSECUTIVAS = ['ESPECIFICADO', 'ARBITRARIO'] as const;
export type OrdenConsecutivas = (typeof ORDENES_CONSECUTIVAS)[number];

export const TIPOS_VARIABLE_HORARIO = [
  // Carga: cómo se parte la intensidad semanal (M06/M08) en sesiones.
  'DISTRIBUCION_BLOQUES',
  'REUNION_COLECTIVA',
  // Tiempo libre.
  'DISPONIBILIDAD',
  // Relaciones entre sesiones de un mismo grupo.
  'NO_MISMO_DIA',
  'NO_CONSECUTIVAS',
  'DISTRIBUCION_SEMANAL',
  'MISMO_DIA',
  'CONSECUTIVAS',
  'RECREO_NO_INTERRUMPE',
  'MISMA_FRANJA_CADA_DIA',
  'MAX_HORAS_DIA_GRUPO',
  'MAX_HUECOS_GRUPO',
  // Relaciones entre grupos distintos.
  'SIMULTANEAS',
  'MISMO_DIA_ENTRE_GRUPOS',
  // Docente.
  'MAX_HORAS_DIA_DOCENTE',
  'MAX_HUECOS_DOCENTE',
  'MAX_CONSECUTIVAS_DOCENTE',
  // Espacios (M10).
  'ESPACIO_REQUERIDO',
] as const;
export type TipoVariableHorario = (typeof TIPOS_VARIABLE_HORARIO)[number];

export const CATEGORIAS_VARIABLE_HORARIO = ['CARGA', 'DISPONIBILIDAD', 'GRUPO', 'ENTRE_GRUPOS', 'DOCENTE', 'ESPACIO'] as const;
export type CategoriaVariableHorario = (typeof CATEGORIAS_VARIABLE_HORARIO)[number];

export interface MetadatoVariableHorario {
  categoria: CategoriaVariableHorario;
  /** Texto que ve el coordinador al elegir la condición. */
  etiqueta: string;
  /** Las variables de docente se filtran por docente, no por grado: su alcance siempre es GLOBAL. */
  usaAlcance: boolean;
  /**
   * Valor único: si a una misma sesión (o docente) le aplican varias del mismo tipo, solo cuenta la más específica
   * (ej. "Matemáticas en bloques de 2" global y "en bloques de 1" para 11°). Las demás se acumulan.
   */
  valorUnico: boolean;
  /** Cuántas asignaturas exige (null = libre, 0 o más). */
  asignaturasExactas: number | null;
  /** Severidad sugerida al crearla. */
  severidadPorDefecto: SeveridadVariableHorario;
}

export const METADATOS_VARIABLE_HORARIO: Record<TipoVariableHorario, MetadatoVariableHorario> = {
  DISTRIBUCION_BLOQUES: { categoria: 'CARGA', etiqueta: 'Partir las horas semanales en bloques', usaAlcance: true, valorUnico: true, asignaturasExactas: null, severidadPorDefecto: 'DURA' },
  REUNION_COLECTIVA: { categoria: 'CARGA', etiqueta: 'Reunión de docentes en la misma franja (sin grupo)', usaAlcance: false, valorUnico: false, asignaturasExactas: 0, severidadPorDefecto: 'DURA' },
  DISPONIBILIDAD: { categoria: 'DISPONIBILIDAD', etiqueta: 'Tiempo libre: franjas no disponibles o condicionales', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'DURA' },
  NO_MISMO_DIA: { categoria: 'GRUPO', etiqueta: 'No pueden darse en el mismo día', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  NO_CONSECUTIVAS: { categoria: 'GRUPO', etiqueta: 'No pueden ser consecutivas', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  DISTRIBUCION_SEMANAL: { categoria: 'GRUPO', etiqueta: 'Distribución de las sesiones a lo largo de la semana', usaAlcance: true, valorUnico: true, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  MISMO_DIA: { categoria: 'GRUPO', etiqueta: 'Dos asignaturas deben darse el mismo día', usaAlcance: true, valorUnico: false, asignaturasExactas: 2, severidadPorDefecto: 'BLANDA' },
  CONSECUTIVAS: { categoria: 'GRUPO', etiqueta: 'Dos asignaturas deben ser consecutivas', usaAlcance: true, valorUnico: false, asignaturasExactas: 2, severidadPorDefecto: 'BLANDA' },
  RECREO_NO_INTERRUMPE: { categoria: 'GRUPO', etiqueta: 'El descanso no puede partir un bloque', usaAlcance: true, valorUnico: true, asignaturasExactas: null, severidadPorDefecto: 'DURA' },
  MISMA_FRANJA_CADA_DIA: { categoria: 'GRUPO', etiqueta: 'Debe estar en la misma franja cada día', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  MAX_HORAS_DIA_GRUPO: { categoria: 'GRUPO', etiqueta: 'Máximo de horas de una asignatura por día', usaAlcance: true, valorUnico: true, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  MAX_HUECOS_GRUPO: { categoria: 'GRUPO', etiqueta: 'Máximo de horas libres intermedias del grupo', usaAlcance: true, valorUnico: true, asignaturasExactas: 0, severidadPorDefecto: 'BLANDA' },
  SIMULTANEAS: { categoria: 'ENTRE_GRUPOS', etiqueta: 'Deben darse a la misma hora en todos los grupos de los grados seleccionados', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'DURA' },
  MISMO_DIA_ENTRE_GRUPOS: { categoria: 'ENTRE_GRUPOS', etiqueta: 'Deben darse el mismo día en todos los grupos de los grados seleccionados', usaAlcance: true, valorUnico: false, asignaturasExactas: null, severidadPorDefecto: 'BLANDA' },
  MAX_HORAS_DIA_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas de clase por día', usaAlcance: false, valorUnico: true, asignaturasExactas: 0, severidadPorDefecto: 'DURA' },
  MAX_HUECOS_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas libres intermedias por día', usaAlcance: false, valorUnico: true, asignaturasExactas: 0, severidadPorDefecto: 'BLANDA' },
  MAX_CONSECUTIVAS_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas seguidas', usaAlcance: false, valorUnico: true, asignaturasExactas: 0, severidadPorDefecto: 'BLANDA' },
  ESPACIO_REQUERIDO: { categoria: 'ESPACIO', etiqueta: 'Debe darse en uno de estos espacios', usaAlcance: true, valorUnico: true, asignaturasExactas: null, severidadPorDefecto: 'DURA' },
};

// Versión de un horario: solo una PUBLICADA por año + sede + jornada (índice parcial en el modelo). GENERANDO mientras el
// motor corre en segundo plano; FALLIDO si el motor se cayó o el servidor se reinició a mitad de camino.
export const ESTADOS_HORARIO = ['GENERANDO', 'FALLIDO', 'BORRADOR', 'PUBLICADO', 'ARCHIVADO'] as const;

/** Una generación que lleva más que esto en GENERANDO se da por interrumpida (el tope del motor es 60 s). */
export const MINUTOS_GENERACION_INTERRUMPIDA = 5;
export type EstadoHorario = (typeof ESTADOS_HORARIO)[number];
