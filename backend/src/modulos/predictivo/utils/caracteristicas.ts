/**
 * Cómo se arma el vector de entradas de UNA asignatura de UN estudiante a un corte. Puro: lo usan igual el entrenamiento (años cerrados)
 * y la predicción en vivo, así la red siempre recibe lo mismo. Las entradas usan solo lo cerrado hasta el periodo `corte`: con información
 * posterior el modelo aprendería con datos que en la vida real todavía no existen.
 */
import { ENTRADAS_MODELO, EntradasAsignatura, ESCALA_INASISTENCIA, PUNTOS_ALERTA_CONVIVENCIA, TOPE_ALERTAS_CONVIVENCIA } from '../constants/predictivo';

export interface EscalaNotas {
  minima: number;
  maxima: number;
  aprobatoria: number;
}

export interface PeriodoDeAsignatura {
  periodo: number;
  /** Nota efectiva cerrada del periodo (con la recuperación de periodo u homologación ya aplicada); null = aún sin nota cerrada. */
  nota: number | null;
  exento?: boolean;
  /** Actividades con entrega del periodo y cuántas no entregó. */
  actividades: number;
  no_entregadas: number;
  /** Registros de asistencia de la clase y cuántos son falla sin justificar. */
  registros: number;
  fallas: number;
}

export interface DatosDeAsignatura {
  subject_id: string;
  area_id: string;
  periodos: PeriodoDeAsignatura[];
}

export interface FaltaRegistrada {
  periodo: number;
  gravedad: 'I' | 'II' | 'III';
}

/** Lo que dejó el año anterior (el cierre de M19): nota anual de cada asignatura antes de la recuperación final. */
export interface AnioAnterior {
  escala: EscalaNotas;
  asignaturas: Array<{ subject_id: string; area_id: string; nota: number | null }>;
  promedio_general: number | null;
}

export interface DatosAlCorte {
  corte: number;
  totalPeriodos: number;
  escala: EscalaNotas;
  asignaturas: DatosDeAsignatura[];
  faltas: FaltaRegistrada[];
  esRepitente: boolean;
  anterior: AnioAnterior | null;
}

const redondear = (valor: number): number => Math.round(valor * 10000) / 10000;
const acotar = (valor: number): number => Math.min(1, Math.max(0, valor));
const promedio = (valores: number[]): number | null => (valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length);

export function normalizarNota(nota: number, escala: EscalaNotas): number {
  const rango = escala.maxima - escala.minima;
  if (rango <= 0) throw new Error('La escala de notas no tiene rango.');
  return acotar((nota - escala.minima) / rango);
}

const notasHasta = (a: DatosDeAsignatura, corte: number): PeriodoDeAsignatura[] =>
  a.periodos.filter((p) => p.periodo <= corte && !p.exento && p.nota !== null).sort((x, y) => x.periodo - y.periodo);

/** La nota del año anterior que más se parece: la misma asignatura, si no el promedio de su área, si no el promedio general. */
export function notaDelAnioAnterior(anterior: AnioAnterior | null, subjectId: string, areaId: string): number | null {
  if (!anterior) return null;
  const misma = anterior.asignaturas.find((x) => x.subject_id === subjectId && x.nota !== null);
  if (misma) return normalizarNota(misma.nota as number, anterior.escala);
  const area = promedio(anterior.asignaturas.filter((x) => x.area_id === areaId && x.nota !== null).map((x) => x.nota as number));
  if (area !== null) return normalizarNota(area, anterior.escala);
  return anterior.promedio_general === null ? null : normalizarNota(anterior.promedio_general, anterior.escala);
}

/**
 * Las entradas de una asignatura al corte, o `null` si no hay con qué predecir: sin ninguna nota cerrada de ella y sin año anterior.
 * «Falta nota no es cero»: una asignatura sin notas lleva `hay_notas = 0` y sus entradas de nota en 0, y la red aprende a no leerlas.
 */
