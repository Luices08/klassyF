import type { Rol } from '../../types/api';

export interface NavItem {
  to: string;
  label: string;
  roles?: Rol[];
}

const STAFF: Rol[] = ['SUPERADMIN', 'ADMIN', 'COORDINADOR', 'SECRETARIA'];
const GROUP_MANAGERS: Rol[] = ['SUPERADMIN', 'ADMIN', 'COORDINADOR'];
const STRUCTURAL_ADMINS: Rol[] = ['SUPERADMIN', 'ADMIN'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/report-card', label: 'Boletín' },
  { to: '/admin/setup', label: 'Configuración institucional', roles: ['SUPERADMIN'] },
  { to: '/admin/sedes', label: 'Sedes y jornadas', roles: STRUCTURAL_ADMINS },
  { to: '/admin/users', label: 'Usuarios', roles: STAFF },
  { to: '/admin/groups', label: 'Grupos', roles: GROUP_MANAGERS },
  { to: '/admin/enrollments', label: 'Matrículas', roles: STAFF },
];
