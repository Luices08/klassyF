/** Métricas con que se juzga un modelo en su prueba (años que no vio al entrenar). Puras. */
import { UMBRALES_ACEPTACION } from '../constants/predictivo';

export interface Prediccion {
  probabilidad: number;
  real: 0 | 1;
}

export interface TramoCalibracion {
  desde: number;
  hasta: number;
  filas: number;
  /** Promedio de lo que predijo el modelo y fracción que de verdad la perdió, en este tramo. */
  predicho: number | null;
  observado: number | null;
}

export interface Metricas {
  filas: number;
  positivos: number;
  prevalencia: number;
  auc: number | null;
  brier: number;
  /** Brier de predecir a todos la prevalencia: el modelo debe mejorarlo. */
  brier_referencia: number;
  exactitud: number;
  sensibilidad: number | null;
  especificidad: number | null;
  calibracion: TramoCalibracion[];
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Área bajo la curva ROC por rangos (Mann-Whitney), con los empates a mitad. `null` si falta una de las dos clases. */
export function auc(predicciones: readonly Prediccion[]): number | null {
  const pos = predicciones.filter((p) => p.real === 1).length;
  const neg = predicciones.length - pos;
  if (pos === 0 || neg === 0) return null;
  const ordenadas = [...predicciones].sort((a, b) => a.probabilidad - b.probabilidad).map((p) => [p.probabilidad, p.real] as const);
  let sumaRangos = 0;
  for (let i = 0; i < ordenadas.length; ) {
    let j = i;
    while (j + 1 < ordenadas.length && ordenadas[j + 1]?.[0] === ordenadas[i]?.[0]) j += 1;
    const rangoMedio = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) if (ordenadas[k]?.[1] === 1) sumaRangos += rangoMedio;
    i = j + 1;
  }
  return (sumaRangos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function calcularMetricas(predicciones: readonly Prediccion[], tramos = 10): Metricas {
  const n = predicciones.length;
  const positivos = predicciones.filter((p) => p.real === 1).length;
  const prevalencia = n === 0 ? 0 : positivos / n;
  const brier = n === 0 ? 0 : predicciones.reduce((s, p) => s + (p.probabilidad - p.real) ** 2, 0) / n;
  const aciertos = predicciones.filter((p) => (p.probabilidad >= 0.5 ? 1 : 0) === p.real).length;
  const vp = predicciones.filter((p) => p.real === 1 && p.probabilidad >= 0.5).length;
  const vn = predicciones.filter((p) => p.real === 0 && p.probabilidad < 0.5).length;
  const valorAuc = auc(predicciones);

  const calibracion: TramoCalibracion[] = [];
  for (let t = 0; t < tramos; t += 1) {
    const desde = t / tramos;
    const hasta = (t + 1) / tramos;
    const dentro = predicciones.filter((p) => p.probabilidad >= desde && (t === tramos - 1 ? p.probabilidad <= hasta : p.probabilidad < hasta));
    calibracion.push({
      desde: r4(desde),
      hasta: r4(hasta),
      filas: dentro.length,
      predicho: dentro.length === 0 ? null : r4(dentro.reduce((s, p) => s + p.probabilidad, 0) / dentro.length),
      observado: dentro.length === 0 ? null : r4(dentro.filter((p) => p.real === 1).length / dentro.length),
    });
  }

  return {
    filas: n,
    positivos,
    prevalencia: r4(prevalencia),
    auc: valorAuc === null ? null : r4(valorAuc),
    brier: r4(brier),
    brier_referencia: r4(prevalencia * (1 - prevalencia)),
    exactitud: n === 0 ? 0 : r4(aciertos / n),
    sensibilidad: positivos === 0 ? null : r4(vp / positivos),
    especificidad: n - positivos === 0 ? null : r4(vn / (n - positivos)),
    calibracion,
  };
}

/** Por qué un modelo no se acepta, o `null` si cumple. */
export function motivoDeRechazo(m: Metricas): string | null {
  if (m.filas < UMBRALES_ACEPTACION.filas_prueba_minimas) return `La prueba tiene ${m.filas} filas; se necesitan al menos ${UMBRALES_ACEPTACION.filas_prueba_minimas}.`;
  if (m.auc === null) return 'La prueba no tiene asignaturas perdidas y aprobadas a la vez: no se puede medir.';
  if (m.auc < UMBRALES_ACEPTACION.auc_minimo) return `El AUC de la prueba (${m.auc}) es menor que ${UMBRALES_ACEPTACION.auc_minimo}.`;
  if (m.brier >= m.brier_referencia) return `El error (Brier ${m.brier}) no mejora el de predecir la tasa base (${m.brier_referencia}).`;
  return null;
}
