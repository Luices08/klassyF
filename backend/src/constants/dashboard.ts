/** Cuánto tiempo se reutiliza lo que ya se calculó para un dashboard: es lo que hace que «tiempo real» sean datos de hace un par de minutos como máximo. */
export const TTL_DASHBOARD_MS = 90_000;

/** Cuántas filas de cada ranking trae un dashboard; el detalle completo vive en su pantalla de origen. */
export const LIMITE_RANKING_DASHBOARD = 8;

/** Los resultados de promoción con los que un estudiante aprueba el año (los tres tipos de promovido de M19). */
export const RESULTADOS_APROBATORIOS = ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE'] as const;
