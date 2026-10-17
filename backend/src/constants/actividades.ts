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
/** Cuántos archivos admite una entrega cuando el docente permite varios. */
export const MAX_ARCHIVOS_POR_ENTREGA = 5;
/** Texto plano del docente para los estudiantes (indicaciones breves aparte de las instrucciones). */
export const MAX_CARACTERES_COMENTARIOS_DOCENTE = 1000;

// Valores iniciales de la política de carga del colegio (ConfiguracionActividades); 0 = sin límite.
export const MAX_EVALUACIONES_POR_DIA_INICIAL = 2;
export const MAX_ENTREGAS_POR_DIA_INICIAL = 4;

// Lo que el docente adjunta a la actividad (material de apoyo): más formatos que las evidencias del estudiante.
export const TIPOS_ADJUNTO = ['PDF', 'WORD', 'EXCEL', 'POWERPOINT', 'IMAGEN', 'AUDIO', 'VIDEO'] as const;
export type TipoAdjunto = (typeof TIPOS_ADJUNTO)[number];
export const MAX_BYTES_ADJUNTO = 50 * 1024 * 1024;
export const MAX_ADJUNTOS_POR_ACTIVIDAD = 10;
export const MAX_ARCHIVOS_POR_SUBIDA = 5;
export const MAX_VIDEOS_POR_ACTIVIDAD = 5;
/** El HTML del editor lleva las imágenes pegadas dentro (data URI): el tope cubre varias imágenes ya reducidas por el navegador. */
export const MAX_BYTES_CONTENIDO_HTML = 2 * 1024 * 1024;

export const PROVEEDORES_VIDEO = ['YOUTUBE', 'VIMEO'] as const;
export type ProveedorVideo = (typeof PROVEEDORES_VIDEO)[number];

/** Con varias entregas permitidas, cuántas puede hacer un estudiante antes de que el docente elija la válida. */
export const MAX_INTENTOS_ENTREGA = 10;
export const MAX_CARACTERES_COMENTARIO = 1000;

/** Desde dónde se puso una nota de actividad: la actividad misma, la planilla de notas o el Excel de la planilla. */
export const ORIGENES_NOTA = ['ACTIVIDAD', 'PLANILLA', 'EXCEL'] as const;
export type OrigenNota = (typeof ORIGENES_NOTA)[number];
