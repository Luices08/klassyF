import type { Rol } from './api';

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA', 'SABATINA'] as const;
export type Jornada = (typeof JORNADAS)[number];

export const CALENDARIOS = ['A', 'B'] as const;
export type Calendario = (typeof CALENDARIOS)[number];

export const ESTADOS_MATRICULA = ['PREINSCRITO', 'MATRICULADO', 'RETIRADO', 'TRASLADADO'] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

/** Activo/inactivo generico, reusado por User, Campus, Grade e Institution. */
export type EstadoActivo = 'activo' | 'inactivo';

export interface User {
  _id: string;
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  rol: Rol;
  estado: EstadoActivo;
  createdAt: string;
}

export interface Periodo {
  _id?: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado?: 'ABIERTO' | 'CERRADO';
}

export interface Institution {
  _id: string;
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  administrador_id: string | null;
  logo_url: string | null;
  estado: EstadoActivo;
}

export interface Campus {
  _id: string;
  institucion_id: string;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  telefono: string | null;
  es_principal: boolean;
  estado: EstadoActivo;
}

export interface JornadaOperativa {
  _id: string;
  sede_id: string | { _id: string; nombre: string };
  nombre: Jornada;
  hora_inicio: string;
  hora_fin: string;
}

export interface AcademicYear {
  _id: string;
  institucion_id: string;
  year: number;
  calendario: Calendario;
  estado: 'PLANIFICACION' | 'EN_CURSO' | 'CERRADO';
  periodos: Periodo[];
}

export interface Grade {
  _id: string;
  nivel: 'PREESCOLAR' | 'PRIMARIA' | 'SECUNDARIA' | 'MEDIA';
  numero: number;
  nombre: string;
  estado: EstadoActivo;
}

export const ESTADOS_GRUPO = ['ACTIVE', 'CLOSED'] as const;
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number];

export interface Group {
  _id: string;
  sede_id: string | { _id: string; nombre: string };
  academic_year_id: string;
  grade_id: string | { _id: string; nivel: string; numero: number; nombre: string };
  jornada_id: string | { _id: string; nombre: Jornada };
  nomenclatura: string;
  max_capacity: number;
  cupos_ocupados: number;
  cupos_disponibles?: number;
  estado: EstadoGrupo;
  director_grupo_id: string | null;
}

export interface Enrollment {
  _id: string;
  student_id: string;
  group_id: string;
  academic_year_id: string;
  folio_matricula: string;
  estado: EstadoMatricula;
  fecha_matricula: string;
}

// ---------------------------------------------------------------------------
// M06 — Plan de estudios, áreas y asignaturas
// ---------------------------------------------------------------------------

export const NIVELES_EDUCATIVOS = ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'] as const;
export type NivelEducativo = (typeof NIVELES_EDUCATIVOS)[number];

export const TIPOS_ASIGNATURA = ['OBLIGATORIA', 'OPTATIVA'] as const;
export type TipoAsignatura = (typeof TIPOS_ASIGNATURA)[number];

export const METODOS_CALCULO_EVALUACION = ['PONDERADO', 'ARITMETICO'] as const;
export type MetodoCalculoEvaluacion = (typeof METODOS_CALCULO_EVALUACION)[number];

export interface Area {
  _id: string;
  institucion_id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
  estado: EstadoActivo;
}

export interface Subject {
  _id: string;
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  estado: EstadoActivo;
  niveles_educativos: NivelEducativo[];
}

export interface AsignaturaGrado {
  subject_id: string;
  intensidad_horaria_semanal: number;
}

export interface PonderacionAsignatura {
  subject_id: string;
  porcentaje: number;
}

export interface EvaluacionArea {
  area_id: string;
  metodo_calculo: MetodoCalculoEvaluacion;
  asignaturas: PonderacionAsignatura[];
}

export interface AsignaturaPersonalizadaGrupo {
  subject_id: string;
  intensidad_horaria_semanal: number;
  observacion: string;
}

export interface PersonalizacionGrupo {
  group_id: string;
  intensidades_personalizadas: AsignaturaPersonalizadaGrupo[];
  asignaturas_agregadas: AsignaturaPersonalizadaGrupo[];
  evaluaciones_area_personalizadas: EvaluacionArea[];
}

export interface GradoPlan {
  grade_id: string;
  asignaturas: AsignaturaGrado[];
  evaluaciones_area: EvaluacionArea[];
  personalizaciones_grupo: PersonalizacionGrupo[];
}

export interface StudyPlan {
  _id: string;
  institucion_id: string;
  academic_year_id: string;
  grades: GradoPlan[];
}

export interface SetupInstitutionResult {
  institution: Institution;
  sede_principal: Campus;
  academic_year: AcademicYear;
}
