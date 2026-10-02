import { TonoEstadoAsistencia } from './enums';

export interface EstadoAsistenciaBase {
  nombre: string;
  abreviatura: string;
  tono: TonoEstadoAsistencia;
  cuenta_como_falla: boolean;
  es_retardo: boolean;
  es_justificada: boolean;
  es_predeterminado: boolean;
  orden: number;
}

// Punto de partida que se siembra una sola vez por institución; después es configuración suya
// (se renombran, se agregan o se desactivan) y nada del código depende de estos nombres.
export const ESTADOS_ASISTENCIA_BASE: readonly EstadoAsistenciaBase[] = [
  { nombre: 'Presente', abreviatura: 'P', tono: 'green', cuenta_como_falla: false, es_retardo: false, es_justificada: false, es_predeterminado: true, orden: 1 },
  { nombre: 'Ausencia', abreviatura: 'A', tono: 'red', cuenta_como_falla: true, es_retardo: false, es_justificada: false, es_predeterminado: false, orden: 2 },
  { nombre: 'Retardo', abreviatura: 'R', tono: 'orange', cuenta_como_falla: false, es_retardo: true, es_justificada: false, es_predeterminado: false, orden: 3 },
  { nombre: 'Excusa', abreviatura: 'E', tono: 'blue', cuenta_como_falla: true, es_retardo: false, es_justificada: true, es_predeterminado: false, orden: 4 },
];

export const MAX_BYTES_EVIDENCIA = 5 * 1024 * 1024;
