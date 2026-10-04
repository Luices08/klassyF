import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import {
  BookIcon,
  BuildingIcon,
  CalendarIcon,
  ClipboardListIcon,
  DoorIcon,
  EyeIcon,
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
const CURRICULUM_MANAGERS: Rol[] = ['ADMIN', 'COORDINADOR'];
const STRUCTURAL_ADMINS: Rol[] = ['ADMIN'];
// Convivencia: SECRETARIA no tiene acceso. El docente solo registra y ve lo suyo; el estudiante, su propio observador.
const CONVIVENCIA_REGISTRA: Rol[] = ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE'];
const CONVIVENCIA_GESTIONA: Rol[] = ['ADMIN', 'COORDINADOR_CONVIVENCIA'];

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
  { to: '/admin/academic-catalog', label: 'Catálogo académico', icon: BookIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/study-plan', label: 'Plan de estudios', icon: ClipboardListIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/teacher-assignments', label: 'Carga académica', icon: UsersIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/revision-curricular', label: 'Revisión curricular', icon: FileTextIcon, roles: CURRICULUM_MANAGERS },
  { to: '/docente/mi-carga', label: 'Mi asignación', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/docente/planeacion-curricular', label: 'Planeación curricular', icon: BookIcon, roles: ['DOCENTE'] },
  { to: '/docente/asistencia', label: 'Tomar asistencia', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/asistencia/gestion', label: 'Gestión de asistencia', icon: UsersIcon, roles: [...STAFF, 'DOCENTE'] },
  { to: '/admin/enrollments', label: 'Matrículas', icon: ClipboardListIcon, roles: STAFF },
  { to: '/admin/admisiones', label: 'Admisiones', icon: InboxIcon, roles: STAFF },
  { to: '/convivencia/observador', label: 'Observador', icon: EyeIcon, roles: CONVIVENCIA_REGISTRA },
  { to: '/convivencia/catalogo', label: 'Catálogo de convivencia', icon: SlidersIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/casos', label: 'Casos de convivencia', icon: FolderIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/comite', label: 'Comité de convivencia', icon: UsersIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/solicitudes', label: 'Solicitudes de caso', icon: InboxIcon, roles: CONVIVENCIA_GESTIONA },
  // Inclusión (M16): el rol abre la puerta y el servidor decide por estudiante, sede y vínculo docente.
  { to: '/inclusion', label: 'Inclusión (PIAR)', icon: FolderIcon, roles: ['ADMIN', 'ORIENTADOR', 'COORDINADOR'] },
  { to: '/docente/ajustes-razonables', label: 'Estudiantes con ajustes', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/orientacion/remisiones', label: 'Remisiones a orientación', icon: InboxIcon, roles: ['ADMIN', 'ORIENTADOR'] },
  { to: '/mi-observador', label: 'Mi observador', icon: EyeIcon, roles: ['ESTUDIANTE'] },
];
