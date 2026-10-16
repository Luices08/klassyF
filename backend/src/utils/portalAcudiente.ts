import { EstadoMatricula } from '../constants/enums';

const TERMINALES: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];

/**
 * La matrícula que cuenta hoy para el portal del acudiente (M27): la más reciente que no esté retirada ni anulada; si no hay, la más
 * reciente. Espera la lista ya ordenada de la más nueva a la más antigua.
 */
export function matriculaVigente<T extends { estado: EstadoMatricula }>(matriculas: T[]): T | null {
  return matriculas.find((m) => !TERMINALES.includes(m.estado)) ?? matriculas[0] ?? null;
}
