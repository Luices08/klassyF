/**
 * Constantes del módulo predictivo escolar. La unidad que se predice es UNA asignatura de UN estudiante en el año: ¿la perderá
 * (definitiva anual antes de la recuperación final por debajo de la aprobatoria)? El riesgo de no promoción no se predice aparte: se
 * deriva de esas probabilidades con la política de promoción del colegio (M19).
 */

/** Las entradas de la red, todas en 0–1. El orden es el del vector que recibe Brain.js: cambiarlo invalida los modelos guardados. */
export const ENTRADAS_MODELO = [
  'nota_asignatura',
  'nota_ultimo_periodo',
  'tendencia',
  'promedio_general',
  'perdidas_ratio',
  'no_entregadas_asignatura',
  'inasistencia_asignatura',
  'inasistencia_general',
  'alertas_convivencia',
  'es_repitente',
  'periodo_norm',
  'hay_notas',
  'hay_anio_anterior',
  'nota_anio_anterior',
] as const;

export type EntradaModelo = (typeof ENTRADAS_MODELO)[number];
export type EntradasAsignatura = Record<EntradaModelo, number>;

/** Versión del vector de entradas: un modelo guardado con otra versión no se usa (habría que reentrenar). */
export const VERSION_ENTRADAS = 1;

/** Una inasistencia del 25 % ya es la señal más alta: el ratio se multiplica por 4 y se acota a 1, así la red no recibe valores diminutos. */
export const ESCALA_INASISTENCIA = 4;
/** Puntos de alerta de convivencia por gravedad (la Tipo I es cotidiana y formativa: no es alerta) y con cuántos la entrada llega a 1. */
export const PUNTOS_ALERTA_CONVIVENCIA: Record<'I' | 'II' | 'III', number> = { I: 0, II: 1, III: 2 };
export const TOPE_ALERTAS_CONVIVENCIA = 4;

export const ESTADOS_MODELO = ['PENDIENTE', 'EN_CURSO', 'LISTO', 'RECHAZADO', 'FALLIDO'] as const;
export type EstadoModelo = (typeof ESTADOS_MODELO)[number];

/**
 * Un modelo entrenado solo reemplaza al activo si su prueba (en años que no vio) cumple esto. Un AUC de 0.5 es adivinar; el Brier debe
 * ser mejor que el de predecir para todos la tasa base (prevalencia × (1 − prevalencia)).
 */
export const UMBRALES_ACEPTACION = { auc_minimo: 0.7, filas_prueba_minimas: 50 } as const;

/** Con menos años cerrados con resultado de promoción, lo que diga el modelo se presenta como «modelo de demostración». */
export const ANIOS_REALES_MINIMOS = 2;

/** Arquitectura y entrenamiento de la red (Brain.js `NeuralNetwork`). */
export const CONFIG_RED = {
  hiddenLayers: [10, 6],
  iterations: 400,
  errorThresh: 0.004,
  learningRate: 0.2,
} as const;

/** Simulaciones del cierre del año con la política del colegio para estimar el riesgo de no promoción (semilla fija: mismo dato, misma cifra). */
export const SIMULACIONES_PROMOCION = 2000;

/** Niveles con que se habla del riesgo de perder una asignatura (la probabilidad exacta solo la ve el personal). */
export const NIVELES_RIESGO = [
  { nivel: 'BAJO', desde: 0 },
  { nivel: 'MEDIO', desde: 0.3 },
  { nivel: 'ALTO', desde: 0.6 },
] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number]['nivel'];

/** Cada cuánto el proceso de entrenamiento revisa la cola, y cuánto puede tardar uno antes de que otro proceso lo retome. */
export const INTERVALO_COLA_MS = 30_000;
export const RESERVA_ENTRENAMIENTO_MS = 30 * 60_000;

/** El análisis de un estudiante se guarda unos segundos por estudiante, año y versión del modelo (cambia al cerrar notas, no a cada clic). */
export const TTL_ANALISIS_MS = 90_000;
