import { ColorAsignatura, PALETA_ASIGNATURAS } from '../constants/horarios';

/**
 * Un color por asignatura, sin repetirse mientras haya colores en la paleta: se reparten por el orden de los ids, que es el
 * de creación, así que agregar una asignatura nueva no cambia el color de las que ya estaban.
 */
export function asignarColoresAsignaturas(ids: Iterable<string>): Map<string, ColorAsignatura> {
  const ordenados = [...new Set(ids)].sort();
  return new Map(ordenados.map((id, i) => [id, PALETA_ASIGNATURAS[i % PALETA_ASIGNATURAS.length]!]));
}
