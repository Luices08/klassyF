import type { EstadoAsistencia, TonoEstadoAsistencia } from '../types/domain';

export const NOMBRES_TONO: Record<TonoEstadoAsistencia, string> = {
  green: 'Verde',
  orange: 'Naranja',
  red: 'Rojo',
  blue: 'Azul',
  neutral: 'Gris',
};

export type ConteoEstadoAsistencia = 'PRESENCIA' | 'FALLA' | 'RETARDO';

export const NOMBRES_CONTEO: Record<ConteoEstadoAsistencia, string> = {
  PRESENCIA: 'Asistió',
  FALLA: 'Falla (inasistencia)',
  RETARDO: 'Retardo (llegó tarde)',
};

export function conteoDe(e: Pick<EstadoAsistencia, 'cuenta_como_falla' | 'es_retardo'>): ConteoEstadoAsistencia {
  return e.cuenta_como_falla ? 'FALLA' : e.es_retardo ? 'RETARDO' : 'PRESENCIA';
}
