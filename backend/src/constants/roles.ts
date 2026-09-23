import { ROLES as ROLES_LIST, Rol } from './enums';

export const ROLES = ROLES_LIST.reduce(
  (acc, role) => {
    acc[role] = role;
    return acc;
  },
  {} as Record<Rol, Rol>
);

export { ROLES_LIST };
