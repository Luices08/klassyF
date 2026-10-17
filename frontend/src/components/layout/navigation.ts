import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '../../types/api';
import {
  BookIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
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
  MegaphoneIcon,
  UsersIcon,
} from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles?: Rol[];
  /** Oculto en instituciones virtuales (sin espacios físicos). */
  soloPresencial?: boolean;
  /** No sale en el menú lateral ni en los accesos del inicio: tiene su botón en el encabezado (el asistente sí lo conoce). */
  soloEncabezado?: boolean;
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
  // M27: el acudiente tiene su propio portal con un selector de estudiante; el resto de sus pantallas (boletín, horario) siguen aquí.
  { to: '/portal', label: 'Portal del acudiente', icon: UsersIcon, roles: ['ACUDIENTE'] },
  { to: '/report-card', label: 'Boletín', icon: FileTextIcon },
  { to: '/mi-horario', label: 'Mi horario', icon: ClockIcon, roles: ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'] },
  { to: '/anuncios', label: 'Anuncios', icon: MegaphoneIcon },
  { to: '/mi-cuenta', label: 'Mi cuenta', icon: UserIcon, soloEncabezado: true },
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
  { to: '/admin/horarios', label: 'Horarios', icon: ClockIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/documentos-referencia', label: 'Documentos de apoyo', icon: FolderIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/revision-planeacion', label: 'Revisión de planeación', icon: FileTextIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/actividades', label: 'Actividades por grupo', icon: ClipboardListIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/notas', label: 'Seguimiento de notas', icon: FileTextIcon, roles: CURRICULUM_MANAGERS },
  { to: '/admin/creador-planillas', label: 'Creador de planillas', icon: SlidersIcon, roles: STRUCTURAL_ADMINS },
  { to: '/admin/boletin', label: 'Configuración del boletín', icon: FileTextIcon, roles: CURRICULUM_MANAGERS },
  { to: '/recuperaciones', label: 'Recuperaciones', icon: ClipboardListIcon, roles: ['ADMIN', 'COORDINADOR', 'DOCENTE'] },
  { to: '/admin/promocion', label: 'Promoción y cierre del año', icon: GraduationCapIcon, roles: GROUP_MANAGERS },
  { to: '/admin/promocion-anticipada', label: 'Promoción anticipada', icon: GraduationCapIcon, roles: GROUP_MANAGERS },
  { to: '/comision', label: 'Comisión de evaluación', icon: UsersIcon, roles: ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE', 'ACUDIENTE'] },
  { to: '/secretaria/titulacion', label: 'Titulación', icon: GraduationCapIcon, roles: STAFF },
  { to: '/docente/mi-carga', label: 'Mi asignación', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/docente/planeacion', label: 'Planeación', icon: BookIcon, roles: ['DOCENTE'] },
  { to: '/docente/actividades', label: 'Actividades y tareas', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/docente/notas', label: 'Planilla de notas', icon: FileTextIcon, roles: ['DOCENTE'] },
  { to: '/docente/boletin-observaciones', label: 'Observaciones del boletín', icon: FileTextIcon, roles: ['DOCENTE'] },
  { to: '/docente/asistencia', label: 'Tomar asistencia', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/asistencia/gestion', label: 'Gestión de asistencia', icon: UsersIcon, roles: [...STAFF, 'DOCENTE'] },
  { to: '/admin/enrollments', label: 'Matrículas', icon: ClipboardListIcon, roles: STAFF },
  { to: '/admin/documentos-por-revisar', label: 'Documentos por revisar', icon: InboxIcon, roles: STAFF },
  // Fin de año (M04): el docente solo lo ve si la institución lo habilitó; el servidor lo decide.
  { to: '/paz-y-salvo', label: 'Paz y salvo de fin de año', icon: CheckCircleIcon, roles: [...STAFF, 'DOCENTE'] },
  { to: '/admin/admisiones', label: 'Admisiones', icon: InboxIcon, roles: STAFF },
  { to: '/secretaria/certificados', label: 'Certificados', icon: FileTextIcon, roles: ['ADMIN', 'SECRETARIA'] },
  { to: '/convivencia/observador', label: 'Observador', icon: EyeIcon, roles: CONVIVENCIA_REGISTRA },
  { to: '/convivencia/catalogo', label: 'Catálogo de convivencia', icon: SlidersIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/casos', label: 'Casos de convivencia', icon: FolderIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/comite', label: 'Comité de convivencia', icon: UsersIcon, roles: CONVIVENCIA_GESTIONA },
  { to: '/convivencia/solicitudes', label: 'Solicitudes de caso', icon: InboxIcon, roles: CONVIVENCIA_GESTIONA },
  // Inclusión (M16): el rol abre la puerta y el servidor decide por estudiante, sede y vínculo docente.
  { to: '/inclusion', label: 'Inclusión (PIAR)', icon: FolderIcon, roles: ['ADMIN', 'ORIENTADOR', 'COORDINADOR'] },
  { to: '/docente/ajustes-razonables', label: 'Estudiantes con ajustes', icon: ClipboardListIcon, roles: ['DOCENTE'] },
  { to: '/orientacion/remisiones', label: 'Remisiones a orientación', icon: InboxIcon, roles: ['ADMIN', 'ORIENTADOR'] },
  { to: '/mis-actividades', label: 'Mis actividades', icon: ClipboardListIcon, roles: ['ESTUDIANTE'] },
  { to: '/mis-notas', label: 'Mis notas', icon: FileTextIcon, roles: ['ESTUDIANTE'] },
  { to: '/mi-observador', label: 'Mi observador', icon: EyeIcon, roles: ['ESTUDIANTE'] },
];

export interface GrupoNav {
  clave: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Rutas que agrupa, en el orden en que salen. Un grupo sin pantallas visibles para el rol no se dibuja. */
  rutas: string[];
}

/** Categorías del menú lateral. Lo que no esté en ninguna (Inicio, Boletín, Anuncios…) queda suelto arriba. */
export const GRUPOS_NAV: GrupoNav[] = [
  {
    clave: 'matriculas',
    label: 'Matrículas y admisiones',
    icon: ClipboardListIcon,
    rutas: ['/admin/admisiones', '/admin/enrollments', '/admin/documentos-por-revisar', '/paz-y-salvo', '/admin/students', '/secretaria/certificados', '/secretaria/titulacion'],
  },
  {
    clave: 'institucion',
    label: 'Institución',
    icon: BuildingIcon,
    rutas: ['/admin/setup', '/admin/sedes', '/anio-lectivo', '/admin/grades', '/admin/users'],
  },
  {
    clave: 'academico',
    label: 'Gestión académica',
    icon: GraduationCapIcon,
    rutas: ['/admin/academic-catalog', '/admin/study-plan', '/admin/groups', '/admin/teacher-assignments', '/admin/horarios', '/admin/espacios'],
  },
  {
    clave: 'evaluacion',
    label: 'Evaluación y seguimiento',
    icon: FileTextIcon,
    rutas: [
      '/admin/documentos-referencia',
      '/admin/revision-planeacion',
      '/admin/actividades',
      '/admin/notas',
      '/admin/creador-planillas',
      '/admin/boletin',
      '/recuperaciones',
      '/admin/promocion',
      '/admin/promocion-anticipada',
      '/comision',
      '/asistencia/gestion',
    ],
  },
  {
    clave: 'docencia',
    label: 'Mi docencia',
    icon: BookIcon,
    rutas: [
      '/docente/mi-carga',
      '/docente/planeacion',
      '/docente/actividades',
      '/docente/notas',
      '/docente/boletin-observaciones',
      '/docente/asistencia',
      '/docente/ajustes-razonables',
    ],
  },
  {
    clave: 'convivencia',
    label: 'Convivencia',
    icon: EyeIcon,
    rutas: ['/convivencia/observador', '/convivencia/solicitudes', '/convivencia/casos', '/convivencia/comite', '/convivencia/catalogo'],
  },
  {
    clave: 'orientacion',
    label: 'Orientación e inclusión',
    icon: FolderIcon,
    rutas: ['/inclusion', '/orientacion/remisiones'],
  },
  {
    clave: 'estudio',
    label: 'Mi estudio',
    icon: GraduationCapIcon,
    rutas: ['/mis-actividades', '/mis-notas', '/mi-observador'],
  },
];

export type EntradaMenu = { tipo: 'item'; item: NavItem } | { tipo: 'grupo'; grupo: GrupoNav; items: NavItem[] };

/**
 * Arma el menú lateral con los items que el rol puede abrir: cada grupo reúne los suyos (omitido si queda vacío) y aparece donde
 * está su primera pantalla; lo suelto conserva su lugar. Es pura para poder probarla sin React.
 */
export function agruparMenu(items: NavItem[], grupos: GrupoNav[] = GRUPOS_NAV): EntradaMenu[] {
  const visibles = items.filter((i) => !i.soloEncabezado);
  const grupoDe = new Map<string, GrupoNav>();
  grupos.forEach((g) => g.rutas.forEach((r) => grupoDe.set(r, g)));

  const sueltos = visibles.filter((i) => !grupoDe.has(i.to));
  const entradas: EntradaMenu[] = sueltos.map((item) => ({ tipo: 'item', item }));
  for (const grupo of grupos) {
    const delGrupo = grupo.rutas.map((r) => visibles.find((i) => i.to === r)).filter((i): i is NavItem => !!i);
    // Un grupo de una sola pantalla no ahorra nada: se muestra como pantalla suelta.
    if (delGrupo.length === 1) entradas.push({ tipo: 'item', item: delGrupo[0]! });
    else if (delGrupo.length > 1) entradas.push({ tipo: 'grupo', grupo, items: delGrupo });
  }
  return entradas;
}
