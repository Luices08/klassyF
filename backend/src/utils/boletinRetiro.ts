import { notaDefinitiva } from './certificadoEstudios';

export interface PeriodoParaRetiro {
  numero: number;
  nombre: string;
  estado: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  porcentaje: number;
}

export interface PeriodosDelRetiro {
  /** Periodos que terminaron antes de la salida y ya están cerrados (M05): sus definitivas son las oficiales. */
  oficiales: PeriodoParaRetiro[];
  /** El periodo en que salió (o que terminó sin cerrarse), solo si el SIEE del colegio permite exportar notas parciales de corte. */
  corte: PeriodoParaRetiro | null;
  /** Ese mismo periodo cuando el SIEE no permite exportar el corte: no se incluye y el documento lo avisa. */
  omitido: PeriodoParaRetiro | null;
}

const dia = (f: Date): number => Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());

/**
 * Qué periodos entran en el boletín parcial de retiro. Son oficiales los CERRADOS (M05) que terminaron a más tardar el día de la salida: el estudiante
 * los completó. El periodo en que sale (aunque después se cierre: él ya no estaba en la planilla) o uno que terminó sin cerrarse todavía no tiene definitivas
 * suyas: es un corte parcial solo si el colegio lo autorizó en su SIEE. Un periodo que arrancó después de la salida no lo cursó.
 */
export function periodosDelRetiro(periodos: readonly PeriodoParaRetiro[], fechaEfectiva: Date, incluirCorte: boolean): PeriodosDelRetiro {
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);
  const alcanzados = ordenados.filter((p) => dia(p.fecha_inicio) <= dia(fechaEfectiva));
  const esOficial = (p: PeriodoParaRetiro): boolean => p.estado === 'CERRADO' && dia(p.fecha_fin) <= dia(fechaEfectiva);
  const oficiales = alcanzados.filter(esOficial);
  const enCurso = [...alcanzados].reverse().find((p) => !esOficial(p)) ?? null;
  return { oficiales, corte: incluirCorte ? enCurso : null, omitido: incluirCorte ? null : enCurso };
}

export interface NotaOficialDePeriodo {
  nota: number | null;
  exenta: boolean;
}

/**
 * La nota acumulada de una asignatura (o del promedio general) a la fecha de la salida: las notas de los periodos oficiales ponderadas por el
 * porcentaje que M05 le asignó a cada uno, repartido entre los periodos incluidos (no se supone que el estudiante cursó los que faltan). Si una nota
 * oficial falta, no hay acumulado: nunca se promedia lo que no existe.
 */
export function acumuladoDeNotas(notas: readonly NotaOficialDePeriodo[], porcentajes: readonly number[]): number | null {
  if (notas.length === 0) return null;
  return notaDefinitiva(
    notas.map((n) => n.nota),
    porcentajes,
    notas.map((n) => n.exenta)
  );
}
