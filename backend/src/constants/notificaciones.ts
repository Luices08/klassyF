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
  'INASISTENCIA_REGISTRADA',
  'OBSERVACION_REGISTRADA',
  'ACTIVIDAD_NUEVA',
  'JUSTIFICACION_REVISADA',
  'RECORDATORIO_CALENDARIO',
  'CITACION_NUEVA',
  'CITACION_REPROGRAMADA',
  'CITACION_CANCELADA',
  'CITACION_RESPONDIDA',
  'SESION_COMISION_CONVOCADA',
  'NOTICIA_NUEVA',
  'RECUPERACION_FECHAS',
  'RECUPERACION_INICIA',
  'RECUPERACION_TERMINA_MANANA',
  'RECUPERACION_HABILITADA',
  'RECUPERACION_REGISTRADA',
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
  INASISTENCIA_REGISTRADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  OBSERVACION_REGISTRADA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  ACTIVIDAD_NUEVA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  JUSTIFICACION_REVISADA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  RECORDATORIO_CALENDARIO: { severidad: 'INFO', canales: ['CAMPANITA'] },
  // El correo de una citación no pasa por aquí: lo envía la cola de M24 (`colaCorreo.service`), que sí reintenta y lleva su propio estado.
  CITACION_NUEVA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  CITACION_REPROGRAMADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  CITACION_CANCELADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  CITACION_RESPONDIDA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  SESION_COMISION_CONVOCADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  // Una noticia o evento nuevo es informativo: no interrumpe como una falta grave.
  NOTICIA_NUEVA: { severidad: 'INFO', canales: ['CAMPANITA'] },
  // M18: lo que se avisa de las recuperaciones. Las fechas son informativas; el inicio, el cierre y el resultado sí piden atención.
  RECUPERACION_FECHAS: { severidad: 'INFO', canales: ['CAMPANITA'] },
  RECUPERACION_INICIA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  RECUPERACION_TERMINA_MANANA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  RECUPERACION_HABILITADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
  RECUPERACION_REGISTRADA: { severidad: 'IMPORTANTE', canales: ['CAMPANITA'] },
};

/**
 * Pestaña de un contador del portal del acudiente: el portal muestra un hijo a la vez, así que el punto de «Inasistencias» de un hijo
 * no se apaga al abrir esa pestaña de otro (`inasistencias-<id del estudiante>`; el frontend arma la misma clave).
 */
/**
 * Contadores de M11 que se ven en los botones de cada clase: el docente ve un punto en cada grupo con entregas nuevas
 * (`clase-<id de la asignación>` en `/docente/actividades`) y el estudiante en cada asignatura con actividades nuevas
 * (`pendientes-<id de la asignatura>` en `/mis-actividades`). El frontend arma las mismas claves.
 */
export const pestanaDeClase = (asignacionId: { toString(): string }) => `clase-${asignacionId.toString()}`;
export const pestanaDeAsignatura = (asignaturaId: { toString(): string }) => `pendientes-${asignaturaId.toString()}`;

export const pestanaDeHijo = (pestana: string, estudianteId: { toString(): string }) => `${pestana}-${estudianteId.toString()}`;
