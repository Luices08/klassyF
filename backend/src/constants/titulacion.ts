// M19/M26: titulación de bachiller. Qué se exige para graduar es política del colegio (`PoliticaPromocion.titulacion`); aquí solo
// viven los catálogos cerrados que el código necesita conocer.

/** Título que se otorga si la institución no definió otro; es solo el valor de partida de M01. */
export const TITULO_BACHILLER_INICIAL = 'Bachiller Académico';
export const MAX_CARACTERES_TITULO_BACHILLER = 80;

/**
 * Situación de titulación de un estudiante del último grado, aparte del resultado académico del año:
 * - APROBO_NO_GRADUADO: aprobó el grado pero le falta algún requisito (servicio social, Saber 11, paz y salvo, carpeta).
 * - GRADUADO: aprobó y cumple todos los requisitos a tiempo (habilita acta de grado y diploma en M26).
 * - GRADUADO_EXTEMPORANEO: estaba APROBO_NO_GRADUADO y cumplió después (grado por ventanilla).
 */
export const ESTADOS_TITULACION = ['APROBO_NO_GRADUADO', 'GRADUADO', 'GRADUADO_EXTEMPORANEO'] as const;
export type EstadoTitulacion = (typeof ESTADOS_TITULACION)[number];

/** Estados con los que M26 puede expedir el acta de grado y el diploma. */
export const ESTADOS_TITULACION_QUE_GRADUAN: readonly EstadoTitulacion[] = ['GRADUADO', 'GRADUADO_EXTEMPORANEO'];

export const REQUISITOS_TITULACION = ['SERVICIO_SOCIAL', 'SABER_11', 'PAZ_Y_SALVO', 'CARPETA_ACADEMICA'] as const;
export type RequisitoTitulacion = (typeof REQUISITOS_TITULACION)[number];

export const NOMBRES_REQUISITO: Record<RequisitoTitulacion, string> = {
  SERVICIO_SOCIAL: 'Servicio social estudiantil obligatorio',
  SABER_11: 'Presentación de las pruebas Saber 11',
  PAZ_Y_SALVO: 'Paz y salvo institucional',
  CARPETA_ACADEMICA: 'Carpeta académica completa',
};
