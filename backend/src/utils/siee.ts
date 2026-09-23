import { DesempenoCualitativo } from '../constants/siee';

/**
 * Homologacion de la escala numerica institucional (1.0-5.0) a la escala
 * cualitativa nacional, segun los cortes del Decreto 1290:
 *   1.0-2.9 -> Bajo | 3.0-3.9 -> Básico | 4.0-4.5 -> Alto | 4.6-5.0 -> Superior
 */
export function desempenoCualitativo(nota: number): DesempenoCualitativo {
  if (nota >= 4.6) return 'Superior';
  if (nota >= 4.0) return 'Alto';
  if (nota >= 3.0) return 'Básico';
  return 'Bajo';
}

/** Redondeo a 2 decimales para todas las notas expuestas en el boletin. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
