export const TIPOS_CITACION = ['GENERAL', 'PARTICULAR'] as const;
export type TipoCitacion = (typeof TIPOS_CITACION)[number];

export const MOTIVOS_CITACION = ['ENTREGA_BOLETINES', 'ACADEMICO', 'COMPORTAMENTAL', 'OTRO'] as const;
export type MotivoCitacion = (typeof MOTIVOS_CITACION)[number];

export const NOMBRES_MOTIVO_CITACION: Record<MotivoCitacion, string> = {
  ENTREGA_BOLETINES: 'Entrega de boletines',
  ACADEMICO: 'Seguimiento académico',
  COMPORTAMENTAL: 'Seguimiento comportamental',
  OTRO: 'Otro',
};

export const ESTADOS_CITACION = ['PROGRAMADA', 'REALIZADA', 'CANCELADA'] as const;
export type EstadoCitacion = (typeof ESTADOS_CITACION)[number];

export const RESPUESTAS_ASISTENCIA = ['PENDIENTE', 'CONFIRMADA', 'NO_ASISTIRA'] as const;
export type RespuestaAsistencia = (typeof RESPUESTAS_ASISTENCIA)[number];
/** Lo que puede elegir el acudiente (PENDIENTE solo es el punto de partida). */
export const RESPUESTAS_DEL_ACUDIENTE = ['CONFIRMADA', 'NO_ASISTIRA'] as const;

export const CANALES_RESPUESTA = ['CORREO', 'PORTAL'] as const;
export type CanalRespuesta = (typeof CANALES_RESPUESTA)[number];

export const MAX_TITULO_CITACION = 120;
export const MAX_DESCRIPCION_CITACION = 1500;
export const MAX_LUGAR_CITACION = 160;
export const MAX_MOTIVO_CANCELACION = 300;
/** Una citación general no puede abarcar más grupos que esto: evita lanzar cientos de correos por un clic equivocado. */
export const MAX_GRUPOS_POR_CITACION = 30;

// --- Cola de correo ---
export const TIPOS_CORREO = ['CITACION_NUEVA', 'CITACION_ACTUALIZADA', 'CITACION_CANCELADA', 'AVISO_INASISTENCIA', 'AVISO_BOLETIN'] as const;
export type TipoCorreo = (typeof TIPOS_CORREO)[number];

/** OMITIDO: ya no tenía sentido enviarlo (la citación se canceló o pasó antes de que le tocara el turno). */
export const ESTADOS_CORREO = ['PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO', 'OMITIDO'] as const;
export type EstadoCorreo = (typeof ESTADOS_CORREO)[number];

export const MAX_INTENTOS_CORREO = 5;
/** Espera antes del reintento n (minutos); el último valor se repite. */
export const ESPERA_REINTENTO_MINUTOS = [1, 5, 15, 60] as const;
/** Cuánto se reserva un correo mientras se envía; si el proceso muere, otro lo retoma pasado este tiempo. */
export const MINUTOS_RESERVA_CORREO = 2;
export const CORREOS_POR_TANDA = 50;
export const CORREOS_EN_PARALELO = 5;
export const SEGUNDOS_ENTRE_TANDAS = 10;