export function entradasDeAsignatura(datos: DatosAlCorte, subjectId: string): EntradasAsignatura | null {
  const asignatura = datos.asignaturas.find((a) => a.subject_id === subjectId);
  if (!asignatura) return null;
  const propias = notasHasta(asignatura, datos.corte);
  const anterior = notaDelAnioAnterior(datos.anterior, asignatura.subject_id, asignatura.area_id);
  if (propias.length === 0 && anterior === null) return null;

  const todas = datos.asignaturas.flatMap((a) => notasHasta(a, datos.corte).map((p) => p.nota as number));
  const promedioGeneral = promedio(todas);
  const primera = propias[0]?.nota ?? null;
  const ultima = propias[propias.length - 1]?.nota ?? null;
  const rango = datos.escala.maxima - datos.escala.minima;

  const periodosAsig = asignatura.periodos.filter((p) => p.periodo <= datos.corte);
  const actividades = periodosAsig.reduce((s, p) => s + p.actividades, 0);
  const noEntregadas = periodosAsig.reduce((s, p) => s + p.no_entregadas, 0);
  const registros = periodosAsig.reduce((s, p) => s + p.registros, 0);
  const fallas = periodosAsig.reduce((s, p) => s + p.fallas, 0);
  const todosPeriodos = datos.asignaturas.flatMap((a) => a.periodos.filter((p) => p.periodo <= datos.corte));
  const registrosGen = todosPeriodos.reduce((s, p) => s + p.registros, 0);
  const fallasGen = todosPeriodos.reduce((s, p) => s + p.fallas, 0);
  const puntos = datos.faltas.filter((f) => f.periodo <= datos.corte).reduce((s, f) => s + PUNTOS_ALERTA_CONVIVENCIA[f.gravedad], 0);

  const notaAsig = promedio(propias.map((p) => p.nota as number));
  const entradas: EntradasAsignatura = {
    nota_asignatura: notaAsig === null ? 0 : normalizarNota(notaAsig, datos.escala),
    nota_ultimo_periodo: ultima === null ? 0 : normalizarNota(ultima, datos.escala),
    // 0.5 = estable; sube si mejoró del primer periodo al último y baja si empeoró.
    tendencia: primera === null || ultima === null || rango <= 0 ? 0.5 : acotar(0.5 + (ultima - primera) / (2 * rango)),
    promedio_general: promedioGeneral === null ? 0 : normalizarNota(promedioGeneral, datos.escala),
    perdidas_ratio: todas.length === 0 ? 0 : todas.filter((n) => n < datos.escala.aprobatoria).length / todas.length,
    // Sin actividades o sin planillas no se supone que no entregó o que faltó: 0.
    no_entregadas_asignatura: actividades === 0 ? 0 : noEntregadas / actividades,
    inasistencia_asignatura: registros === 0 ? 0 : acotar((fallas / registros) * ESCALA_INASISTENCIA),
    inasistencia_general: registrosGen === 0 ? 0 : acotar((fallasGen / registrosGen) * ESCALA_INASISTENCIA),
    alertas_convivencia: acotar(puntos / TOPE_ALERTAS_CONVIVENCIA),
    es_repitente: datos.esRepitente ? 1 : 0,
    periodo_norm: datos.totalPeriodos <= 0 ? 0 : acotar(datos.corte / datos.totalPeriodos),
    hay_notas: propias.length > 0 ? 1 : 0,
    hay_anio_anterior: anterior === null ? 0 : 1,
    nota_anio_anterior: anterior ?? 0,
  };
  return Object.fromEntries(ENTRADAS_MODELO.map((k) => [k, redondear(entradas[k])])) as EntradasAsignatura;
}

export const aVector = (e: EntradasAsignatura): number[] => ENTRADAS_MODELO.map((k) => e[k]);

/**
 * Cortes con que se puede predecir en un año: del 0 (sin periodos cerrados, solo con el año anterior) hasta el penúltimo cerrado. El
 * último periodo se deja fuera: al cerrarlo la definitiva ya está decidida.
 */
export function cortesDeEntrenamiento(periodosCerrados: number[], totalPeriodos: number): number[] {
  const cerrados = new Set(periodosCerrados);
  const cortes = [0];
  for (let k = 1; k < totalPeriodos && cerrados.has(k); k += 1) cortes.push(k);
  return cortes;
}

/** El corte vigente de un año en curso: cuántos periodos seguidos, desde el primero, ya están cerrados. */
export function corteVigente(periodosCerrados: number[]): number {
  const cerrados = new Set(periodosCerrados);
  let k = 0;
  while (cerrados.has(k + 1)) k += 1;
  return k;
}
