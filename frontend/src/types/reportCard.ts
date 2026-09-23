// Mismo contrato que backend/src/services/reportCard.service.ts (ReportCardResult).

export const DESEMPENOS = ['Bajo', 'Básico', 'Alto', 'Superior'] as const;
export type Desempeno = (typeof DESEMPENOS)[number];

export interface ReportCardComponentes {
  saber: number;
  hacer: number;
  ser: number;
}

export interface ReportCardAsignatura {
  subject_id: string;
  nombre: string;
  porcentaje_en_area: number;
  nota_asignatura: number;
  desempeno: Desempeno;
  fallas_asignatura: number;
  componentes: ReportCardComponentes;
}

export interface ReportCardArea {
  area_id: string;
  nombre: string;
  nota_area: number;
  desempeno_area: Desempeno;
  asignaturas: ReportCardAsignatura[];
}

export interface ReportCard {
  estudiante: {
    id: string;
    nombre_completo: string;
    documento: string;
    grupo: string;
    jornada: string;
    sede: string;
  };
  periodo: number;
  academic_year: number;
  puesto_grupo: number;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number;
  desempeno_general: Desempeno;
  asistencia_periodo: {
    total_fallas_justificadas: number;
    total_fallas_injustificadas: number;
    total_retardos: number;
  };
  areas: ReportCardArea[];
}
