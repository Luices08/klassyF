/**
 * Convivencia (M14/M15). Los tipos de situación I/II/III los fija la ley (Ley 1620 / Decreto 1965): son un contrato del
 * sistema. Todo lo demás (tipos de observación, faltas, categorías) es configuración de cada colegio, sin datos fijos.
 */
export const FAMILIAS_OBSERVACION = ['ACADEMICA', 'COMPORTAMENTAL', 'DISCIPLINARIA'] as const;
export type FamiliaObservacion = (typeof FAMILIAS_OBSERVACION)[number];

export const TIPOS_SITUACION = ['I', 'II', 'III'] as const;
export type TipoSituacion = (typeof TIPOS_SITUACION)[number];

export const CONTEXTOS_OBSERVACION = ['CLASE', 'DIRECCION_GRUPO', 'COORDINACION'] as const;
export type ContextoObservacion = (typeof CONTEXTOS_OBSERVACION)[number];

export const ESTADOS_OBSERVACION = ['ACTIVA', 'ANULADA'] as const;
export type EstadoObservacion = (typeof ESTADOS_OBSERVACION)[number];

export const RESPONSABLES_COMPROMISO = ['ESTUDIANTE', 'ACUDIENTE', 'DOCENTE', 'INSTITUCION'] as const;
export type ResponsableCompromiso = (typeof RESPONSABLES_COMPROMISO)[number];

// VENCIDO no es un estado: se calcula por la fecha límite (un compromiso pendiente cuya fecha ya pasó).
export const ESTADOS_COMPROMISO = ['PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO'] as const;
export type EstadoCompromiso = (typeof ESTADOS_COMPROMISO)[number];

// Las citaciones solo se registran (quién, cómo, cuándo, resultado); el envío es de M28.
export const MEDIOS_CITACION = ['LLAMADA', 'MENSAJE', 'CORREO', 'PRESENCIAL', 'OTRO'] as const;
export type MedioCitacion = (typeof MEDIOS_CITACION)[number];

// Una situación II/III (o una disciplinaria que un docente pide escalar) queda como solicitud hasta que coordinación
// de convivencia la atienda. M15 agrega CONVERTIDA al abrir el caso.
export const ESTADOS_SOLICITUD_CASO = ['PENDIENTE', 'DESCARTADA'] as const;
export type EstadoSolicitudCaso = (typeof ESTADOS_SOLICITUD_CASO)[number];
export const ORIGENES_SOLICITUD_CASO = ['AUTOMATICA', 'MANUAL'] as const;
export type OrigenSolicitudCaso = (typeof ORIGENES_SOLICITUD_CASO)[number];

export const MAX_COMENTARIO_OBSERVACION = 2000;
export const MAX_ESTUDIANTES_POR_EVENTO = 60;

/** Valores iniciales de la política; cada institución los cambia en la configuración de convivencia. */
export const PLAZO_ENMIENDA_HORAS_INICIAL = 48;
export const PLAZO_ANULACION_HORAS_INICIAL = 48;

/** Tipos de observación sembrados la primera vez; después son de la institución. Sin faltas ni frases precargadas. */
export const TIPOS_OBSERVACION_BASE = [
  { nombre: 'Académica', familia: 'ACADEMICA', visible_estudiante: true, orden: 1 },
  { nombre: 'Comportamental', familia: 'COMPORTAMENTAL', visible_estudiante: true, orden: 2 },
  { nombre: 'Disciplinaria', familia: 'DISCIPLINARIA', visible_estudiante: false, orden: 3 },
] as const;
