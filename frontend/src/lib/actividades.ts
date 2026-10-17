// Espejo de backend/src/constants/actividades.ts: el contrato entre ambos lados se cambia en los dos a la vez.

export const TIPOS_ACTIVIDAD = ['TAREA', 'EVALUACION', 'TRABAJO', 'PROYECTO'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

export const NOMBRES_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  TAREA: 'Tarea',
  EVALUACION: 'Evaluación',
  TRABAJO: 'Trabajo',
  PROYECTO: 'Proyecto',
};

export type FormatoEvidencia = 'PDF' | 'WORD' | 'EXCEL' | 'POWERPOINT' | 'IMAGEN';

export const FORMATOS_EVIDENCIA: Array<{ clave: FormatoEvidencia; etiqueta: string; extensiones: string[] }> = [
  { clave: 'PDF', etiqueta: 'PDF', extensiones: ['.pdf'] },
  { clave: 'WORD', etiqueta: 'Word (.docx)', extensiones: ['.docx'] },
  { clave: 'EXCEL', etiqueta: 'Excel (.xlsx)', extensiones: ['.xlsx'] },
  { clave: 'POWERPOINT', etiqueta: 'PowerPoint (.pptx)', extensiones: ['.pptx'] },
  { clave: 'IMAGEN', etiqueta: 'Imagen (JPG, PNG o WEBP)', extensiones: ['.jpg', '.jpeg', '.png', '.webp'] },
];

export const MAX_BYTES_ENTREGA = 10 * 1024 * 1024;
/** Cuántos archivos admite una entrega cuando el docente permite varios. */
export const MAX_ARCHIVOS_POR_ENTREGA = 5;

/** El editor devuelve `<p></p>` vacío: solo cuenta como respuesta si tiene texto o una imagen. */
export const htmlTieneContenido = (html: string): boolean => html.replace(/<[^>]*>/g, '').trim() !== '' || /<img\b/i.test(html);

// Lo que el docente adjunta como material de apoyo (más formatos que las evidencias del estudiante).
export type TipoAdjunto = FormatoEvidencia | 'AUDIO' | 'VIDEO';
export const EXTENSIONES_ADJUNTO = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.docx', '.xlsx', '.pptx', '.mp3', '.mp4'];
export const MAX_BYTES_ADJUNTO = 50 * 1024 * 1024;
export const MAX_ADJUNTOS_POR_ACTIVIDAD = 10;
export const MAX_ARCHIVOS_POR_SUBIDA = 5;
export const MAX_VIDEOS_POR_ACTIVIDAD = 5;
export const MAX_BYTES_CONTENIDO_HTML = 2 * 1024 * 1024;
export const MAX_INTENTOS_ENTREGA = 10;
export const MAX_CARACTERES_COMENTARIO = 1000;

export const NOMBRES_TIPO_ADJUNTO: Record<TipoAdjunto, string> = {
  PDF: 'PDF',
  WORD: 'Word',
  EXCEL: 'Excel',
  POWERPOINT: 'PowerPoint',
  IMAGEN: 'Imagen',
  AUDIO: 'Audio',
  VIDEO: 'Video',
};

/** Desde dónde se puso la última nota de una actividad. */
export const ORIGENES_NOTA_ETIQUETA: Record<'ACTIVIDAD' | 'PLANILLA' | 'EXCEL', string> = {
  ACTIVIDAD: 'la actividad',
  PLANILLA: 'la planilla de notas',
  EXCEL: 'el Excel de la planilla',
};

/** Los campos que el docente cambió después de publicar, en palabras (lo que viaja en `modificaciones[].campos`). */
export const ETIQUETAS_CAMPO_MODIFICADO: Record<string, string> = {
  titulo: 'el título',
  tipo: 'el tipo',
  contenido_html: 'las instrucciones',
  adjuntos: 'el material de apoyo',
  videos: 'los videos',
  permite_editor_texto: 'el editor de texto de la entrega',
  permite_varios_archivos: 'la entrega de varios archivos',
  comentarios_docente: 'los comentarios del docente',
  fecha_apertura: 'la fecha de publicación',
  fecha_entrega: 'la fecha límite',
  requiere_entrega: 'si se entrega en la plataforma',
  formatos_permitidos: 'los formatos aceptados',
  permite_entrega_tardia: 'las entregas tardías',
  permite_multiples_entregas: 'cuántas veces se puede entregar',
};

export const etiquetaDeFormato = (clave: FormatoEvidencia): string => FORMATOS_EVIDENCIA.find((f) => f.clave === clave)?.etiqueta ?? clave;

export function extensionesDe(formatos: FormatoEvidencia[]): string[] {
  return FORMATOS_EVIDENCIA.filter((f) => formatos.includes(f.clave)).flatMap((f) => f.extensiones);
}

export function formatoTamano(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Los plazos de entrega son instantes con hora. Todo el sistema trabaja en hora de Colombia (UTC-5, sin horario de
// verano): el docente escribe y el estudiante lee la misma hora sin importar la zona del navegador.

const MS_HORA = 3_600_000;

/** 'YYYY-MM-DDTHH:mm' escrito por el usuario (hora de Colombia) -> instante ISO para la API. */
export function aInstante(valorInput: string): string {
  return new Date(`${valorInput}:00-05:00`).toISOString();
}

/** Instante ISO -> valor para <input type="datetime-local"> en hora de Colombia. */
export function aInputInstante(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * MS_HORA).toISOString().slice(0, 16);
}

/** Hoy en Colombia como YYYY-MM-DD. */
export function hoyColombia(): string {
  return new Date(Date.now() - 5 * MS_HORA).toISOString().slice(0, 10);
}

const FORMATO_INSTANTE = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });

export const formatoInstante = (iso: string): string => FORMATO_INSTANTE.format(new Date(iso));
export const formatoDiaCorto = (iso: string): string => FORMATO_DIA.format(new Date(iso));

/** Días enteros (hora de Colombia) entre hoy y el día de entrega: 0 = hoy, negativo = ya pasó. */
export function diasParaEntrega(iso: string): number {
  const dia = (instante: number) => Math.floor((instante - 5 * MS_HORA) / (24 * MS_HORA));
  return dia(new Date(iso).getTime()) - dia(Date.now());
}

/** El mes (AAAA-MM) en que cae un instante, en hora de Colombia. */
export function mesDeInstante(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * MS_HORA).toISOString().slice(0, 7);
}
