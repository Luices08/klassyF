/**
 * Preescolar se evalúa de forma cualitativa y descriptiva, sin notas numéricas ni promedios (Decreto 2247 de 1997; validar la numeración con la
 * norma vigente). Cada estudiante recibe, por asignatura o dimensión y por periodo, un nivel de avance y un texto con sus fortalezas y recomendaciones.
 */
export const NIVELES_VALORACION = ['INICIADO', 'EN_PROCESO', 'ALCANZADO'] as const;
export type NivelValoracion = (typeof NIVELES_VALORACION)[number];

export const NOMBRES_NIVEL_VALORACION: Record<NivelValoracion, string> = {
  INICIADO: 'Iniciado',
  EN_PROCESO: 'En proceso',
  ALCANZADO: 'Alcanzado',
};

/** El descriptor es obligatorio: un nivel sin palabras no dice nada a la familia. */
export const MIN_CARACTERES_DESCRIPTOR = 10;
export const MAX_CARACTERES_DESCRIPTOR = 1500;
export const MAX_ESTUDIANTES_POR_GUARDADO = 80;
