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

/**
 * La titulación de bachiller es solo del grado 11 (Ley 115/1994: el título lo otorga la educación media). No es configurable: transición,
 * 5° y 9° culminan un ciclo y se certifican desde M26 tras la promoción regular, nunca por aquí. `PoliticaTitulacion.grado_titulacion`
 * se conserva en los datos por compatibilidad pero se ignora: siempre vale esto.
 */
export const GRADO_TITULACION = 11;

/** Los grados en que se presta el servicio social estudiantil obligatorio (décimo y once). */
export const GRADOS_SERVICIO_SOCIAL: readonly number[] = [10, GRADO_TITULACION];

/**
 * Servicio social estudiantil obligatorio (Ley 115/1994 art. 97, Res. 4210/1996): se presta en los grados 10 y 11 y cada tanda de horas lleva su
 * soporte (certificado de la entidad). Solo suman las horas con soporte verificado; `HEREDADO` son las tandas registradas antes de que existiera
 * el soporte: siguen contando para no devolver a nadie a «pendiente de grado», y Secretaría puede adjuntarles el soporte después.
 */
export const VERIFICACIONES_SERVICIO_SOCIAL = ['PENDIENTE', 'VERIFICADO', 'RECHAZADO', 'HEREDADO'] as const;
export type VerificacionServicioSocial = (typeof VERIFICACIONES_SERVICIO_SOCIAL)[number];
export const VERIFICACIONES_QUE_CUENTAN: readonly VerificacionServicioSocial[] = ['VERIFICADO', 'HEREDADO'];
export const GRADO_MINIMO_SERVICIO_SOCIAL = 10;
export const MAX_BYTES_SOPORTE_SERVICIO_SOCIAL = 5 * 1024 * 1024;

/**
 * Número de registro de la prueba Saber 11 ante el ICFES: «AC» y de 8 a 12 dígitos. Hay dos formas en uso: `AC` + 8 dígitos (AC23245678) y `AC` + año de 4
 * dígitos + 8 dígitos (AC202612345678). Se guarda en mayúsculas y sin espacios ni guiones.
 */
export const PATRON_REGISTRO_SABER_11 = /^AC\d{8,12}$/;

/** Quita lo que no es parte del número (espacios, guiones, puntos) y lo pasa a mayúsculas. */
export const normalizarRegistroSaber11 = (texto: string): string => texto.replace(/[\s.-]+/g, '').toUpperCase();

/** Cómo se le dice al usuario cada situación (el valor interno no cambia). */
export const ETIQUETA_ESTADO_TITULACION: Record<EstadoTitulacion, string> = {
  APROBO_NO_GRADUADO: 'Pendiente de grado',
  GRADUADO: 'Graduado',
  GRADUADO_EXTEMPORANEO: 'Graduado extemporáneo',
};

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
