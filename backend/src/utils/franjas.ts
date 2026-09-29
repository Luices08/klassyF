import { TipoFranja } from '../constants/enums';
import ApiError from './ApiError';

/**
 * Franjas horarias de una jornada (M01): los bloques de clase y de descanso reales del dia. Son la estructura de
 * tiempo que comparten la malla de ocupacion de espacios (M10) y el motor de horarios (M09).
 */

export interface Franja {
  nombre: string;
  tipo: TipoFranja;
  /** "HH:MM" en 24 horas. */
  hora_inicio: string;
  hora_fin: string;
}

/** Bloque de la plantilla institucional: solo duracion, sin hora fija (sirve igual a jornadas de mañana y de tarde). */
export interface FranjaPlantilla {
  nombre: string;
  tipo: TipoFranja;
  duracion_min: number;
}

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function aHHMM(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/**
 * Coherencia de las franjas de una jornada: dentro de su horario, cada una con fin posterior a su inicio y en
 * orden sin traslapes. Devuelve el primer problema (en español) o null si son validas.
 */
export function validarFranjas(franjas: readonly Franja[], jornada: { hora_inicio: string; hora_fin: string }): string | null {
  const desde = aMinutos(jornada.hora_inicio);
  const hasta = aMinutos(jornada.hora_fin);
  let finAnterior = desde;

  for (const f of franjas) {
    const inicio = aMinutos(f.hora_inicio);
    const fin = aMinutos(f.hora_fin);
    if (fin <= inicio) return `La franja "${f.nombre}" termina antes de empezar.`;
    if (inicio < desde || fin > hasta) {
      return `La franja "${f.nombre}" (${f.hora_inicio}–${f.hora_fin}) queda fuera del horario de la jornada (${jornada.hora_inicio}–${jornada.hora_fin}).`;
    }
    if (inicio < finAnterior) return `La franja "${f.nombre}" se traslapa con la anterior: las franjas deben ir en orden.`;
    finAnterior = fin;
  }
  return null;
}

/**
 * Convierte la plantilla institucional (bloques con duracion) en franjas reales de una jornada, encadenandolas desde su
 * hora de inicio. Si la plantilla dura mas que la jornada no se recorta en silencio: se informa.
 */
export function generarFranjas(
  plantilla: readonly FranjaPlantilla[],
  jornada: { hora_inicio: string; hora_fin: string }
): { franjas: Franja[]; minutos_libres: number } {
  if (plantilla.length === 0) {
    throw new ApiError(
      409,
      'La institución aún no tiene una plantilla de franjas horarias. Defínela en Configuración institucional.'
    );
  }

  const desde = aMinutos(jornada.hora_inicio);
  const hasta = aMinutos(jornada.hora_fin);
  const total = plantilla.reduce((suma, b) => suma + b.duracion_min, 0);
  if (desde + total > hasta) {
    throw new ApiError(
      409,
      `La plantilla dura ${total} minutos y la jornada (${jornada.hora_inicio}–${jornada.hora_fin}) solo tiene ${hasta - desde}. Ajusta la plantilla o define las franjas de esta jornada a mano.`
    );
  }

  let cursor = desde;
  const franjas = plantilla.map((b) => {
    const franja: Franja = { nombre: b.nombre, tipo: b.tipo, hora_inicio: aHHMM(cursor), hora_fin: aHHMM(cursor + b.duracion_min) };
    cursor += b.duracion_min;
    return franja;
  });
  return { franjas, minutos_libres: hasta - cursor };
}
