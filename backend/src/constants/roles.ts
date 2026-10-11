import { ROLES as ROLES_LIST, Rol } from './enums';

export const ROLES = ROLES_LIST.reduce(
  (acc, role) => {
    acc[role] = role;
    return acc;
  },
  {} as Record<Rol, Rol>
);

export { ROLES_LIST };

/** Roles de personal institucional (M02): solo estos se gestionan desde la vista de usuarios. */
export const ROLES_STAFF: readonly Rol[] = [
  ROLES.ADMIN,
  ROLES.COORDINADOR,
  ROLES.COORDINADOR_CONVIVENCIA,
  ROLES.ORIENTADOR,
  ROLES.SECRETARIA,
  ROLES.DOCENTE,
];

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
  COORDINADOR_CONVIVENCIA: 70,
  ORIENTADOR: 70,
  SECRETARIA: 40,
  DOCENTE: 40,
  ESTUDIANTE: 10,
  ACUDIENTE: 10,
};

/**
 * Roles cuyo alcance es por sede: sin sede asignada no ven nada, así que no se permite crearlos sin una
 * (convivencia maneja datos de menores; el alcance se decide por sede, nunca "todas por omisión").
 */
export const ROLES_CON_SEDE_OBLIGATORIA: readonly Rol[] = [ROLES.COORDINADOR_CONVIVENCIA, ROLES.ORIENTADOR];

export function puedeGestionarRol(operadorRol: Rol, objetivoRol: Rol): boolean {
  if (operadorRol === ROLES.ADMIN) return true;
  return (JERARQUIA_ROLES[operadorRol] ?? 0) > (JERARQUIA_ROLES[objetivoRol] ?? 0);
}
