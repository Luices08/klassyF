export const ESTADOS_PAZ_Y_SALVO = ['CARGADO', 'CONFIRMADO', 'RECHAZADO'] as const;
export type EstadoPazYSalvo = (typeof ESTADOS_PAZ_Y_SALVO)[number];

/** `SIN_CARGAR` no se guarda: es el estudiante que todavía no tiene registro. */
export const FILTROS_ESTADO_PAZ_Y_SALVO = ['SIN_CARGAR', ...ESTADOS_PAZ_Y_SALVO] as const;
export type FiltroEstadoPazYSalvo = (typeof FILTROS_ESTADO_PAZ_Y_SALVO)[number];

/** Marca que deja la aprobación automática del checklist de matrícula cuando el paz y salvo ya estaba confirmado. */
export const COMENTARIO_APROBACION_AUTOMATICA = 'Aprobado automáticamente: paz y salvo de fin de año confirmado.';
