import type { Eficiencia, FilaEficiencia } from '../hooks/useDashboard';
import { NOMBRES_NIVEL_EDUCATIVO } from '../types/domain';

type Conteos = Pick<FilaEficiencia, 'matriculados' | 'retirados' | 'promovidos' | 'no_promovidos' | 'pendientes' | 'sin_perdidas' | 'con_perdidas'>;

export interface MedidasDeEficiencia {
  /** Porcentajes enteros sobre quienes ya tienen resultado; `null` = nadie que medir (nunca un 0 % inventado). */
  aprobados: number | null;
  reprobados: number | null;
  /** Retirados y traslados sobre la matrícula inicial (activos + retirados). */
  desertores: number | null;
  total: number;
}

const porcentaje = (parte: number, base: number): number | null => (base > 0 ? (parte / base) * 100 : null);

/** Mismas reglas que el % institucional del panel (`resumirRendimiento`), así que la fila de total coincide con la tarjeta de rendimiento. */
export function medidasDeEficiencia(c: Conteos): MedidasDeEficiencia {
  const bien = c.promovidos + c.sin_perdidas;
  const mal = c.no_promovidos + c.con_perdidas + c.pendientes;
  return {
    aprobados: porcentaje(bien, bien + mal),
    reprobados: porcentaje(mal, bien + mal),
    desertores: porcentaje(c.retirados, c.matriculados + c.retirados),
    total: c.matriculados,
  };
}

export interface GrupoDeNivel extends MedidasDeEficiencia {
  clave: string;
  etiqueta: string;
  grados: Array<MedidasDeEficiencia & { clave: string; etiqueta: string }>;
}

const CAMPOS: Array<keyof Conteos> = ['matriculados', 'retirados', 'promovidos', 'no_promovidos', 'pendientes', 'sin_perdidas', 'con_perdidas'];

/** Agrupa los grados por nivel del catálogo (Preescolar, Primaria…), en orden de grado. Una fila sin nivel (respuesta anterior al campo) va en un solo grupo. */
export function agruparPorNivel(filas: readonly FilaEficiencia[]): GrupoDeNivel[] {
  const grupos = new Map<string, FilaEficiencia[]>();
  for (const f of [...filas].sort((a, b) => a.grado_numero - b.grado_numero)) {
    const clave = f.nivel ?? 'SIN_NIVEL';
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  return [...grupos.entries()].map(([clave, grados]) => {
    const suma = Object.fromEntries(CAMPOS.map((campo) => [campo, grados.reduce((s, g) => s + g[campo], 0)])) as Conteos;
    return {
      clave,
      etiqueta: clave === 'SIN_NIVEL' ? 'Todos los grados' : NOMBRES_NIVEL_EDUCATIVO[clave as keyof typeof NOMBRES_NIVEL_EDUCATIVO],
      ...medidasDeEficiencia(suma),
      grados: grados.map((g) => ({ clave: g.grado_id, etiqueta: g.grado, ...medidasDeEficiencia(g) })),
    };
  });
}

export const medidasDeTotales = (t: Eficiencia['totales']): MedidasDeEficiencia => medidasDeEficiencia(t);

/** «96 %», «<1 %» (hay alguien pero redondea a cero) o `null` si no hay nada que medir. */
export function textoPorcentajeEntero(valor: number | null): string | null {
  if (valor === null) return null;
  if (valor > 0 && valor < 1) return '<1 %';
  return `${Math.round(valor)} %`;
}
