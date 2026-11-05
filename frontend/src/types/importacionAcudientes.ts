/** Importación masiva de acudientes (M03). Refleja lo que devuelve `/guardians/importacion`. */

export const CLASIFICACIONES_ACUDIENTES = ['NUEVO', 'VINCULAR', 'SIN_CAMBIOS', 'ERROR'] as const;
export type ClasificacionAcudientes = (typeof CLASIFICACIONES_ACUDIENTES)[number];

export type EstadoLoteAcudientes = 'SIMULADO' | 'EN_COLA' | 'APLICANDO' | 'APLICADO' | 'FALLIDO' | 'DESCARTADO';

export interface AvisoPrevioAcudientes {
  clave: 'ESTUDIANTES_PREVIOS' | 'DATOS_PERSONALES' | 'IDENTIDAD' | 'PRINCIPAL' | 'PORTAL' | 'TELEFONO' | 'ERRORES';
  titulo: string;
  detalle: string;
  severidad: 'info' | 'warning';
  cantidad: number;
}

export interface ResumenImportacionAcudientes {
  filas_archivo: number;
  por_clasificacion: Partial<Record<ClasificacionAcudientes, number>>;
  por_motivo: Record<string, number>;
  estudiantes: number;
  acudientes_por_crear: number;
  acudientes_con_varios_hijos: number;
  vinculos_por_crear: number;
  con_datos_por_completar: number;
  portal_por_abrir: number;
  advertencias: string[];
  avisos_previos: AvisoPrevioAcudientes[];
}

export interface ImportacionAcudientes {
  _id: string;
  archivo_nombre: string;
  formato: 'xlsx' | 'csv' | 'txt';
  estado: EstadoLoteAcudientes;
  opciones: { habilitar_portal: boolean };
  resumen: ResumenImportacionAcudientes;
  progreso: { total: number; procesadas: number; correctas: number; con_error: number };
  error: string;
  expira_en: string | null;
  fecha_aplicacion: string | null;
  createdAt: string;
}

export interface ResultadoFilaAcudientes {
  estado: 'CORRECTA' | 'ERROR';
  detalle: string;
  acudiente_creado: boolean;
  vinculo: 'CREADO' | 'EXISTENTE' | 'NINGUNO';
  campos_actualizados: string[];
}

export interface FilaImportacionAcudientes {
  _id: string;
  numero: number;
  documento_estudiante: string;
  estudiante: string;
  documento_acudiente: string;
  acudiente: string;
  parentesco: string;
  clasificacion: ClasificacionAcudientes;
  codigo_motivo: string;
  motivo: string;
  avisos: string[];
  diferencias_identidad: string[];
  campos_a_actualizar: string[];
  resultado: ResultadoFilaAcudientes | null;
}
