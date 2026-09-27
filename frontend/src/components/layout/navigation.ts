import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import {
  BookIcon,
  BuildingIcon,
  ClipboardListIcon,
  FileTextIcon,
  GraduationCapIcon,
  HomeIcon,
  LayersIcon,
  SlidersIcon,
  UsersIcon,
} from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles?: Rol[];
}

const STAFF: Rol[] = ['ADMIN', 'COORDINADOR', 'SECRETARIA'];
const GROUP_MANAGERS: Rol[] = ['ADMIN', 'COORDINADOR'];
const STRUCTURAL_ADMINS: Rol[] = ['ADMIN'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: HomeIcon },
  { to: '/report-card', label: 'Boletín', icon: FileTextIcon },
  { to: '/admin/setup', label: 'Configuración institucional', icon: SlidersIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/sedes', label: 'Sedes y jornadas', icon: BuildingIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/grades', label: 'Catálogo de grados', icon: GraduationCapIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/users', label: 'Usuarios', icon: UsersIcon, roles: STAFF },
  { to: '/admin/groups', label: 'Grupos', icon: LayersIcon, roles: GROUP_MANAGERS },
  { to: '/admin/academic-catalog', label: 'Catálogo académico', icon: BookIcon, roles: GROUP_MANAGERS },
  { to: '/admin/study-plan', label: 'Plan de estudios', icon: ClipboardListIcon, roles: GROUP_MANAGERS },
  { to: '/admin/enrollments', label: 'Matrículas', icon: ClipboardListIcon, roles: STAFF },
];
