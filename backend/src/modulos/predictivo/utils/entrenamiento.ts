/**
 * Entrena y prueba la red con Brain.js. No lee la base: recibe las filas ya armadas (corre dentro del proceso de entrenamiento, en un
 * hilo aparte, para no frenar la API). La prueba se hace con datos que el modelo no vio: el último año con resultados si hay varios
 * (partir por año, nunca por fila: el mismo estudiante en ambos lados haría que el modelo «ya lo conociera») o, con un solo año, una
 * parte de los estudiantes. Partir por año exige que los años de entrenamiento traigan los mismos tipos de fila que el de prueba (cortes y
 * «tiene año anterior»): el primer año del colegio en Klassy no tiene año anterior ni corte 0, y probar con un año que sí los tiene
 * mide cuánto inventa la red con entradas que nunca vio, no cuánto acierta; en ese caso también se parte por estudiantes. El modelo que queda es el que se probó, así las métricas dicen lo que de verdad hará.
 */
import { NeuralNetwork } from 'brain.js';
import { CONFIG_RED, ENTRADAS_MODELO } from '../constants/predictivo';
import { calcularMetricas, Metricas } from './metricas';

export interface FilaEntrenamiento {
  anio: number;
  student_id: string;
  subject_id: string;
  corte: number;
  x: number[];
  /** 1 = perdió la asignatura en el año. */
  y: 0 | 1;
}

export type RedGuardada = ReturnType<NeuralNetwork<number[], number[]>['toJSON']>;

export interface ResultadoEntrenamiento {
  red: RedGuardada;
  metricas: Metricas;
  criterio_prueba: 'ANIO' | 'ESTUDIANTES';
  anio_prueba: number | null;
  filas_entrenamiento: number;
  filas_prueba: number;
  error_entrenamiento: number;
  iteraciones: number;
}

/** Parte determinista de los estudiantes (hash del id), para que repetir el entrenamiento use la misma prueba. */
function enPrueba(studentId: string, fraccion: number): boolean {
  let h = 2166136261;
  for (let i = 0; i < studentId.length; i += 1) h = Math.imul(h ^ studentId.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296 < fraccion;
}

const INDICE_ANIO_ANTERIOR = ENTRADAS_MODELO.indexOf('hay_anio_anterior');
const tipoDeFila = (f: FilaEntrenamiento): string => `${f.corte}|${(f.x[INDICE_ANIO_ANTERIOR] ?? 0) >= 0.5 ? 1 : 0}`;

export function partirParaPrueba(filas: readonly FilaEntrenamiento[], fraccionEstudiantes = 0.2) {
  const anios = [...new Set(filas.map((f) => f.anio))].sort((a, b) => a - b);
  if (anios.length >= 2) {
    const anio = anios[anios.length - 1] as number;
    const entrenamiento = filas.filter((f) => f.anio !== anio);
    const prueba = filas.filter((f) => f.anio === anio);
    const vistos = new Set(entrenamiento.map(tipoDeFila));
    if (prueba.every((f) => vistos.has(tipoDeFila(f)))) return { entrenamiento, prueba, criterio: 'ANIO' as const, anio_prueba: anio };
  }
  return {
    entrenamiento: filas.filter((f) => !enPrueba(f.student_id, fraccionEstudiantes)),
    prueba: filas.filter((f) => enPrueba(f.student_id, fraccionEstudiantes)),
    criterio: 'ESTUDIANTES' as const,
    anio_prueba: null,
  };
}

export function crearRed(): NeuralNetwork<number[], number[]> {
  return new NeuralNetwork<number[], number[]>({ hiddenLayers: [...CONFIG_RED.hiddenLayers] });
}

export function cargarRed(json: RedGuardada): NeuralNetwork<number[], number[]> {
  return crearRed().fromJSON(json);
}

export function probabilidad(red: NeuralNetwork<number[], number[]>, x: number[]): number {
  const salida = red.run(x);
  const p = Number(salida[0]);
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
}

export interface OpcionesRed {
  hiddenLayers: readonly number[];
  iterations: number;
  errorThresh: number;
  learningRate: number;
}

export function entrenarYEvaluar(filas: readonly FilaEntrenamiento[], opciones: Partial<OpcionesRed> = {}): ResultadoEntrenamiento {
  const { entrenamiento, prueba, criterio, anio_prueba } = partirParaPrueba(filas);
  if (entrenamiento.length === 0) throw new Error('No hay filas para entrenar.');
  const config: OpcionesRed = { ...CONFIG_RED, ...opciones };
  const red = new NeuralNetwork<number[], number[]>({ hiddenLayers: [...config.hiddenLayers] });
  const estado = red.train(
    entrenamiento.map((f) => ({ input: f.x, output: [f.y] })),
    { iterations: config.iterations, errorThresh: config.errorThresh, learningRate: config.learningRate, log: false }
  );
  const metricas = calcularMetricas(prueba.map((f) => ({ probabilidad: probabilidad(red, f.x), real: f.y })));
  return {
    red: red.toJSON(),
    metricas,
    criterio_prueba: criterio,
    anio_prueba,
    filas_entrenamiento: entrenamiento.length,
    filas_prueba: prueba.length,
    error_entrenamiento: Math.round(estado.error * 100000) / 100000,
    iteraciones: estado.iterations,
  };
}
