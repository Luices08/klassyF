import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

export interface PermisoPazYSalvo {
  ver: boolean;
  cargar: boolean;
  confirmar: boolean;
  /** Quitar una confirmación ya dada: el docente puede confirmar, pero deshacerlo es de quien administra la matrícula. */
  revocar: boolean;
  /** Por qué no puede, para que la pantalla lo diga en vez de mostrar un vacío. */
  motivo: string | null;
}

const PERSONAL_DE_MATRICULAS: readonly Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

const SIN_ACCESO: PermisoPazYSalvo = { ver: false, cargar: false, confirmar: false, revocar: false, motivo: null };

/**
 * Quién gestiona el paz y salvo de fin de año. Lista de permitidos, sin herencia: el personal de matrículas siempre; el docente
 * solo si la institución lo habilitó (en unos colegios lo revisa el docente, en otros la secretaría).
 */
export function permisoPazYSalvo(rol: Rol, docentesHabilitados: boolean): PermisoPazYSalvo {
  if (PERSONAL_DE_MATRICULAS.includes(rol)) return { ver: true, cargar: true, confirmar: true, revocar: true, motivo: null };
  if (rol === ROLES.DOCENTE) {
    if (docentesHabilitados) return { ver: true, cargar: true, confirmar: true, revocar: false, motivo: null };
    return { ...SIN_ACCESO, motivo: 'En esta institución el paz y salvo lo gestiona la secretaría. Un administrador puede habilitar a los docentes en Configuración institucional.' };
  }
  return SIN_ACCESO;
}
