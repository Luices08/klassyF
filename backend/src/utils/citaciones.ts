import crypto from 'crypto';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { ESPERA_REINTENTO_MINUTOS, EstadoCitacion, EstadoCorreo, MAX_INTENTOS_CORREO, TipoCitacion } from '../constants/citaciones';

/** 128 bits al azar, en hexadecimal: es lo que viaja en el enlace del correo. */
export const generarTokenCitacion = (): string => crypto.randomBytes(16).toString('hex');

/**
 * Quién puede convocar a quién. ADMIN y COORDINADOR convocan a cualquier grupo o estudiante del año; un DOCENTE convoca a todo un grupo
 * solo si es su director de grupo, y a un estudiante concreto si dicta clase o dirige el grupo donde está matriculado. Orientación y coordinación de convivencia citan
 * a los acudientes de **un estudiante** (nunca a un grupo entero): los grupos que se les ofrecen ya son solo los de sus sedes.
 */
export function puedeConvocar(rol: Rol, tipo: TipoCitacion, grupo: { es_director: boolean }): boolean {
  if (rol === ROLES.ADMIN || rol === ROLES.COORDINADOR) return true;
  if (rol === ROLES.ORIENTADOR || rol === ROLES.COORDINADOR_CONVIVENCIA) return tipo === 'PARTICULAR';
  if (rol !== ROLES.DOCENTE) return false;
  return tipo === 'GENERAL' ? grupo.es_director : true;
}

export interface VinculoAcudiente {
  guardian_id: string;
  es_principal: boolean;
  activo: boolean;
}

/**
 * A quién se cita por un estudiante: por defecto al acudiente principal (el responsable legal que recibe las citaciones, M03), para no
 * mandar dos correos a la misma familia. Si no hay principal activo, o se pidió expresamente, a todos los acudientes activos.
 */
export function elegirAcudientes(vinculos: readonly VinculoAcudiente[], todos: boolean): string[] {
  const activos = vinculos.filter((v) => v.activo);
  if (!todos) {
    const principal = activos.find((v) => v.es_principal);
    if (principal) return [principal.guardian_id];
  }
  return activos.map((v) => v.guardian_id);
}

export interface EstadoParaResponder {
  estado: EstadoCitacion;
  fecha_hora: Date;
}

/** La familia responde mientras la citación esté programada y no haya empezado. Después ya no tiene sentido confirmar ni cancelar. */
export function evaluarRespuesta(citacion: EstadoParaResponder, ahora: Date): { puede: boolean; motivo: string | null } {
  if (citacion.estado === 'CANCELADA') return { puede: false, motivo: 'La citación fue cancelada.' };
  if (citacion.estado === 'REALIZADA') return { puede: false, motivo: 'La reunión ya se realizó.' };
  if (citacion.fecha_hora.getTime() <= ahora.getTime()) return { puede: false, motivo: 'La reunión ya comenzó o pasó su hora.' };
  return { puede: true, motivo: null };
}

/** Una citación solo se programa hacia adelante. */
export const esFechaFutura = (fecha: Date, ahora: Date): boolean => fecha.getTime() > ahora.getTime();

/**
 * Lo que se ve del correo de un acudiente en la lista de quien convocó. `NO_ENVIADO` es el caso sin cola: el servidor no tiene correo
 * configurado o la citación se creó antes de tenerlo; se resuelve con «Reenviar» una vez configurado.
 */
export type SituacionCorreo = 'SIN_CORREO' | 'NO_ENVIADO' | 'EN_COLA' | 'ENVIADO' | 'FALLIDO' | 'OMITIDO';

export function situacionDeCorreo(tieneEmail: boolean, estadoCola: EstadoCorreo | null): SituacionCorreo {
  if (!tieneEmail) return 'SIN_CORREO';
  if (estadoCola === null) return 'NO_ENVIADO';
  if (estadoCola === 'PENDIENTE' || estadoCola === 'ENVIANDO') return 'EN_COLA';
  return estadoCola;
}

/** Cuándo se reintenta tras el fallo número `intentos` (1 = el primero). */
export function proximoIntento(intentos: number, ahora: Date): Date {
  const indice = Math.min(Math.max(intentos, 1), ESPERA_REINTENTO_MINUTOS.length) - 1;
  return new Date(ahora.getTime() + (ESPERA_REINTENTO_MINUTOS[indice] as number) * 60_000);
}

/** Tras un fallo: se reintenta hasta `MAX_INTENTOS_CORREO` y entonces queda FALLIDO a la vista de quien convocó. */
export const estadoTrasFallo = (intentos: number): 'PENDIENTE' | 'FALLIDO' => (intentos >= MAX_INTENTOS_CORREO ? 'FALLIDO' : 'PENDIENTE');

/** La descripción de una citación particular puede hablar del comportamiento o las notas de un menor: no viaja por correo ni por el enlace público. */
export const descripcionViajaPorCorreo = (tipo: TipoCitacion): boolean => tipo === 'GENERAL';

/** Un correo con forma de correo. No pretende validar el estándar completo, solo no encolar basura. */
export const parecerCorreo = (valor: string | undefined | null): boolean => Boolean(valor && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim()));
