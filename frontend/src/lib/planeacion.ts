import type { PersonaPlaneacion, VentanaEntrega } from '../types/domain';
import { formatoFechaCalendario, formatoFechaHora } from './fechas';

// Mismos topes que exige el servidor (constants/planeacion.ts): aquí solo avisan antes de subir.
export const MAX_BYTES_PLANEACION = 25 * 1024 * 1024;
export const MAX_TITULO_PLAN = 150;
export const MAX_DESCRIPCION_PLAN = 2000;
export const MAX_COMENTARIO_REVISION = 2000;

export const nombreDePersona = (persona: PersonaPlaneacion | null | undefined): string => (persona ? `${persona.nombre} ${persona.apellido}` : '—');

/** «27 mar 2026 – 12 abr 2026»: los días de calendario se formatean en UTC (ver lib/fechas). */
export const textoVentana = (ventana: Pick<VentanaEntrega, 'apertura' | 'limite'>): string =>
  `${formatoFechaCalendario(ventana.apertura)} – ${formatoFechaCalendario(ventana.limite)}`;

/** `radicado_en` es la fecha de la última versión enviada: desde la segunda versión ya no es «cuándo se radicó». */
export const textoUltimoEnvio = (radicadoEn: string | null, version: number): string =>
  `${radicadoEn ? `${version > 1 ? 'Última versión enviada el' : 'Radicado el'} ${formatoFechaHora(radicadoEn)}` : 'Radicado'} · versión ${version}`;

export function tamanoLegible(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
