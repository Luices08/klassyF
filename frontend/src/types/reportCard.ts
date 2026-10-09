// Mismo contrato que backend/src/services/reportCard.service.ts (ReportCardResult).

import type { NivelDesempeno } from './domain';

// SIEE (CU-ADM-04): resultado de resolverDesempeno contra la escala institucional del año (o su
// respaldo). `etiqueta` es el texto que la institución configuró para ese nivel (editable); el
// color del badge se define por `nivel`, que es fijo (ver components/ui/Badge#DESEMPENO_TONE).
export interface Desempeno {
  nota: number;
  nivel: NivelDesempeno;
  etiqueta: string;
  aprobado: boolean;
}

// Los componentes que rigieron la nota (M12): los congela el cierre de la planilla, así que un cambio posterior de la
// configuración no altera un boletín ya generado.
export interface ReportCardComponente {
  clave: string;
  nombre: string;
  porcentaje: number;
  nota: number;
}

/** El boletín solo muestra resultados cerrados por el docente (o ya definitivos). */
export type EstadoCierreAsignatura = 'SIN_CERRAR' | 'CERRADO' | 'DEFINITIVO';

export interface ReportCardAsignatura {
  subject_id: string;
  nombre: string;
  porcentaje_en_area: number;
  nota_asignatura: number | null;
  estado: EstadoCierreAsignatura;
  desempeno: Desempeno | null;
  fallas_asignatura: number;
  componentes: ReportCardComponente[];
}

export interface ReportCardArea {
  area_id: string;
  nombre: string;
  nota_area: number | null;
  desempeno_area: Desempeno | null;
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
  /** Oficial cuando todas sus asignaturas están cerradas. */
  completo: boolean;
  /** Asignaturas cuya planilla aún no se cierra. */
  pendientes: string[];
  puesto_grupo: number | null;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number | null;
  desempeno_general: Desempeno | null;
  asistencia_periodo: {
    total_fallas_justificadas: number;
    total_fallas_injustificadas: number;
    total_retardos: number;
  };
  areas: ReportCardArea[];
}
