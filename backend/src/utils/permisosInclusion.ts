import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { alcanceDeSedes, enAlcanceDeSede } from './permisosConvivencia';

/**
 * Matriz de permisos de M16 (inclusión). Es una lista de permitidos: un rol que no aparece no tiene acceso. SECRETARIA,
 * COORDINADOR_CONVIVENCIA, ACUDIENTE y ESTUDIANTE quedan fuera a propósito (el acudiente entra con M27) y ningún rol hereda
 * de otro. Lo clínico (diagnóstico, soportes, Anexo 1) solo lo ven orientación y ADMIN; el docente ve la ficha pedagógica.
 */
export type AccionInclusion =
  | 'CREAR_SOLICITUD'
  | 'VER_BANDEJA'
  | 'GESTIONAR_EXPEDIENTE'
  | 'VER_CLINICO'
  | 'VER_FICHA_PEDAGOGICA'
  | 'EDITAR_AJUSTE'
  | 'VER_TODOS_LOS_AJUSTES'
  | 'EDITAR_TRANSVERSALES'
  | 'APROBAR'
  | 'EMITIR_DOCUMENTO'
  | 'DESCARGAR_DOCUMENTO'
  | 'DESCARGAR_CONFIDENCIAL'
  | 'FIRMAR_INSTITUCIONAL';

export interface UsuarioInclusion {
  id: string;
  rol: Rol;
  sedes_ids: string[];
}

export interface ContextoInclusion {
  /** Sede del grupo vigente del estudiante. */
  sede_id: string;
  /** El usuario dicta clase en el grupo del estudiante (M08, `TeacherAssignment` CLASE activa). */
  docenteDictaClase?: boolean;
  /** El usuario es el director del grupo del estudiante. */
  esDirectorDeGrupo?: boolean;
  /** El usuario dicta la asignatura concreta sobre la que actúa. */
  dictaLaAsignatura?: boolean;
}

const ACCIONES_ORIENTADOR: readonly AccionInclusion[] = [
  'CREAR_SOLICITUD',
  'VER_BANDEJA',
  'GESTIONAR_EXPEDIENTE',
  'VER_CLINICO',
  'VER_FICHA_PEDAGOGICA',
  'EDITAR_AJUSTE',
  'VER_TODOS_LOS_AJUSTES',
  'EDITAR_TRANSVERSALES',
  'EMITIR_DOCUMENTO',
  'DESCARGAR_DOCUMENTO',
  'DESCARGAR_CONFIDENCIAL',
];

// El coordinador supervisa y aprueba; no ve lo clínico y no redacta (ni abre) el expediente.
const ACCIONES_COORDINADOR: readonly AccionInclusion[] = [
  'CREAR_SOLICITUD',
  'VER_BANDEJA',
  'VER_FICHA_PEDAGOGICA',
  'VER_TODOS_LOS_AJUSTES',
  'APROBAR',
  'DESCARGAR_DOCUMENTO',
];

export const alcanceDeInclusion = alcanceDeSedes;

export function permisoInclusion(usuario: UsuarioInclusion, contexto: ContextoInclusion, accion: AccionInclusion): boolean {
  if (usuario.rol === ROLES.ADMIN) return true;
  if (!enAlcanceDeSede(usuario, contexto.sede_id)) return false;

  if (usuario.rol === ROLES.ORIENTADOR) return ACCIONES_ORIENTADOR.includes(accion);
  if (usuario.rol === ROLES.COORDINADOR) return ACCIONES_COORDINADOR.includes(accion);

  if (usuario.rol === ROLES.DOCENTE) {
    const vinculado = Boolean(contexto.docenteDictaClase || contexto.esDirectorDeGrupo);
    switch (accion) {
      case 'CREAR_SOLICITUD':
      case 'VER_FICHA_PEDAGOGICA':
        return vinculado;
      case 'EDITAR_AJUSTE':
        return Boolean(contexto.dictaLaAsignatura);
      case 'VER_TODOS_LOS_AJUSTES':
      case 'EDITAR_TRANSVERSALES':
        return Boolean(contexto.esDirectorDeGrupo);
      default:
        return false;
    }
  }

  return false;
}

/** Roles que ven la bandeja de solicitudes y la lista de expedientes de sus sedes. */
export const ROLES_BANDEJA_INCLUSION: readonly Rol[] = [ROLES.ADMIN, ROLES.ORIENTADOR, ROLES.COORDINADOR];
