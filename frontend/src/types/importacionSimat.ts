/** Importación masiva de matrículas desde SIMAT (M04). Refleja lo que devuelve `/enrollments/importacion-simat`. */

export const CLASIFICACIONES_SIMAT = ['NUEVO', 'ANTIGUO', 'OMITIDA', 'CONFLICTO', 'ERROR'] as const;
export type ClasificacionSimat = (typeof CLASIFICACIONES_SIMAT)[number];

export type EstadoLoteSimat = 'SIMULADO' | 'EN_COLA' | 'APLICANDO' | 'APLICADO' | 'FALLIDO' | 'DESCARTADO';

export interface AvisoPrevioSimat {
  clave: 'ACUDIENTE' | 'REVISION' | 'MARCA' | 'SALUD' | 'FOLIOS' | 'GRUPOS' | 'CONFLICTOS';
  titulo: string;
  detalle: string;
  severidad: 'info' | 'warning';
  cantidad: number;
}

export interface OpcionesImportacionSimat {
  reincorporar_retirados: boolean;
  autorizacion_datos_salud: boolean;
  cupo_por_defecto: number;
  dias_compromiso: number;
}

export interface ResumenImportacionSimat {
  filas_archivo: number;
  filas_otras_instituciones: number;
  filas_sin_institucion: number;
  filas_institucion: number;
  instituciones_en_archivo: number;
  por_clasificacion: Partial<Record<ClasificacionSimat, number>>;
  por_motivo: Record<string, number>;
  sin_acudiente: number;
  con_datos_de_salud: number;
  con_cambios: number;
  matriculas_por_crear: number;
  matriculas_por_formalizar: number;
  matriculas_confirmadas: number;
  fecha_mas_reciente: string | null;
  advertencias: string[];
  avisos_previos: AvisoPrevioSimat[];
}

export interface GrupoPorCrearSimat {
  sede_nombre: string;
  jornada_nombre: string;
  grado_nombre: string;
  codigo_simat: string;
  estudiantes: number;
}

export interface ImportacionSimat {
  _id: string;
  academic_year_id: string;
  archivo_nombre: string;
  formato: 'xlsx' | 'csv' | 'txt';
  estado: EstadoLoteSimat;
  opciones: OpcionesImportacionSimat;
  resumen: ResumenImportacionSimat;
  grupos_por_crear: GrupoPorCrearSimat[];
  progreso: { total: number; procesadas: number; correctas: number; con_error: number };
  error: string;
  expira_en: string | null;
  fecha_aplicacion: string | null;
  createdAt: string;
}

export interface ResultadoFilaSimat {
  estado: 'CORRECTA' | 'ERROR' | 'OMITIDA';
  detalle: string;
  estudiante_creado: boolean;
  matricula: 'CREADA' | 'FORMALIZADA' | 'CONFIRMADA' | 'NINGUNA';
  campos_actualizados: string[];
  folio: string | null;
}

export interface FilaImportacionSimat {
  _id: string;
  numero: number;
  documento: string;
  nombre: string;
  grado: string;
  grupo: string;
  sede: string;
  clasificacion: ClasificacionSimat;
  codigo_motivo: string;
  motivo: string;
  avisos: string[];
  diferencias_identidad: string[];
  campos_a_actualizar: string[];
  resultado: ResultadoFilaSimat | null;
}

export interface OpcionesSimulacionSimat {
  reincorporar_retirados: boolean;
  autorizacion_datos_salud: boolean;
  cupo_por_defecto: number;
  dias_compromiso: number;
}
