import { porcentaje } from './dashboard';

/**
 * Cálculos del panel de secretaría (M30). Puros: reciben lo ya leído de M01, M04 y la renovación de antiguos. Solo cuentan trámites; ninguna cifra lleva
 * datos de salud, convivencia ni notas, que secretaría no consulta.
 */

const MS_DIA = 86_400_000;

export interface GrupoParaOcupacion {
  grado_id: string;
  grado: string;
  grado_numero: number;
  max_capacity: number;
  cupos_ocupados: number;
}

export interface OcupacionDeGrado {
  grado_id: string;
  grado: string;
  grado_numero: number;
  ocupados: number;
  capacidad: number;
  ocupacion_pct: number | null;
}

/** La ocupación de cupos de cada grado (suma de sus grupos), de la más llena a la menos llena y limitada a las `max` primeras. */
export function ocupacionPorGrado(grupos: readonly GrupoParaOcupacion[], max: number): OcupacionDeGrado[] {
  const grados = new Map<string, OcupacionDeGrado>();
  for (const g of grupos) {
    const actual = grados.get(g.grado_id) ?? { grado_id: g.grado_id, grado: g.grado, grado_numero: g.grado_numero, ocupados: 0, capacidad: 0, ocupacion_pct: null };
    actual.ocupados += g.cupos_ocupados;
    actual.capacidad += g.max_capacity;
    grados.set(g.grado_id, actual);
  }
  return [...grados.values()]
    .filter((g) => g.capacidad > 0)
    .map((g) => ({ ...g, ocupacion_pct: porcentaje(g.ocupados, g.capacidad) }))
    .sort((a, b) => (b.ocupacion_pct ?? 0) - (a.ocupacion_pct ?? 0) || a.grado_numero - b.grado_numero)
    .slice(0, max);
}

export interface MatriculaCondicional {
  fecha_limite_compromiso: Date | null;
}

/** Cuántas matrículas condicionales hay y cuántas ya pasaron el último día del acta de compromiso (el día del plazo todavía vale). */
export function resumirCondicionales(matriculas: readonly MatriculaCondicional[], ahora: Date): { total: number; plazo_vencido: number } {
  const vencidas = matriculas.filter((m) => m.fecha_limite_compromiso && m.fecha_limite_compromiso.getTime() + MS_DIA <= ahora.getTime()).length;
  return { total: matriculas.length, plazo_vencido: vencidas };
}

export interface ItemDeChecklist {
  estado: string;
}

/** Los documentos que la familia o el personal subieron y nadie ha revisado (`CARGADO`), sumados de todas las matrículas. */
export function documentosPorRevisar(checklists: ReadonlyArray<readonly ItemDeChecklist[]>): number {
  return checklists.reduce((suma, lista) => suma + lista.filter((d) => d.estado === 'CARGADO').length, 0);
}

/**
 * La renovación de antiguos: quienes ya respondieron y quienes faltan. «Sin respuesta» se deriva (no se guarda): son los matriculados que todavía no
 * dijeron si continúan; nunca negativo aunque haya respuestas de quien ya no tiene matrícula activa.
 */
export function resumirRenovacion(matriculadosActivos: number, decisiones: readonly string[]): { continuan: number; no_continuan: number; sin_respuesta: number } {
  const continuan = decisiones.filter((d) => d === 'CONTINUA').length;
  const noContinuan = decisiones.filter((d) => d === 'NO_CONTINUA').length;
  return { continuan, no_continuan: noContinuan, sin_respuesta: Math.max(0, matriculadosActivos - continuan - noContinuan) };
}
