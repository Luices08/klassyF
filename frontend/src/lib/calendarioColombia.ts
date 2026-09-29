import type { Calendario } from '../types/domain';

/**
 * Reglas del calendario escolar colombiano (Decreto 1075 de 2015 y calendarios A/B del MEN):
 * el calendario A corre entre ene/feb y nov/dic del mismo año; el calendario B, entre
 * ago/sept de un año y jun/jul del siguiente. Se usan solo como aviso, no como bloqueo,
 * porque cada institucion puede ajustar sus fechas exactas dentro del año lectivo.
 */
const REGLAS_CALENDARIO: Record<Calendario, { inicio: [number, number]; fin: [number, number]; anioFin: number }> = {
  A: { inicio: [1, 2], fin: [11, 12], anioFin: 0 },
  B: { inicio: [8, 9], fin: [6, 7], anioFin: 1 },
};

const MESES = [
  '',
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function mesAnio(fecha: string): { anio: number; mes: number } | null {
  if (!fecha) return null;
  const [anio, mes] = fecha.split('-').map(Number);
  if (!anio || !mes) return null;
  return { anio, mes };
}

interface PeriodoConFechas {
  fecha_inicio: string;
  fecha_fin: string;
}

/** Avisos (no bloqueantes) si el primer/ultimo periodo se sale de lo habitual para el calendario y el año elegidos. */
export function avisosCalendario(calendario: Calendario, year: number, periodos: PeriodoConFechas[]): string[] {
  const primero = periodos[0];
  const ultimo = periodos[periodos.length - 1];
  if (!primero || !ultimo) return [];

  const regla = REGLAS_CALENDARIO[calendario];
  const anioFin = year + regla.anioFin;
  const avisos: string[] = [];

  const inicio = mesAnio(primero.fecha_inicio);
  if (inicio && (inicio.anio !== year || !regla.inicio.includes(inicio.mes))) {
    avisos.push(
      `Calendario ${calendario}: el periodo inicial suele empezar entre ${MESES[regla.inicio[0]]} y ${MESES[regla.inicio[1]]} de ${year}.`
    );
  }

  const fin = mesAnio(ultimo.fecha_fin);
  if (fin && (fin.anio !== anioFin || !regla.fin.includes(fin.mes))) {
    avisos.push(
      `Calendario ${calendario}: el periodo final suele terminar entre ${MESES[regla.fin[0]]} y ${MESES[regla.fin[1]]} de ${anioFin}.`
    );
  }

  return avisos;
}
