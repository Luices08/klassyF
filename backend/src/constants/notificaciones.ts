/** Dónde puede llegar un aviso. Hoy solo la campanita se entrega; el correo queda registrado como PENDIENTE para cuando exista el envío. */
export const CANALES_ENTREGA = ['CAMPANITA', 'CORREO'] as const;
export type CanalEntrega = (typeof CANALES_ENTREGA)[number];

export const ESTADOS_ENTREGA = ['PENDIENTE', 'ENTREGADA'] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const SEVERIDADES_NOTIFICACION = ['INFO', 'IMPORTANTE', 'CRITICA'] as const;
export type SeveridadNotificacion = (typeof SEVERIDADES_NOTIFICACION)[number];

/** Canales del tablero de anuncios: lo mismo, el correo es futuro. */
export const CANALES_ANUNCIO = ['TABLERO', 'CORREO'] as const;
export type CanalAnuncio = (typeof CANALES_ANUNCIO)[number];

export const ESTADOS_ANUNCIO = ['ACTIVO', 'ARCHIVADO'] as const;
export type EstadoAnuncio = (typeof ESTADOS_ANUNCIO)[number];

export const MAX_TITULO_ANUNCIO = 120;
export const MAX_CUERPO_ANUNCIO = 2000;

/**
 * Catálogo de eventos de la campanita. El texto no se guarda: se arma al leer con `renderizarNotificacion` a partir de
 * (evento, contador, datos), así «tienes 5 entregas» pasa a «tienes 145» sin reescribir nada y no puede quedar desfasado.
 */
export const EVENTOS_NOTIFICACION = [
  'ENTREGA_NUEVA',
  'ACTIVIDAD_CALIFICADA',
  'PLAN_DEVUELTO',
  'PLAN_APROBADO',
  'DOCUMENTO_RECHAZADO',
  'BOLETIN_PUBLICADO',
  'FALTA_GRAVE',
  'CIERRE_PERIODO_PROXIMO',
] as const;
export type EventoNotificacion = (typeof EVENTOS_NOTIFICACION)[number];

interface MetadatoEvento {
  severidad: SeveridadNotificacion;
  canales: readonly CanalEntrega[];
}

export const METADATOS_EVENTO: Record<EventoNotificacion, MetadatoEvento> = {
  ENTREGA_NUEVA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  ACTIVIDAD_CALIFICADA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  PLAN_DEVUELTO: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  PLAN_APROBADO: { severidad: 'INFO', canales: ['CAMPANITA'] },
  DOCUMENTO_RECHAZADO: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  BOLETIN_PUBLICADO: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  // Una citación o falta grave llega también por correo cuando exista el envío: por eso el canal ya queda registrado.
  FALTA_GRAVE: { severidad: 'CRITICA', canales: ['CAMPANITA', 'CORREO'] },
  CIERRE_PERIODO_PROXIMO: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
};
