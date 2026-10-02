import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

/**
 * Matriz de permisos de M14/M15 (convivencia). Es una lista de permitidos: un rol que no aparece aquí no tiene
 * acceso. SECRETARIA y ACUDIENTE quedan fuera a propósito (el acudiente entra con M27) y COORDINADOR no hereda
 * nada de COORDINADOR_CONVIVENCIA: son roles distintos con el mismo rango.
 */
export type AccionConvivencia =
  | 'REGISTRAR_OBSERVACION'
  | 'CONSULTAR_OBSERVACIONES_PROPIAS'
  | 'CONSULTAR_HISTORIAL'
  | 'VER_ESTADO_CASO'
  | 'CONSULTAR_CASO'
  | 'GESTIONAR_CASO'
  | 'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS';

export interface UsuarioConvivencia {
  id: string;
  rol: Rol;
  sedes_ids: string[];
}

export interface EstudianteConvivencia {
  /** `User._id` del estudiante; null si no tiene cuenta. */
  user_id: string | null;
  /** Sede de su matrícula vigente. */
  sede_id: string;
  /** El usuario dicta clase en el grupo del estudiante (M08, `TeacherAssignment` CLASE activa). */
  docenteDictaClase?: boolean;
  /** El usuario es el director del grupo del estudiante (`Group.director_grupo_id`). */
  esDirectorDeGrupo?: boolean;
}

/** `'TODAS'` solo para ADMIN; el resto ve únicamente sus sedes (sin sedes asignadas no ve ninguna). */
export function alcanceDeSedes(usuario: Pick<UsuarioConvivencia, 'rol' | 'sedes_ids'>): 'TODAS' | string[] {
  return usuario.rol === ROLES.ADMIN ? 'TODAS' : usuario.sedes_ids;
}

export function enAlcanceDeSede(usuario: Pick<UsuarioConvivencia, 'rol' | 'sedes_ids'>, sedeId: string): boolean {
  const alcance = alcanceDeSedes(usuario);
  return alcance === 'TODAS' || alcance.includes(sedeId);
}

export function permisoSobreEstudiante(
  usuario: UsuarioConvivencia,
  estudiante: EstudianteConvivencia,
  accion: AccionConvivencia
): boolean {
  if (usuario.rol === ROLES.ESTUDIANTE) {
    return accion === 'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS' && estudiante.user_id === usuario.id;
  }
  if (accion === 'CONSULTAR_OBSERVACIONES_VISIBLES_PROPIAS') return false;
  if (usuario.rol === ROLES.ADMIN) return true;

  if (usuario.rol === ROLES.DOCENTE) {
    if (accion === 'CONSULTAR_OBSERVACIONES_PROPIAS') return true;
    if (!enAlcanceDeSede(usuario, estudiante.sede_id)) return false;
    if (accion === 'REGISTRAR_OBSERVACION') return Boolean(estudiante.docenteDictaClase || estudiante.esDirectorDeGrupo);
    if (accion === 'CONSULTAR_HISTORIAL' || accion === 'VER_ESTADO_CASO') return Boolean(estudiante.esDirectorDeGrupo);
    return false;
  }

  if (!enAlcanceDeSede(usuario, estudiante.sede_id)) return false;

  if (usuario.rol === ROLES.COORDINADOR_CONVIVENCIA) return true;

  // El coordinador académico solo registra y consulta el historial: los casos no son suyos.
  if (usuario.rol === ROLES.COORDINADOR) {
    return (
      accion === 'REGISTRAR_OBSERVACION' ||
      accion === 'CONSULTAR_OBSERVACIONES_PROPIAS' ||
      accion === 'CONSULTAR_HISTORIAL'
    );
  }

  return false;
}
