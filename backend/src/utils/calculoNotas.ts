import { MetodoCalculoEvaluacion } from '../constants/enums';
import { EstadoNota } from '../constants/notas';
import { round2 } from './siee';

/**
 * Motor de cálculo de M12 (funciones puras): de las notas de las casillas llega a la nota de la asignatura, y de las
 * asignaturas a la del área. Lo usan la planilla, el cierre, el Excel y el boletín (M17): una sola fórmula.
 *
 * Vocabulario: el MOLDE del colegio divide el 100% de la nota en BLOQUES (Heteroevaluación 70%, Autoevaluación 15%...).
 * Cada bloque tiene CASILLAS: las actividades de M11 y las notas sueltas que el docente crea. Dentro de un bloque cada
 * casilla puede llevar un PESO (% del bloque) o dejarlo automático.
 * `null` significa «falta nota», nunca 0: un 0 es una nota.
 */

export interface BloqueCalculo {
  clave: string;
  porcentaje: number;
}

export interface CasillaCalculo {
  id: string;
  bloque: string;
  /** % del bloque que decidió el docente; null = automático. */
  peso: number | null;
}

export interface EntradaNotaAsignatura {
  bloques: readonly BloqueCalculo[];
  casillas: readonly CasillaCalculo[];
  /** Notas del estudiante: id de casilla -> nota (solo las ya puestas). */
  notas: ReadonlyMap<string, number>;
}

export interface NotaBloque {
  clave: string;
  nota: number | null;
  /** El bloque tiene al menos una casilla y todas están calificadas. */
  completo: boolean;
}

export interface ResultadoAsignatura {
  bloques: NotaBloque[];
  /** Promedio ponderado de los bloques que ya tienen nota: parcial mientras `completa` sea false. */
  nota: number | null;
  completa: boolean;
  /** Claves de los bloques que aún no están completos. */
  faltantes: string[];
}

/** Tolerancia al sumar porcentajes decimales (33.3 + 33.3 + 33.4). */
const TOLERANCIA = 0.01;

/**
 * El peso real de cada casilla dentro de su bloque: el que el docente puso o, para las que quedaron en automático, lo que
 * queda del 100% repartido por partes iguales. Sin ningún peso puesto, todas valen lo mismo.
 */
export function pesosEfectivos(casillas: readonly CasillaCalculo[]): Map<string, number> {
  const pesos = new Map<string, number>();
  const porBloque = new Map<string, CasillaCalculo[]>();
  for (const c of casillas) porBloque.set(c.bloque, [...(porBloque.get(c.bloque) ?? []), c]);

  for (const propias of porBloque.values()) {
    const puestas = propias.filter((c) => c.peso !== null);
    const automaticas = propias.filter((c) => c.peso === null);
    const restante = Math.max(0, 100 - puestas.reduce((suma, c) => suma + (c.peso as number), 0));
    for (const c of puestas) pesos.set(c.id, c.peso as number);
    for (const c of automaticas) pesos.set(c.id, restante / automaticas.length);
  }
  return pesos;
}

/** Los bloques cuyos pesos puestos suman más de 100: no hay cómo repartirlos. */
export function bloquesConPesoExcedido(casillas: readonly CasillaCalculo[]): Array<{ bloque: string; suma: number }> {
  const sumas = new Map<string, number>();
  for (const c of casillas) if (c.peso !== null) sumas.set(c.bloque, (sumas.get(c.bloque) ?? 0) + c.peso);
  return [...sumas.entries()].filter(([, suma]) => suma > 100 + TOLERANCIA).map(([bloque, suma]) => ({ bloque, suma: round2(suma) }));
}

/** Promedio de las casillas calificadas de un bloque, ponderado por su peso; si todos los pesos son 0 se promedian por igual. */
function promedioDeBloque(propias: readonly CasillaCalculo[], notas: ReadonlyMap<string, number>, pesos: ReadonlyMap<string, number>): number | null {
  const calificadas = propias.filter((c) => notas.has(c.id));
  if (calificadas.length === 0) return null;

  const sumaPesos = calificadas.reduce((suma, c) => suma + (pesos.get(c.id) ?? 0), 0);
  if (sumaPesos === 0) return round2(calificadas.reduce((suma, c) => suma + (notas.get(c.id) as number), 0) / calificadas.length);
  return round2(calificadas.reduce((suma, c) => suma + (notas.get(c.id) as number) * (pesos.get(c.id) ?? 0), 0) / sumaPesos);
}

export function calcularNotaAsignatura(entrada: EntradaNotaAsignatura): ResultadoAsignatura {
  const pesos = pesosEfectivos(entrada.casillas);

  const bloques: NotaBloque[] = entrada.bloques.map((bloque) => {
    const propias = entrada.casillas.filter((c) => c.bloque === bloque.clave);
    const todasConNota = propias.length > 0 && propias.every((c) => entrada.notas.has(c.id));
    return { clave: bloque.clave, nota: promedioDeBloque(propias, entrada.notas, pesos), completo: todasConNota };
  });

  const porcentajeDe = new Map(entrada.bloques.map((b) => [b.clave, b.porcentaje]));
  const conNota = bloques.filter((b) => b.nota !== null);
  const sumaPorcentajes = conNota.reduce((suma, b) => suma + (porcentajeDe.get(b.clave) ?? 0), 0);
  const nota =
    conNota.length === 0 || sumaPorcentajes === 0
      ? null
      : round2(conNota.reduce((suma, b) => suma + (b.nota as number) * (porcentajeDe.get(b.clave) ?? 0), 0) / sumaPorcentajes);

  return {
    bloques,
    nota,
    completa: bloques.length > 0 && bloques.every((b) => b.completo),
    faltantes: bloques.filter((b) => !b.completo).map((b) => b.clave),
  };
}

/** Mientras no se cierre, la nota está PENDIENTE (faltan notas) o en BORRADOR (completa, aún editable). */
export function estadoAbiertoDe(resultado: Pick<ResultadoAsignatura, 'completa'>): Extract<EstadoNota, 'PENDIENTE' | 'BORRADOR'> {
  return resultado.completa ? 'BORRADOR' : 'PENDIENTE';
}

export interface AsignaturaParaArea {
  nota: number | null;
  /** Solo cuenta con el método PONDERADO (M06); con ARITMETICO todas pesan igual. */
  porcentaje: number | null;
}

/** Nota del área según el método configurado en M06. Si falta la nota de alguna asignatura, el área no se calcula. */
export function calcularNotaArea(asignaturas: readonly AsignaturaParaArea[], metodo: MetodoCalculoEvaluacion): number | null {
  if (asignaturas.length === 0 || asignaturas.some((a) => a.nota === null)) return null;
  if (metodo === 'PONDERADO') {
    return round2(asignaturas.reduce((suma, a) => suma + (a.nota as number) * ((a.porcentaje ?? 0) / 100), 0));
  }
  return round2(asignaturas.reduce((suma, a) => suma + (a.nota as number), 0) / asignaturas.length);
}

/** Promedio aritmético de las notas de área; sin todas las áreas no hay promedio general. */
export function calcularPromedioGeneral(notasArea: ReadonlyArray<number | null>): number | null {
  if (notasArea.length === 0 || notasArea.some((n) => n === null)) return null;
  return round2((notasArea as number[]).reduce((suma, n) => suma + n, 0) / notasArea.length);
}
