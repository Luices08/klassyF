import type { Rol } from './api';

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA'] as const;
export type Jornada = (typeof JORNADAS)[number];

export const ESTADOS_MATRICULA = ['PREINSCRITO', 'MATRICULADO', 'RETIRADO', 'TRASLADADO'] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

export interface User {
  _id: string;
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  rol: Rol;
  estado: 'activo' | 'inactivo';
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
}

export interface Campus {
  _id: string;
  institucion_id: string;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  es_principal: boolean;
}

export interface JornadaOperativa {
  _id: string;
  sede_id: string | { _id: string; nombre: string };
  nombre: Jornada;
}

export interface AcademicYear {
  _id: string;
  institucion_id: string;
  year: number;
  calendario: 'A' | 'B';
  estado: 'PLANIFICACION' | 'EN_CURSO' | 'CERRADO';
  periodos: Periodo[];
}

export interface Grade {
  _id: string;
  nivel: 'PREESCOLAR' | 'PRIMARIA' | 'SECUNDARIA' | 'MEDIA';
  numero: number;
  nombre: string;
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

export interface SetupInstitutionResult {
  institution: Institution;
  sede_principal: Campus;
  academic_year: AcademicYear;
}
