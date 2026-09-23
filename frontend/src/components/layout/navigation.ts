import type { Rol } from '../../types/api';

export interface NavItem {
  to: string;
  label: string;
  roles?: Rol[];
}

const STAFF: Rol[] = ['SUPERADMIN', 'RECTOR', 'COORDINADOR', 'SECRETARIA'];
const GROUP_MANAGERS: Rol[] = ['SUPERADMIN', 'RECTOR', 'COORDINADOR'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/report-card', label: 'Boletín' },
  { to: '/admin/setup', label: 'Configuración institucional', roles: ['SUPERADMIN'] },
  { to: '/admin/users', label: 'Usuarios', roles: STAFF },
  { to: '/admin/groups', label: 'Grupos', roles: GROUP_MANAGERS },
  { to: '/admin/enrollments', label: 'Matrículas', roles: STAFF },
];
