/**
 * Reglas puras del exportador de datos de la simulación (sin Mongoose): cómo se arma una fila «estudiante × corte» y cómo se escribe.
 * Cada fila es una foto a una fecha: las entradas usan SOLO lo registrado hasta el cierre del periodo `corte`, y la etiqueta es lo que
 * pasó después (el resultado final del año). Mezclar ambas cosas haría que el modelo aprendiera con información que en la vida real
 * todavía no existe.
 */

export interface EscalaNotas {
  minima: number;
  maxima: number;
  aprobatoria: number;
}

/** Nota cerrada de una asignatura en un periodo (`CalificacionAsignatura` CERRADO o DEFINITIVO). */
export interface NotaCerrada {
  periodo: number;
  nota: number;
}

/** Una actividad con entrega que el estudiante tenía; `entregada` es false cuando no hay entrega alguna (en el sistema vale 1.0). */
export interface EntregaDeActividad {
  periodo: number;
  entregada: boolean;
}

/** Asistencia de un estudiante en un periodo: cuántos registros de clase tiene y cuántos son falla sin justificar. */
export interface AsistenciaDePeriodo {
  periodo: number;
  registros: number;
  fallas_injustificadas: number;
}

/** Una falta de convivencia en la que el estudiante quedó como presunto responsable (la Tipo I no cuenta como alerta). */
export interface FaltaDeConvivencia {
  periodo: number;
  gravedad: 'I' | 'II' | 'III';
}

export interface EntradasAlCorte {
  promedio_academico: number;
  tareas_no_entregadas: number;
  es_repitente: number;
  periodo_norm: number;
  asignaturas_perdidas_ratio: number;
  ratio_inasistencias: number;
  alertas_convivencia: number;
}

export const COLUMNAS_ENTRADA: ReadonlyArray<keyof EntradasAlCorte> = [
  'promedio_academico',
  'tareas_no_entregadas',
  'es_repitente',
  'periodo_norm',
  'asignaturas_perdidas_ratio',
  'ratio_inasistencias',
  'alertas_convivencia',
];

/** Puntos de alerta por gravedad. La Tipo I es cotidiana y formativa: no es una alerta. */
export const PUNTOS_ALERTA: Record<FaltaDeConvivencia['gravedad'], number> = { I: 0, II: 1, III: 2 };
/** Con estos puntos la entrada llega a 1: dos Tipo III o cuatro Tipo II ya son la señal más alta. */
export const TOPE_ALERTAS_CONVIVENCIA = 4;

/** Sin al menos estas notas cerradas no hay base para predecir: la fila no se genera (nunca se rellena con ceros). */
export const MIN_NOTAS_PARA_PREDECIR = 3;

const redondear = (valor: number): number => Math.round(valor * 10000) / 10000;

/** Lleva una nota de la escala del año a 0–1; fuera de la escala se acota. */
export function normalizarNota(nota: number, escala: EscalaNotas): number {
  const rango = escala.maxima - escala.minima;
  if (rango <= 0) throw new Error('La escala de notas no tiene rango.');
  return Math.min(1, Math.max(0, (nota - escala.minima) / rango));
}

/**
 * Periodos con los que se puede predecir: del primero hasta el penúltimo ya cerrado. El último periodo se deja fuera a propósito:
 * al cerrarlo el año ya está casi decidido y no queda tiempo para actuar.
 */
export function cortesPosibles(periodosCerrados: number[], totalPeriodos: number): number[] {
  return [...periodosCerrados].filter((p) => p >= 1 && p < totalPeriodos).sort((a, b) => a - b);
}

export interface DatosDeCorte {
  corte: number;
  totalPeriodos: number;
  notas: NotaCerrada[];
  entregas: EntregaDeActividad[];
  esRepitente: boolean;
  escala: EscalaNotas;
  asistencia: AsistenciaDePeriodo[];
  faltas: FaltaDeConvivencia[];
}

/** Las entradas normalizadas a 0–1 con lo registrado hasta el periodo `corte`, o `null` si aún no hay notas suficientes. */
export function entradasAlCorte(datos: DatosDeCorte): EntradasAlCorte | null {
  const notas = datos.notas.filter((n) => n.periodo <= datos.corte);
  if (notas.length < MIN_NOTAS_PARA_PREDECIR) return null;
  const promedio = notas.reduce((suma, n) => suma + n.nota, 0) / notas.length;
  const perdidas = notas.filter((n) => n.nota < datos.escala.aprobatoria).length;
  const entregas = datos.entregas.filter((e) => e.periodo <= datos.corte);
  const noEntregadas = entregas.filter((e) => !e.entregada).length;
  const asistencia = datos.asistencia.filter((a) => a.periodo <= datos.corte);
  const registros = asistencia.reduce((suma, a) => suma + a.registros, 0);
  const fallas = asistencia.reduce((suma, a) => suma + a.fallas_injustificadas, 0);
  const puntos = datos.faltas.filter((f) => f.periodo <= datos.corte).reduce((suma, f) => suma + PUNTOS_ALERTA[f.gravedad], 0);
  return {
    promedio_academico: redondear(normalizarNota(promedio, datos.escala)),
    tareas_no_entregadas: entregas.length === 0 ? 0 : redondear(noEntregadas / entregas.length),
    es_repitente: datos.esRepitente ? 1 : 0,
    periodo_norm: redondear(datos.corte / datos.totalPeriodos),
    asignaturas_perdidas_ratio: redondear(perdidas / notas.length),
    // Sin planillas de asistencia no se supone que faltó: 0, igual que las tareas.
    ratio_inasistencias: registros === 0 ? 0 : redondear(fallas / registros),
    alertas_convivencia: redondear(Math.min(1, puntos / TOPE_ALERTAS_CONVIVENCIA)),
  };
}

