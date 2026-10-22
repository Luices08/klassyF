import { CriterioConfigurado } from '../constants/rematricula';

// Reglas puras de la rematrícula por grupo o grado (M19 → M04): quién tiene prioridad por un cupo y cómo se reparten los admitidos entre
// grupos paralelos. Sin base de datos: la simulación y la ejecución comparten estas funciones y por eso dan exactamente el mismo reparto.

export interface DatosDePrioridad {
  id: string;
  promedio: number | null;
  anios_en_plantel: number;
  faltas_graves: number;
  apellido: string;
  nombre: string;
  documento: string;
}

type Comparador = (a: DatosDePrioridad, b: DatosDePrioridad) => number;

const COMPARADORES: Record<CriterioConfigurado['criterio'], Comparador> = {
  // Sin promedio (cierre sin notas) va después de quien sí lo tiene.
  PROMEDIO_GENERAL: (a, b) => (b.promedio ?? -1) - (a.promedio ?? -1),
  ANTIGUEDAD: (a, b) => b.anios_en_plantel - a.anios_en_plantel,
  SIN_FALTAS_GRAVES: (a, b) => Number(a.faltas_graves > 0) - Number(b.faltas_graves > 0),
};

/**
 * Ordena de mayor a menor prioridad con los criterios ACTIVOS en el orden configurado. Lo que empata cae a un orden estable
 * (apellido, nombre, documento) para que el resultado sea reproducible.
 */
export function ordenarPorPrioridad<T extends DatosDePrioridad>(items: readonly T[], criterios: readonly CriterioConfigurado[]): T[] {
  const activos = criterios.filter((c) => c.activo).map((c) => COMPARADORES[c.criterio]);
  return [...items].sort((a, b) => {
    for (const comparar of activos) {
      const d = comparar(a, b);
      if (d !== 0) return d;
    }
    return a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es') || a.documento.localeCompare(b.documento, 'es', { numeric: true });
  });
}

/** Años cumplidos a la fecha de referencia (UTC, como el resto de fechas de calendario); null si no hay fecha de nacimiento. */
export function edadCumplida(nacimiento: Date | null | undefined, referencia: Date): number | null {
  if (!nacimiento) return null;
  let edad = referencia.getUTCFullYear() - nacimiento.getUTCFullYear();
  const antesDelCumple =
    referencia.getUTCMonth() < nacimiento.getUTCMonth() || (referencia.getUTCMonth() === nacimiento.getUTCMonth() && referencia.getUTCDate() < nacimiento.getUTCDate());
  if (antesDelCumple) edad -= 1;
  return edad;
}

export interface GrupoParalelo {
  id: string;
  nomenclatura: string;
  jornada_id: string | null;
  capacidad: number;
  ocupados: number;
  /** Lo que el grupo ya tiene (de etapas anteriores o de este mismo reparto), para equilibrar lo que falta. */
  repitentes: number;
  con_piar: number;
  edades: number[];
}

export interface SolicitudDeReparto {
  id: string;
  jornada_id: string | null;
  repitente: boolean;
  piar: boolean;
  edad: number | null;
}

export interface ResultadoReparto {
  /** Grupo asignado a cada solicitud; null = sin lugar (queda en lista de espera). */
  asignado: Map<string, string | null>;
  /** Estado final de cada grupo tras repartir. */
  grupos: GrupoParalelo[];
}

/**
 * Reparte, en el orden en que llegan (ya por prioridad), a los admitidos entre los grupos paralelos de un mismo grado y sede. No lleva al
 * estudiante «a su mismo salón»: para cada uno
 *  1. toma los grupos de su jornada con lugar (y, si no hay, los demás);
 *  2. descarta los que quedarían más llenos que el menos lleno por más de `toleranciaPct` puntos, para que los salones queden parejos;
 *  3. entre los que quedan prefiere el que tiene menos repitentes (si repite), menos estudiantes con PIAR (si lo tiene) y menos compañeros de
 *     su misma edad, y por último el menos lleno y la nomenclatura.
 * Determinista: nada depende de un azar.
 */
export function repartirConBalanceo(solicitudes: readonly SolicitudDeReparto[], grupos: readonly GrupoParalelo[], toleranciaPct: number): ResultadoReparto {
  const estado = grupos.map((g) => ({ ...g, edades: [...g.edades] }));
  const asignado = new Map<string, string | null>();

  for (const s of solicitudes) {
    const conLugar = estado.filter((g) => g.ocupados < g.capacidad);
    const deSuJornada = conLugar.filter((g) => g.jornada_id === s.jornada_id);
    const tramo = deSuJornada.length > 0 ? deSuJornada : conLugar;
    if (tramo.length === 0) {
      asignado.set(s.id, null);
      continue;
    }
    const llenura = (g: GrupoParalelo) => (g.ocupados + 1) / g.capacidad;
    const minima = Math.min(...tramo.map(llenura));
    const parejos = tramo.filter((g) => llenura(g) <= minima + toleranciaPct / 100);

    const clave = (g: GrupoParalelo): [number, number, number] => [
      (s.repitente ? g.repitentes : 0) + (s.piar ? g.con_piar : 0),
      s.edad === null ? 0 : g.edades.filter((e) => e === s.edad).length,
      llenura(g),
    ];
    const elegido = [...parejos].sort((a, b) => {
      const ka = clave(a);
      const kb = clave(b);
      for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
      return a.nomenclatura.localeCompare(b.nomenclatura, 'es', { numeric: true });
    })[0]!;

    elegido.ocupados += 1;
    if (s.repitente) elegido.repitentes += 1;
    if (s.piar) elegido.con_piar += 1;
    if (s.edad !== null) elegido.edades.push(s.edad);
    asignado.set(s.id, elegido.id);
  }
  return { asignado, grupos: estado };
}
