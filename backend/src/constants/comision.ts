// M20: Comisión de Evaluación y Promoción. Quién delibera, cuántos votos hacen falta y desde cuándo un estudiante está en riesgo lo define cada
// colegio (su SIEE): aquí solo viven los catálogos cerrados y los valores de partida de `ConfiguracionComision`.
import { DECISIONES_ANTICIPADA } from './promocionAnticipada';

/** Un solo motor de sesiones para las tres instancias colegiadas que intervienen en la promoción (Decreto 1290/2009 art. 11 y SIEE). */
export const INSTANCIAS_SESION = ['COMISION_EVALUACION', 'CONSEJO_ACADEMICO', 'CONSEJO_DIRECTIVO'] as const;
export type InstanciaSesion = (typeof INSTANCIAS_SESION)[number];

export const NOMBRES_INSTANCIA: Record<InstanciaSesion, string> = {
  COMISION_EVALUACION: 'Comisión de Evaluación y Promoción',
  CONSEJO_ACADEMICO: 'Consejo Académico',
  CONSEJO_DIRECTIVO: 'Consejo Directivo',
};

/** Prefijo del consecutivo anual del acta: `ACE-2026-001`. */
export const PREFIJO_ACTA: Record<InstanciaSesion, string> = {
  COMISION_EVALUACION: 'ACE',
  CONSEJO_ACADEMICO: 'ACA',
  CONSEJO_DIRECTIVO: 'ACD',
};

/**
 * BORRADOR → CONVOCADA (orden del día y citación) → REALIZADA (asistencia, deliberación y votos cerrados, con quórum) → FIRMADA (cada asistente
 * con usuario confirmó con su contraseña; nace el consecutivo y la huella, y las decisiones aprobadas pasan a M19). ANULADA solo por el ADMIN.
 */
export const ESTADOS_SESION = ['BORRADOR', 'CONVOCADA', 'REALIZADA', 'FIRMADA', 'ANULADA'] as const;
export type EstadoSesion = (typeof ESTADOS_SESION)[number];

export const REPRESENTACIONES = ['DIRECTIVO', 'DOCENTE', 'ORIENTACION', 'PADRES', 'ESTUDIANTES', 'OTRO'] as const;
export type Representacion = (typeof REPRESENTACIONES)[number];

/**
 * SEGUIMIENTO: caso de alerta temprana (solo compromisos). PROMOCION: caso del cierre anual, cuya decisión pasa a M19 al firmar el acta.
 * PROMOCION_ANTICIPADA: un trámite de promoción anticipada (la comisión recomienda, el Consejo Directivo decide); su decisión pasa al trámite.
 */
export const TIPOS_CASO = ['SEGUIMIENTO', 'PROMOCION', 'PROMOCION_ANTICIPADA'] as const;
export type TipoCaso = (typeof TIPOS_CASO)[number];

/** Lo que la instancia puede decidir sobre un estudiante en el cierre anual, y el resultado académico (M19) que produce. */
export const DECISIONES_CASO = ['PROMOVER', 'NO_PROMOVER', 'PROMOVER_CON_ARRASTRE', 'ENVIAR_A_RECUPERACION'] as const;
export type DecisionCaso = (typeof DECISIONES_CASO)[number];

/** Las decisiones de un caso de cualquier tipo; cuáles admite cada caso lo decide el servicio. */
export const TODAS_LAS_DECISIONES = [...DECISIONES_CASO, ...DECISIONES_ANTICIPADA] as const;
export type DecisionDeCaso = (typeof TODAS_LAS_DECISIONES)[number];

export const VOTOS = ['A_FAVOR', 'EN_CONTRA', 'ABSTENCION'] as const;
export type Voto = (typeof VOTOS)[number];

export const RESPONSABLES_COMPROMISO = ['ACUDIENTE', 'ESTUDIANTE', 'DOCENTE', 'INSTITUCION'] as const;
export type ResponsableCompromiso = (typeof RESPONSABLES_COMPROMISO)[number];
export const ESTADOS_COMPROMISO = ['PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO'] as const;
export type EstadoCompromiso = (typeof ESTADOS_COMPROMISO)[number];

export const NIVELES_RIESGO = ['VERDE', 'AMARILLO', 'NARANJA', 'ROJO'] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number];

/** SIMPLE: más votos a favor que en contra. ABSOLUTA: más de la mitad de quienes pueden votar el caso. */
export const MAYORIAS = ['SIMPLE', 'ABSOLUTA'] as const;
export type Mayoria = (typeof MAYORIAS)[number];

/** TODOS: firman todos los asistentes con usuario del sistema. PRESIDENTE: basta quien preside (los demás firman en papel). */
export const FIRMAS_REQUERIDAS = ['TODOS_LOS_ASISTENTES', 'SOLO_PRESIDENTE'] as const;
export type FirmasRequeridas = (typeof FIRMAS_REQUERIDAS)[number];

export const MAX_MIEMBROS_SESION = 40;
export const MAX_CASOS_SESION = 300;
export const MAX_TEXTO_SESION = 8000;
export const MAX_TEXTO_CASO = 3000;