const PIERDE = ['NO_PROMOVIDO'];
const PASA = ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE'];

/** 1 = pierde el año, 0 = lo pasa, `null` = el año aún no tiene resultado final para ese estudiante (no se usa para entrenar). */
export function etiquetaDeResultado(resultado: string | null | undefined): 0 | 1 | null {
  if (!resultado) return null;
  if (PIERDE.includes(resultado)) return 1;
  if (PASA.includes(resultado)) return 0;
  return null;
}

export interface FilaExportada {
  anio: number;
  student_id: string;
  sede_id: string;
  grado_numero: number;
  grupo: string;
  periodo_corte: number;
  entradas: EntradasAlCorte;
  /** `null` en el año abierto. */
  pierde_anio: 0 | 1 | null;
  resultado_final: string | null;
}

export const COLUMNAS_FILA = [
  'anio',
  'student_id',
  'sede_id',
  'grado_numero',
  'grupo',
  'periodo_corte',
  ...COLUMNAS_ENTRADA,
  'pierde_anio',
  'resultado_final',
] as const;

function celda(valor: string | number | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function filaACeldas(fila: FilaExportada): Array<string | number | null> {
  return [
    fila.anio,
    fila.student_id,
    fila.sede_id,
    fila.grado_numero,
    fila.grupo,
    fila.periodo_corte,
    ...COLUMNAS_ENTRADA.map((c) => fila.entradas[c]),
    fila.pierde_anio,
    fila.resultado_final,
  ];
}

export function aCsv(filas: FilaExportada[]): string {
  const lineas = [COLUMNAS_FILA.join(','), ...filas.map((f) => filaACeldas(f).map(celda).join(','))];
  return `${lineas.join('\n')}\n`;
}

export interface EjemploBrain {
  input: EntradasAlCorte;
  output: { pierde_anio: 0 | 1 };
}

/** Formato de entrenamiento de Brain.js (`net.train([...])`); solo filas con etiqueta. */
export function aEjemplosBrain(filas: FilaExportada[]): EjemploBrain[] {
  return filas.flatMap((f) => (f.pierde_anio === null ? [] : [{ input: f.entradas, output: { pierde_anio: f.pierde_anio } }]));
}

export interface ResumenDeFilas {
  filas: number;
  estudiantes: number;
  positivos: number;
  tasa_positivos: number | null;
}

export function resumirFilas(filas: FilaExportada[]): ResumenDeFilas {
  const conEtiqueta = filas.filter((f) => f.pierde_anio !== null);
  const positivos = conEtiqueta.filter((f) => f.pierde_anio === 1).length;
  return {
    filas: filas.length,
    estudiantes: new Set(filas.map((f) => `${f.anio}:${f.student_id}`)).size,
    positivos,
    tasa_positivos: conEtiqueta.length === 0 ? null : redondear(positivos / conEtiqueta.length),
  };
}

/**
 * Separa entrenamiento y prueba POR AÑO (nunca por fila: el mismo estudiante en ambos lados haría que el modelo «ya lo conociera»).
 * Por defecto el último año con etiquetas es la prueba; con un solo año etiquetado no hay prueba.
 */
export function partirPorAnio(filas: FilaExportada[], anioPrueba?: number): { entrenamiento: FilaExportada[]; prueba: FilaExportada[]; anioPrueba: number | null } {
  const etiquetadas = filas.filter((f) => f.pierde_anio !== null);
  const anios = [...new Set(etiquetadas.map((f) => f.anio))].sort((a, b) => a - b);
  const elegido = anioPrueba ?? (anios.length > 1 ? anios[anios.length - 1] : undefined);
  if (elegido === undefined) return { entrenamiento: etiquetadas, prueba: [], anioPrueba: null };
  if (!anios.includes(elegido)) throw new Error(`No hay filas con etiqueta del año ${elegido} (hay: ${anios.join(', ') || 'ninguno'}).`);
  return {
    entrenamiento: etiquetadas.filter((f) => f.anio !== elegido),
    prueba: etiquetadas.filter((f) => f.anio === elegido),
    anioPrueba: elegido,
  };
}
