/**
 * Convivencia (M14/M15). La gravedad de una falta (Tipo I, II o III) la fija la ley (Ley 1620 / Decreto 1965): es un contrato
 * del sistema. Todo lo demás (tipos de observación, faltas del manual, medidas, protocolos, entidades) es configuración de
 * cada colegio, sin datos fijos.
 */
export const TIPOS_SITUACION = ['I', 'II', 'III'] as const;
export type TipoSituacion = (typeof TIPOS_SITUACION)[number];

/** Una observación (M14, cotidiana) y una falta (el manual de convivencia) son registros distintos que van al mismo Observador. */
export const CLASES_REGISTRO = ['OBSERVACION', 'FALTA'] as const;
export type ClaseRegistro = (typeof CLASES_REGISTRO)[number];

export const CONTEXTOS_OBSERVACION = ['CLASE', 'DIRECCION_GRUPO', 'COORDINACION', 'ORIENTACION'] as const;
export type ContextoObservacion = (typeof CONTEXTOS_OBSERVACION)[number];

export const ESTADOS_OBSERVACION = ['ACTIVA', 'ANULADA'] as const;
export type EstadoObservacion = (typeof ESTADOS_OBSERVACION)[number];

export const ESTADOS_COMPROMISO = ['PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO'] as const;
export type EstadoCompromiso = (typeof ESTADOS_COMPROMISO)[number];

// Las citaciones solo se registran (quién, cómo, cuándo, resultado); el envío es de M28.
export const MEDIOS_CITACION = ['LLAMADA', 'MENSAJE', 'CORREO', 'PRESENCIAL', 'OTRO'] as const;
export type MedioCitacion = (typeof MEDIOS_CITACION)[number];

// Una falta Tipo II/III (o una Tipo I que el docente decide remitir) queda como solicitud hasta que coordinación de
// convivencia abre el caso formal (CONVERTIDA) o la descarta con motivo.
export const ESTADOS_SOLICITUD_CASO = ['PENDIENTE', 'DESCARTADA', 'CONVERTIDA'] as const;
export type EstadoSolicitudCaso = (typeof ESTADOS_SOLICITUD_CASO)[number];

export const MAX_DESCRIPCION_OBSERVACION = 2000;
export const MAX_COMPROMISO = 500;
export const MAX_ESTUDIANTES_POR_EVENTO = 60;

/** Valores iniciales de la política; cada institución los cambia en la configuración de convivencia. */
export const PLAZO_ENMIENDA_HORAS_INICIAL = 48;
export const PLAZO_ANULACION_HORAS_INICIAL = 48;

/** Tipos de observación sembrados la primera vez; después son de la institución. No se precargan faltas ni frases. */
export const TIPOS_OBSERVACION_BASE = [
  { nombre: 'Académica', visible_estudiante: true, orden: 1 },
  { nombre: 'Comportamental', visible_estudiante: true, orden: 2 },
] as const;

// --- M15: casos de convivencia ---

// El flujo es el contrato del sistema (se lee por estado, no por etiqueta). Ver TRANSICIONES_CASO en utils/casoConvivencia.ts.
export const ESTADOS_CASO = ['ABIERTO', 'EN_ATENCION', 'EN_MEDIACION', 'EN_SEGUIMIENTO', 'REMITIDO', 'CERRADO', 'REABIERTO', 'ANULADO'] as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[number];

export const RESULTADOS_CIERRE_CASO = ['SOLUCIONADO', 'DESESTIMADO', 'REMITIDO', 'MEDIDA_APLICADA'] as const;
export type ResultadoCierreCaso = (typeof RESULTADOS_CIERRE_CASO)[number];

export const ROLES_INVOLUCRADO = ['AFECTADO', 'PRESUNTO_RESPONSABLE', 'TESTIGO', 'REPORTANTE'] as const;
export type RolInvolucrado = (typeof ROLES_INVOLUCRADO)[number];

export const ORIGENES_CASO = ['SOLICITUD', 'DIRECTO'] as const;
export type OrigenCaso = (typeof ORIGENES_CASO)[number];

export const ESTADOS_PASO_PROTOCOLO = ['PENDIENTE', 'CUMPLIDO', 'NO_APLICA'] as const;
export type EstadoPasoProtocolo = (typeof ESTADOS_PASO_PROTOCOLO)[number];

export const TIPOS_NOTIFICACION_CASO = ['ACUDIENTES', 'CITACION', 'DECISION', 'OTRA'] as const;
export type TipoNotificacionCaso = (typeof TIPOS_NOTIFICACION_CASO)[number];

export const PARTES_DESCARGO = ['ESTUDIANTE', 'ACUDIENTE'] as const;
export type ParteDescargo = (typeof PARTES_DESCARGO)[number];

// --- M15 → orientación: remisión de un estudiante a psicología/orientación ---

export const ESTADOS_REMISION_ORIENTACION = ['PENDIENTE', 'EN_ATENCION', 'ATENDIDA'] as const;
export type EstadoRemisionOrientacion = (typeof ESTADOS_REMISION_ORIENTACION)[number];

/** Una remisión nace de una medida o de un paso del protocolo marcados por el colegio, o la hace convivencia a mano. */
export const ORIGENES_REMISION_ORIENTACION = ['MEDIDA', 'PASO', 'MANUAL'] as const;
export type OrigenRemisionOrientacion = (typeof ORIGENES_REMISION_ORIENTACION)[number];

/** A quiénes de un caso se remite automáticamente: a quien resultó afectado y a quien presuntamente lo causó. */
export const ROLES_QUE_SE_REMITEN: readonly RolInvolucrado[] = ['AFECTADO', 'PRESUNTO_RESPONSABLE'];

/** Valor inicial de la política; la institución lo cambia. Pasado este plazo sin remisión, un caso tipo III muestra alerta. */
export const PLAZO_REMISION_TIPO_III_HORAS_INICIAL = 24;

// --- M15: comité de convivencia ---

export const TIPOS_SESION_COMITE = ['ORDINARIA', 'EXTRAORDINARIA'] as const;
export type TipoSesionComite = (typeof TIPOS_SESION_COMITE)[number];

// Un acta nace en BORRADOR (editable, sin consecutivo) y al firmarse queda inmutable; las correcciones son anexos.
export const ESTADOS_SESION_COMITE = ['BORRADOR', 'FIRMADA', 'ANULADA'] as const;
export type EstadoSesionComite = (typeof ESTADOS_SESION_COMITE)[number];

/** Valor inicial de la política (porcentaje de miembros presentes para deliberar); cada institución lo ajusta. */
export const QUORUM_PORCENTAJE_INICIAL = 51;
