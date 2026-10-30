/**
 * La historia de un estudiante en años anteriores y la probabilidad de perder una asignatura que se deduce de ella junto con lo que va del
 * año. Puro y con pruebas.
 *
 * Por qué existe además de la red: la red ve solo el año anterior y necesita al menos una nota de la asignatura o ese año anterior; sin
 * ellos no predice. Esta estimación junta TODOS los años con cierre (M19), la nota parcial, la asistencia, las entregas y la convivencia
 * en una regla logística sencilla: así una asignatura que «siempre ha costado» se reconoce aunque el periodo aún no tenga notas. No es
 * un modelo entrenado: sus pesos son explícitos (abajo) y se presenta como «según su historial».
 */
import { EscalaNotas, normalizarNota } from './caracteristicas';

/** El cierre de un año anterior (M19): nota anual de cada asignatura antes de la recuperación final. */
export interface AnioHistorial {
  year: number;
  escala: EscalaNotas;
  asignaturas: Array<{ subject_id: string; area_id: string; nota: number | null }>;
  promedio_general: number | null;
}

export interface AnioDeAsignatura {
  year: number;
  nota: number;
  /** Nota en 0–1 con la escala de ese año. */
  normalizada: number;
  perdida: boolean;
  /** false = no cursó esa misma asignatura y se tomó el promedio de su área. */
  misma: boolean;
}

export interface HistorialAsignatura {
  anios: AnioDeAsignatura[];
  /** Promedio normalizado de los años (los más recientes pesan más); null sin años. */
  promedio: number | null;
  perdidas: number;
}

const promedio = (valores: number[]): number | null => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);

/** Cuánto pesa un año según su antigüedad (el más reciente = 1). */
export const DECAIMIENTO_HISTORIAL = 0.7;

/** La historia de una asignatura: por año (del más reciente al más antiguo), la misma asignatura o, si no la cursó, el promedio de su área. */
export function historialDeAsignatura(historial: readonly AnioHistorial[], subjectId: string, areaId: string): HistorialAsignatura {
  const anios: AnioDeAsignatura[] = [];
  for (const anio of [...historial].sort((a, b) => b.year - a.year)) {
    const misma = anio.asignaturas.find((x) => x.subject_id === subjectId && x.nota !== null);
    const nota = misma ? (misma.nota as number) : promedio(anio.asignaturas.filter((x) => x.area_id === areaId && x.nota !== null).map((x) => x.nota as number));
    if (nota === null) continue;
    anios.push({ year: anio.year, nota, normalizada: normalizarNota(nota, anio.escala), perdida: nota < anio.escala.aprobatoria, misma: !!misma });
  }
  let peso = 0;
  let suma = 0;
  anios.forEach((a, i) => {
    const w = DECAIMIENTO_HISTORIAL ** i * (a.misma ? 1 : 0.5);
    peso += w;
    suma += a.normalizada * w;
  });
  return { anios, promedio: peso === 0 ? null : suma / peso, perdidas: anios.filter((a) => a.perdida && a.misma).length };
}

export interface SenalesAsignatura {
  /** Nota parcial del año (periodos cerrados), normalizada; null sin notas. */
  nota_actual: number | null;
  periodos_con_nota: number;
  /** Promedio general del año (periodos cerrados), normalizado; null sin notas. */
  promedio_general: number | null;
  historial: HistorialAsignatura;
  /** Fracción de clases registradas con falla sin excusa; null sin registros. */
  inasistencia: number | null;
  /** Fracción de actividades vencidas sin entregar; null sin actividades. */
  no_entregadas: number | null;
  /** Convivencia (0–1, como la entrada de la red). */
  alertas_convivencia: number;
  es_repitente: boolean;
  /** La aprobatoria del año, normalizada. */
  aprobatoria: number;
}

