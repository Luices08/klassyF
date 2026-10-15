import { Rol } from '../constants/enums';
import { EstadoPlanVista } from '../constants/planeacion';
import { ROLES } from '../constants/roles';

/**
 * Matriz de permisos de M07 (planeación documental). Es una lista de permitidos: ningún rol hereda de otro (`checkRole` tampoco),
 * así que cada ruta de coordinación declara `[ADMIN, COORDINADOR]` y lo que el ADMIN hace además (reabrir) es suyo.
 * Nadie carga en nombre de otro: ni el ADMIN ni el COORDINADOR suben un plan de área o de aula, eso es del líder y del docente asignado.
 */
export type AccionPlaneacion =
  | 'GESTIONAR_DOCUMENTOS_REFERENCIA'
  | 'VER_DOCUMENTOS_REFERENCIA'
  | 'ASIGNAR_LIDER'
  | 'CONFIGURAR_VENTANA'
  | 'VER_BANDEJA'
  | 'REVISAR_PLAN'
  | 'REABRIR_PLAN'
  | 'CARGAR_PLAN_AREA'
  | 'VER_PLAN_AREA'
  | 'CARGAR_PLAN_AULA'
  | 'VER_PLAN_AULA';

export interface ContextoPlaneacion {
  /** Es el docente líder del área del plan. */
  esLiderDelArea?: boolean;
  /** Dicta alguna asignatura del área (M08, `TeacherAssignment` CLASE activa). */
  imparteEnElArea?: boolean;
  /** Es el docente dueño del plan de aula. */
  esDuenioDelPlan?: boolean;
  /** Dicta la asignatura en ese grado (M08, CLASE activa). */
  imparteLaAsignaturaYGrado?: boolean;
  /** El dueño del plan ya no dicta la asignatura en ese grado: el plan quedó en el histórico. */
  planArchivado?: boolean;
  estadoPlan?: EstadoPlanVista;
}

const ACCIONES_COORDINACION: readonly AccionPlaneacion[] = [
  'GESTIONAR_DOCUMENTOS_REFERENCIA',
  'VER_DOCUMENTOS_REFERENCIA',
  'ASIGNAR_LIDER',
  'CONFIGURAR_VENTANA',
  'VER_BANDEJA',
  'REVISAR_PLAN',
  'VER_PLAN_AREA',
  'VER_PLAN_AULA',
];

/** Lo que el ADMIN hace además de todo lo de coordinación: reabrir un plan ya aprobado. */
const ACCIONES_SOLO_ADMIN: readonly AccionPlaneacion[] = ['REABRIR_PLAN'];

export function permisoPlaneacion(rol: Rol, contexto: ContextoPlaneacion, accion: AccionPlaneacion): boolean {
  if (rol === ROLES.ADMIN) return ACCIONES_COORDINACION.includes(accion) || ACCIONES_SOLO_ADMIN.includes(accion);
  if (rol === ROLES.COORDINADOR) return ACCIONES_COORDINACION.includes(accion);

  if (rol === ROLES.DOCENTE) {
    switch (accion) {
      case 'VER_DOCUMENTOS_REFERENCIA':
        return true;
      case 'CARGAR_PLAN_AREA':
        return Boolean(contexto.esLiderDelArea);
      case 'VER_PLAN_AREA':
        // El líder ve el suyo en cualquier estado; los demás docentes del área, solo cuando ya está aprobado.
        return Boolean(contexto.esLiderDelArea || (contexto.imparteEnElArea && contexto.estadoPlan === 'APROBADO'));
      case 'CARGAR_PLAN_AULA':
        return Boolean(contexto.imparteLaAsignaturaYGrado);
      case 'VER_PLAN_AULA':
        // Un plan archivado y aprobado lo puede ver quien hoy dicta esa asignatura en ese grado: así decide si lo adopta.
        return Boolean(contexto.esDuenioDelPlan || (contexto.imparteLaAsignaturaYGrado && contexto.planArchivado && contexto.estadoPlan === 'APROBADO'));
      default:
        return false;
    }
  }

  return false;
}
