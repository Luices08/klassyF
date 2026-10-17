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
  /** Descripción cualitativa del nivel (banco del colegio, Doc. 11 MEN). Vacía si el colegio no definió texto. */
  descripcion: string;
  /** Apoyo o mejora sugerida para ese nivel. Vacía cuando el colegio no la definió. */
  recomendacion: string;
  /** Lo que el docente titular escribió de este estudiante en esta asignatura y periodo. */
  observacion_docente: string | null;
  /** Recuperación del periodo (M18), si la hubo. Con `cuenta`, `nota_asignatura` ya la incluye. */
  recuperacion: { nota_original: number; nota_resultante: number; estado: string; cuenta: boolean; detalle: string } | null;
}

/** Un nivel de la escala del colegio con su equivalencia nacional (Superior/Alto/Básico/Bajo). */
export interface ReportCardNivelEscala {
  nivel: NivelDesempeno;
  etiqueta: string;
  valor_minimo: number;
  valor_maximo: number;
  es_aprobatorio: boolean;
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
    /** Nombre del grado (ej. «Sexto»). */
    grado: string;
    grupo: string;
    jornada: string;
    sede: string;
  };
  periodo: number;
  nombre_periodo: string;
  academic_year: number;
  institucion: { nombre: string; codigo_dane: string; nit: string; resolucion_aprobacion: string };
  /** Oficial cuando todas sus asignaturas están cerradas. */
  completo: boolean;
  /** Asignaturas cuya planilla aún no se cierra. */
  pendientes: string[];
  puesto_grupo: number | null;
  /** El colegio puede decidir no mostrar el puesto. */
  mostrar_puesto: boolean;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number | null;
  desempeno_general: Desempeno | null;
  asistencia_periodo: {
    total_fallas_justificadas: number;
    total_fallas_injustificadas: number;
    total_retardos: number;
  };
  areas: ReportCardArea[];
  escala: ReportCardNivelEscala[];
  /** Fecha de entrega del informe a las familias (ISO), si el colegio la fijó para este periodo. */
  fecha_entrega: string | null;
  canal_reclamaciones: string;
  /** Nombre del director del grupo, para la firma del boletín. */
  director_grupo: string | null;
  /** Decisión de promoción de M19 (solo en el informe final); null = casillas en blanco. */
  promocion: { resultado: string; texto: string; acta: string | null } | null;
  /** Fecha de entrega de cada periodo del año; null = aún sin fijar. */
  calendario_entregas: Array<{ periodo: string; fecha: string | null }>;
}
