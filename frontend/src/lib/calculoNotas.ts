import type { ComponenteEvaluativo } from '../types/domain';
import type { Desempeno } from '../types/reportCard';

// Espejo de backend/src/utils/calculoNotas.ts y de escalaEvaluacion#resolverDesempeno. La planilla lo usa solo para mostrar
// el resultado EN VIVO mientras el docente escribe; lo que vale (y lo que lee el boletín) es siempre lo que calcula y congela
// el servidor. Si la fórmula cambia allá, se cambia aquí en el mismo cambio.

export interface CasillaCalculo {
  id: string;
  bloque: string;
  /** % del bloque que decidió el docente; null = automático. */
  peso: number | null;
}

export interface ResultadoCalculo {
  bloques: Record<string, number | null>;
  nota: number | null;
  completa: boolean;
}

const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tolerancia al sumar porcentajes decimales (33.3 + 33.3 + 33.4). */
export const TOLERANCIA_PESOS = 0.01;

/** El peso real de cada casilla dentro de su bloque: el puesto o, para las automáticas, lo que queda del 100% por partes iguales. */
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

/** La suma de los pesos puestos en cada bloque; pasar de 100 no tiene cómo repartirse. */
export function sumaDePesosPuestos(casillas: readonly CasillaCalculo[]): Map<string, number> {
  const sumas = new Map<string, number>();
  for (const c of casillas) if (c.peso !== null) sumas.set(c.bloque, (sumas.get(c.bloque) ?? 0) + c.peso);
  return sumas;
}

export const pesoExcedido = (suma: number): boolean => suma > 100 + TOLERANCIA_PESOS;

export function calcularNotaAsignatura(
  bloques: readonly Pick<ComponenteEvaluativo, 'clave' | 'porcentaje'>[],
  casillas: readonly CasillaCalculo[],
  notas: ReadonlyMap<string, number>
): ResultadoCalculo {
  const pesos = pesosEfectivos(casillas);
  const porBloque: Record<string, number | null> = {};
  let completa = bloques.length > 0;

  for (const bloque of bloques) {
    const propias = casillas.filter((c) => c.bloque === bloque.clave);
    const calificadas = propias.filter((c) => notas.has(c.id));
    const sumaPesos = calificadas.reduce((suma, c) => suma + (pesos.get(c.id) ?? 0), 0);
    porBloque[bloque.clave] =
      calificadas.length === 0
        ? null
        : sumaPesos === 0
          ? redondear2(calificadas.reduce((suma, c) => suma + (notas.get(c.id) as number), 0) / calificadas.length)
          : redondear2(calificadas.reduce((suma, c) => suma + (notas.get(c.id) as number) * (pesos.get(c.id) ?? 0), 0) / sumaPesos);
    if (propias.length === 0 || calificadas.length < propias.length) completa = false;
  }

  const conNota = bloques.filter((b) => porBloque[b.clave] !== null);
  const sumaPorcentajes = conNota.reduce((suma, b) => suma + b.porcentaje, 0);
  const nota =
    conNota.length === 0 || sumaPorcentajes === 0
      ? null
      : redondear2(conNota.reduce((suma, b) => suma + (porBloque[b.clave] as number) * b.porcentaje, 0) / sumaPorcentajes);
  return { bloques: porBloque, nota, completa };
}

export interface EscalaPlanilla {
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
  precision_decimales: number;
  rangos: Array<{ nivel: Desempeno['nivel']; etiqueta: string; valor_minimo: number; valor_maximo: number; es_aprobatorio: boolean }>;
}

/** El nivel de una nota con la precisión de la escala; un hueco entre rangos pertenece al inferior. */
export function desempenoDe(nota: number, escala: EscalaPlanilla): Desempeno | null {
  const factor = 10 ** escala.precision_decimales;
  const redondeada = Math.round((nota + Number.EPSILON) * factor) / factor;
  const rango =
    escala.rangos.find((r) => redondeada >= r.valor_minimo && redondeada <= r.valor_maximo) ??
    [...escala.rangos].sort((a, b) => b.valor_minimo - a.valor_minimo).find((r) => redondeada >= r.valor_minimo);
  return rango ? { nota, nivel: rango.nivel, etiqueta: rango.etiqueta, aprobado: rango.es_aprobatorio } : null;
}