/** Pesos de la regla. La brecha es (aprobatoria − nota esperada) en la escala 0–1: una décima de 1 a 5 son 0.025. */
export const PESOS_HISTORIAL = {
  sesgo: -1.6,
  brecha: 14,
  inasistencia: 2,
  no_entregadas: 1.6,
  convivencia: 0.8,
  repitente: 0.5,
  perdidas_previas: 1.2,
  /** Cuánto pesa cada fuente al estimar la nota esperada. */
  peso_periodo: 1.5,
  peso_anio: 0.8,
  peso_general: 0.5,
  /** Nota esperada cuando no hay ninguna nota (ni del año ni de la historia): la de un estudiante promedio. */
  nota_neutra: 0.65,
} as const;

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La nota que se espera al final del año, normalizada, mezclando lo que va del año con la historia; null si no hay ninguna nota. */
export function notaEsperada(s: SenalesAsignatura): number | null {
  const fuentes: Array<[number, number]> = [];
  if (s.nota_actual !== null) fuentes.push([s.nota_actual, PESOS_HISTORIAL.peso_periodo * Math.max(1, s.periodos_con_nota)]);
  s.historial.anios.forEach((a, i) => fuentes.push([a.normalizada, PESOS_HISTORIAL.peso_anio * DECAIMIENTO_HISTORIAL ** i * (a.misma ? 1 : 0.5)]));
  if (s.promedio_general !== null) fuentes.push([s.promedio_general, PESOS_HISTORIAL.peso_general]);
  const peso = fuentes.reduce((t, [, w]) => t + w, 0);
  return peso === 0 ? null : fuentes.reduce((t, [v, w]) => t + v * w, 0) / peso;
}

/**
 * Probabilidad (0.02–0.98) de perder la asignatura según la historia y lo que va del año. `null` si no hay absolutamente nada que mirar
 * (ni notas, ni historia, ni asistencia ni entregas): ahí no se inventa una cifra.
 */
export function probabilidadPorHistorial(s: SenalesAsignatura): number | null {
  const esperada = notaEsperada(s);
  if (esperada === null && s.inasistencia === null && s.no_entregadas === null) return null;
  const p = PESOS_HISTORIAL;
  const brecha = s.aprobatoria - (esperada ?? p.nota_neutra);
  const anios = s.historial.anios.filter((a) => a.misma).length;
  const z =
    p.sesgo +
    p.brecha * brecha +
    p.inasistencia * Math.min(1, (s.inasistencia ?? 0) * 4) +
    p.no_entregadas * (s.no_entregadas ?? 0) +
    p.convivencia * s.alertas_convivencia +
    p.repitente * (s.es_repitente ? 1 : 0) +
    p.perdidas_previas * (anios === 0 ? 0 : s.historial.perdidas / anios);
  return Math.round(acotar(1 / (1 + Math.exp(-z)), 0.02, 0.98) * 100) / 100;
}

export type FuenteProbabilidad = 'NOTAS' | 'MODELO' | 'MODELO_E_HISTORIAL' | 'HISTORIAL';

/** Años de la misma asignatura desde los que la historia se suma a lo que dice la red (con uno solo, la red ya lo ve). */
export const ANIOS_PARA_MEZCLAR = 2;
export const PESO_HISTORIAL_EN_MEZCLA = 0.3;

/**
 * La probabilidad que se muestra: la de la red si la hay (mezclada con la de la historia cuando hay dos o más años de esa asignatura,
 * que la red no ve); la de la historia si la red no puede decir nada.
 */
export function combinarProbabilidades(red: number | null, historial: number | null, aniosMisma: number): { probabilidad: number | null; fuente: FuenteProbabilidad | null } {
  if (red !== null && historial !== null && aniosMisma >= ANIOS_PARA_MEZCLAR) {
    return { probabilidad: Math.round(((1 - PESO_HISTORIAL_EN_MEZCLA) * red + PESO_HISTORIAL_EN_MEZCLA * historial) * 100) / 100, fuente: 'MODELO_E_HISTORIAL' };
  }
  if (red !== null) return { probabilidad: red, fuente: 'MODELO' };
  if (historial !== null) return { probabilidad: historial, fuente: 'HISTORIAL' };
  return { probabilidad: null, fuente: null };
}
