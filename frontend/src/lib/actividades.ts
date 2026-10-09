import type { ComponenteSiee } from '../types/domain';

// Espejo de backend/src/constants/actividades.ts: el contrato entre ambos lados se cambia en los dos a la vez.

export const TIPOS_ACTIVIDAD = ['TAREA', 'EVALUACION', 'TRABAJO', 'PROYECTO'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

export const NOMBRES_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  TAREA: 'Tarea',
  EVALUACION: 'Evaluación',
  TRABAJO: 'Trabajo',
  PROYECTO: 'Proyecto',
};

export const NOMBRES_COMPONENTE_SIEE: Record<ComponenteSiee, string> = {
  COGNITIVO_SABER: 'Saber (cognitivo)',
  PROCEDIMENTAL_HACER: 'Hacer (procedimental)',
  ACTITUDINAL_SER: 'Ser (actitudinal)',
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
