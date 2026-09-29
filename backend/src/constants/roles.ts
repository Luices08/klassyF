import { ROLES as ROLES_LIST, Rol } from './enums';

export const ROLES = ROLES_LIST.reduce(
  (acc, role) => {
    acc[role] = role;
    return acc;
  },
  {} as Record<Rol, Rol>
);

export { ROLES_LIST };

/**
 * Jerarquía institucional de roles (M02).
 * Mayor valor = mayor rango jerárquico.
 * Un usuario solo puede gestionar (crear, editar, cambiar estado,
 * resetear contraseña, cerrar sesiones, eliminar) a usuarios de rango estrictamente menor,
 * con la excepción de que un ADMIN puede gestionar a otros ADMIN (salvo a sí mismo).
 */
export const JERARQUIA_ROLES: Record<Rol, number> = {
  ADMIN: 100,
  COORDINADOR: 70,
  SECRETARIA: 40,
  DOCENTE: 40,
  ESTUDIANTE: 10,
  ACUDIENTE: 10,
};

export function puedeGestionarRol(operadorRol: Rol, objetivoRol: Rol): boolean {
  if (operadorRol === ROLES.ADMIN) return true;
  return (JERARQUIA_ROLES[operadorRol] ?? 0) > (JERARQUIA_ROLES[objetivoRol] ?? 0);
}
