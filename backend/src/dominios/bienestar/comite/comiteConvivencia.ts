import { createHash } from 'crypto';

export interface Quorum {
  total_miembros: number;
  presentes: number;
  porcentaje_requerido: number;
  alcanzado: boolean;
}

/** Hay quórum si los presentes son, al menos, el porcentaje requerido de los miembros (y al menos uno). */
export function calcularQuorum(total: number, presentes: number, porcentaje: number): Quorum {
  return {
    total_miembros: total,
    presentes,
    porcentaje_requerido: porcentaje,
    alcanzado: total > 0 && presentes > 0 && presentes * 100 >= total * porcentaje,
  };
}

/**
 * Quórum para deliberar un caso: quien está recusado (implicado o con conflicto de interés) no cuenta ni como miembro ni
 * como presente, aunque haya asistido a la sesión (RN-15-11).
 */
export function quorumDeCaso(asistentes: { miembro_id: string; asistio: boolean }[], recusados: string[], porcentaje: number): Quorum {
  const aparta = new Set(recusados);
  const quienesDeliberan = asistentes.filter((a) => !aparta.has(a.miembro_id));
  return calcularQuorum(quienesDeliberan.length, quienesDeliberan.filter((a) => a.asistio).length, porcentaje);
}

/** JSON con las claves ordenadas: el mismo contenido da siempre la misma cadena, sin importar el orden de los campos. */
export function serializacionEstable(valor: unknown): string {
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map(serializacionEstable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    const claves = Object.keys(objeto)
      .filter((k) => objeto[k] !== undefined)
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${serializacionEstable(objeto[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
}

/** Huella SHA-256 del contenido del acta al firmarla: cualquier cambio posterior en la base se detecta recalculándola. */
export function hashDeActa(contenido: unknown): string {
  return createHash('sha256').update(serializacionEstable(contenido)).digest('hex');
}
