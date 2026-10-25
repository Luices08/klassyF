/**
 * Criterios con que se decide quién obtiene cupo cuando los promovidos superan los del grado destino (rematrícula, M19 → M04). El colegio
 * elige cuáles aplican y en qué orden (`ConfiguracionRematricula`); aquí solo vive el catálogo que el código sabe evaluar.
 * - PROMEDIO_GENERAL: mayor promedio del año primero (sale del cierre de promoción de M19).
 * - ANTIGUEDAD: más años de matrícula en el plantel primero.
 * - SIN_FALTAS_GRAVES: quien no tiene faltas tipo II o III en el año primero (también sale del cierre de M19; nunca se muestra el detalle).
 */
export const CRITERIOS_DESEMPATE = ['PROMEDIO_GENERAL', 'ANTIGUEDAD', 'SIN_FALTAS_GRAVES'] as const;
export type CriterioDesempate = (typeof CRITERIOS_DESEMPATE)[number];

export interface CriterioConfigurado {
  criterio: CriterioDesempate;
  activo: boolean;
}

/** Valor de partida de la primera instalación; desde ahí es del colegio. */
export const CRITERIOS_INICIALES: CriterioConfigurado[] = CRITERIOS_DESEMPATE.map((criterio) => ({ criterio, activo: true }));

/** Cuánta diferencia de ocupación (en puntos porcentuales) se tolera entre grupos paralelos antes de privilegiar el balance de repitentes, edades e inclusión. */
export const TOLERANCIA_OCUPACION_POR_DEFECTO = 10;

export const ESTADOS_ESPERA_REMATRICULA = ['EN_ESPERA', 'ASIGNADA', 'DESCARTADA'] as const;
export type EstadoEsperaRematricula = (typeof ESTADOS_ESPERA_REMATRICULA)[number];
