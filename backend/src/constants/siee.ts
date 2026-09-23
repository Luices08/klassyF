import { ComponenteSiee } from './enums';

/**
 * Ponderacion institucional del SIEE (Decreto 1290) usada para calcular la nota
 * final de una asignatura a partir de sus 3 componentes evaluativos. Es un valor
 * institucional fijo hoy (no configurable por institucion todavia — ver README,
 * seccion "Reglas que NO deberian quedar quemadas en codigo" del documento base);
 * vive aqui, nombrado, en vez de como numeros magicos dispersos en el motor de
 * calificacion.
 */
export const SIEE_WEIGHTS: Record<ComponenteSiee, number> = {
  COGNITIVO_SABER: 0.4,
  PROCEDIMENTAL_HACER: 0.4,
  ACTITUDINAL_SER: 0.2,
};

export const DESEMPENOS_CUALITATIVOS = ['Bajo', 'Básico', 'Alto', 'Superior'] as const;
export type DesempenoCualitativo = (typeof DESEMPENOS_CUALITATIVOS)[number];
