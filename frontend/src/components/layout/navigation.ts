import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import {
  BuildingIcon,
  CalendarIcon,
  ClipboardListIcon,
  DoorIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  HomeIcon,
  InboxIcon,
  LayersIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
} from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles?: Rol[];
  /** Oculto en instituciones virtuales (sin espacios físicos). */
  soloPresencial?: boolean;
}

const STAFF: Rol[] = ['ADMIN', 'COORDINADOR', 'SECRETARIA'];
const GROUP_MANAGERS: Rol[] = ['ADMIN', 'COORDINADOR'];
const STRUCTURAL_ADMINS: Rol[] = ['ADMIN'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/panel', label: 'Inicio', icon: HomeIcon },
  { to: '/report-card', label: 'Boletín', icon: FileTextIcon },
  { to: '/mi-cuenta', label: 'Mi cuenta', icon: UserIcon },
  { to: '/admin/setup', label: 'Configuración institucional', icon: SlidersIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/sedes', label: 'Sedes y jornadas', icon: BuildingIcon, roles: STRUCTURAL_ADMINS },
  // Consulta para todos los roles; solo ADMIN/COORDINADOR ven los controles de gestion dentro de la pagina.
  { to: '/anio-lectivo', label: 'Año lectivo', icon: CalendarIcon },
  { to: '/admin/grades', label: 'Catálogo de grados', icon: GraduationCapIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/users', label: 'Usuarios', icon: UsersIcon, roles: STAFF },
  { to: '/admin/students', label: 'Estudiantes', icon: FolderIcon, roles: STAFF },
  { to: '/admin/groups', label: 'Grupos', icon: LayersIcon, roles: GROUP_MANAGERS },
  { to: '/admin/espacios', label: 'Espacios y aulas', icon: DoorIcon, roles: GROUP_MANAGERS, soloPresencial: true },
  { to: '/admin/enrollments', label: 'Matrículas', icon: ClipboardListIcon, roles: STAFF },
  { to: '/admin/admisiones', label: 'Admisiones', icon: InboxIcon, roles: STAFF },
];
