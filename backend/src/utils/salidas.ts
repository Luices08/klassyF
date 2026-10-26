import {
  AccionPazYSalvoSalida,
  EstadoPazYSalvoSalida,
  MIN_LONGITUD_MOTIVO_SALIDA,
  PoliticaCupoSalida,
} from '../constants/salidas';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

const MS_DIA = 24 * 60 * 60 * 1000;

/** «2026-03-14» (o un Date a medianoche UTC) a medianoche UTC: así se guardan todas las fechas de calendario del sistema. */
export function aDiaDeCalendario(valor: string | Date): Date {
  const fecha = typeof valor === 'string' ? new Date(`${valor.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  return fecha;
}

/** El día de calendario en que está `ahora` en Colombia (UTC-5), a medianoche UTC. */
export function hoyEnColombia(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * El día de la matrícula. Una fecha de calendario (medianoche UTC, como se guardan las de este sistema) se deja como está; el instante en que se formalizó
 * (`new Date()`, UTC) se pasa al día de Colombia: después de las 7 p.m. el día UTC ya es el siguiente.
 */
function diaDeLaMatricula(fechaMatricula: Date): Date {
  const esFechaDeCalendario = fechaMatricula.getTime() % MS_DIA === 0;
  return esFechaDeCalendario ? aDiaDeCalendario(fechaMatricula) : hoyEnColombia(fechaMatricula);
}

/**
 * La fecha efectiva de la salida: no puede ser futura (la desvinculación es inmediata, no programada) ni anterior al día en que se
 * formalizó la matrícula. Devuelve el motivo del rechazo o null si es válida.
 */
export function motivoFechaEfectivaInvalida(fecha: Date, fechaMatricula: Date, hoy: Date = hoyEnColombia()): string | null {
  if (Number.isNaN(fecha.getTime())) return 'La fecha efectiva no es una fecha válida.';
  if (fecha.getTime() > hoy.getTime()) return 'La fecha efectiva de la salida no puede ser futura: el estudiante se desvincula del aula desde que se registra.';
  if (fecha.getTime() < diaDeLaMatricula(fechaMatricula).getTime()) return 'La fecha efectiva no puede ser anterior a la fecha de la matrícula.';
  return null;
}

// --- Paz y salvo de salida ---

interface DependenciaConEstado {
  estado: EstadoPazYSalvoSalida;
}

/**
 * El estado del paz y salvo completo sale de sus dependencias: basta una bloqueada para que esté bloqueado; aprobado solo con todas aprobadas.
 * Sin dependencias que verificar (el colegio no activó ninguna) no hay nada pendiente.
 */
export function estadoGlobalDePazYSalvo(dependencias: readonly DependenciaConEstado[]): EstadoPazYSalvoSalida {
  if (dependencias.length === 0) return 'APROBADO';
  if (dependencias.some((d) => d.estado === 'BLOQUEADO')) return 'BLOQUEADO';
  return dependencias.every((d) => d.estado === 'APROBADO') ? 'APROBADO' : 'PENDIENTE';
}

/** Rectoría (el ADMIN) y Secretaría autorizan excepciones y anulan aprobaciones; coordinación solo aprueba o bloquea. */
export const ROLES_QUE_AUTORIZAN_EXCEPCION: Rol[] = [ROLES.ADMIN, ROLES.SECRETARIA];

export interface EntradaAccionDependencia {
  accion: Exclude<AccionPazYSalvoSalida, 'APERTURA'>;
  rol: Rol;
  /** BLOQUEO: qué debe. EXCEPCION y ANULACION: por qué. APROBACION: observación opcional. */
  motivo: string;
}

export type ResultadoAccionDependencia = { estado: EstadoPazYSalvoSalida; excepcion: boolean } | { error: string; estatus: number };

/** Qué estado deja cada acción sobre una dependencia y quién puede hacerla. Pura: el servicio solo escribe lo que ella decide. */
export function resolverAccionDependencia(actual: EstadoPazYSalvoSalida, entrada: EntradaAccionDependencia): ResultadoAccionDependencia {
  const motivo = entrada.motivo.trim();
  const exigeMotivo = entrada.accion !== 'APROBACION';
  if (exigeMotivo && motivo.length < MIN_LONGITUD_MOTIVO_SALIDA) {
    return { error: entrada.accion === 'BLOQUEO' ? 'Indica qué deuda o material está pendiente.' : 'Indica el motivo.', estatus: 400 };
  }
  switch (entrada.accion) {
    case 'APROBACION':
      if (actual === 'APROBADO') return { error: 'La dependencia ya está aprobada.', estatus: 409 };
      return { estado: 'APROBADO', excepcion: false };
    case 'BLOQUEO':
      if (actual === 'BLOQUEADO') return { error: 'La dependencia ya está bloqueada.', estatus: 409 };
      if (actual === 'APROBADO') return { error: 'La dependencia ya fue aprobada: anula la aprobación antes de bloquearla.', estatus: 409 };
      return { estado: 'BLOQUEADO', excepcion: false };
    case 'EXCEPCION':
      if (!ROLES_QUE_AUTORIZAN_EXCEPCION.includes(entrada.rol)) return { error: 'Solo Rectoría o Secretaría autorizan una excepción.', estatus: 403 };
      if (actual !== 'BLOQUEADO') return { error: 'La excepción solo aplica a una dependencia bloqueada por deuda o material.', estatus: 409 };
      return { estado: 'APROBADO', excepcion: true };
    case 'ANULACION':
      if (!ROLES_QUE_AUTORIZAN_EXCEPCION.includes(entrada.rol)) return { error: 'Solo Rectoría o Secretaría anulan una aprobación.', estatus: 403 };
      if (actual !== 'APROBADO') return { error: 'Solo se anula una dependencia aprobada.', estatus: 409 };
      return { estado: 'PENDIENTE', excepcion: false };
  }
}

/** El cupo se libera cuando la política del colegio lo permite y aún no se había liberado. */
export function cupoDebeLiberarse(politica: PoliticaCupoSalida, estadoPazYSalvo: EstadoPazYSalvoSalida, yaLiberado: boolean): boolean {
  if (yaLiberado) return false;
  return politica === 'INMEDIATA' || estadoPazYSalvo === 'APROBADO';
}

// --- Trayectoria ---

export interface TramoDeGrupo {
  group_id: string;
  desde: Date;
  hasta: Date | null;
}

/**
 * En qué grupo estaba el estudiante un día: el tramo que contiene la fecha (el límite superior es inclusivo, así el día de la salida
 * todavía cuenta como de su último grupo). Fuera de todos los tramos (antes de matricularse o después de salir), ninguno.
 */
export function grupoEnFecha(tramos: readonly TramoDeGrupo[], fecha: Date): string | null {
  const dia = fecha.getTime();
  const tramo = tramos.find((t) => dia >= aDiaDeCalendario(t.desde).getTime() && (t.hasta === null || dia <= aDiaDeCalendario(t.hasta).getTime() + MS_DIA - 1));
  return tramo ? tramo.group_id : null;
}
