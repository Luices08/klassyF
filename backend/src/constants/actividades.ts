// M11: Actividades y planeación de aula.

export const TIPOS_ACTIVIDAD = ['TAREA', 'EVALUACION', 'TRABAJO', 'PROYECTO'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

// Trazabilidad de una entrega. "Programada" no se guarda: es el estado de la actividad para quien aún no entrega.
export const ESTADOS_ENTREGA = ['ENTREGADA', 'ENTREGADA_TARDE', 'CALIFICADA'] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const ESTADOS_ACTIVIDAD_ESTUDIANTE = ['PROGRAMADA', ...ESTADOS_ENTREGA] as const;
export type EstadoActividadEstudiante = (typeof ESTADOS_ACTIVIDAD_ESTUDIANTE)[number];

export const CLAVES_FORMATO_EVIDENCIA = ['PDF', 'WORD', 'EXCEL', 'POWERPOINT', 'IMAGEN'] as const;
export type FormatoEvidencia = (typeof CLAVES_FORMATO_EVIDENCIA)[number];

// El docente elige por familia de formato; la extensión real sale de la firma de bytes (utils/evidenciasActividad.ts).
export const FORMATOS_EVIDENCIA: Record<FormatoEvidencia, { etiqueta: string; mimetypes: readonly string[] }> = {
  PDF: { etiqueta: 'PDF', mimetypes: ['application/pdf'] },
  WORD: { etiqueta: 'Word (.docx)', mimetypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  EXCEL: { etiqueta: 'Excel (.xlsx)', mimetypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  POWERPOINT: { etiqueta: 'PowerPoint (.pptx)', mimetypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  IMAGEN: { etiqueta: 'Imagen (JPG, PNG o WEBP)', mimetypes: ['image/jpeg', 'image/png', 'image/webp'] },
};

export const MIMETYPES_EVIDENCIA = new Set<string>(Object.values(FORMATOS_EVIDENCIA).flatMap((f) => f.mimetypes));

export const MAX_BYTES_ENTREGA = 10 * 1024 * 1024;

// Valores iniciales de la política de carga del colegio (ConfiguracionActividades); 0 = sin límite.
export const MAX_EVALUACIONES_POR_DIA_INICIAL = 2;
export const MAX_ENTREGAS_POR_DIA_INICIAL = 4;
