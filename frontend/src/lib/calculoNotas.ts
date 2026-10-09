import type { Desempeno } from '../types/reportCard';
import type { ComponenteEvaluativo } from '../types/domain';

// Espejo de backend/src/utils/calculoNotas.ts y de escalaEvaluacion#resolverDesempeno. La planilla lo usa solo para mostrar
// el resultado EN VIVO mientras el docente escribe; lo que vale (y lo que lee el boletín) es siempre lo que calcula y congela
// el servidor. Si la fórmula cambia allá, se cambia aquí en el mismo cambio.

export interface ActividadCalculo {
  id: string;
  componente: string;
  peso: number;
}

export interface ResultadoCalculo {
  componentes: Record<string, number | null>;
  nota: number | null;
  completa: boolean;
}

const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcularNotaAsignatura(
  componentes: readonly ComponenteEvaluativo[],
  actividades: readonly ActividadCalculo[],
  notasActividad: ReadonlyMap<string, number>,
  notasDirectas: ReadonlyMap<string, number>
): ResultadoCalculo {
  const porComponente: Record<string, number | null> = {};
  let completa = componentes.length > 0;

  for (const componente of componentes) {
    if (componente.origen === 'NOTA_DIRECTA') {
      const nota = notasDirectas.get(componente.clave) ?? null;
      porComponente[componente.clave] = nota;
      if (nota === null) completa = false;
      continue;
    }
    const propias = actividades.filter((a) => a.componente === componente.clave);
    const calificadas = propias.filter((a) => notasActividad.has(a.id));
    const sumaPesos = calificadas.reduce((suma, a) => suma + a.peso, 0);
    porComponente[componente.clave] =
      calificadas.length === 0
        ? null
        : sumaPesos === 0
          ? redondear2(calificadas.reduce((suma, a) => suma + (notasActividad.get(a.id) as number), 0) / calificadas.length)
          : redondear2(calificadas.reduce((suma, a) => suma + (notasActividad.get(a.id) as number) * a.peso, 0) / sumaPesos);
    if (propias.length === 0 || calificadas.length < propias.length) completa = false;
  }

  const conNota = componentes.filter((c) => porComponente[c.clave] !== null);
  const sumaPorcentajes = conNota.reduce((suma, c) => suma + c.porcentaje, 0);
  const nota =
    conNota.length === 0 || sumaPorcentajes === 0
      ? null
      : redondear2(conNota.reduce((suma, c) => suma + (porComponente[c.clave] as number) * c.porcentaje, 0) / sumaPorcentajes);
  return { componentes: porComponente, nota, completa };
}

export interface EscalaPlanilla {
  nota_minima: number;
  nota_maxima: number;
  precision_decimales: number;
  rangos: Array<{ nivel: Desempeno['nivel']; etiqueta: string; valor_minimo: number; valor_maximo: number; es_aprobatorio: boolean }>;
}

/** El nivel de una nota con la precisión de la escala; un hueco entre rangos pertenece al inferior. */
export function desempenoDe(nota: number, escala: EscalaPlanilla): Desempeno | null {
  const factor = 10 ** escala.precision_decimales;
  const redondeada = Math.round((nota + Number.EPSILON) * factor) / factor;
  const rango =
    escala.rangos.find((r) => redondeada >= r.valor_minimo && redondeada <= r.valor_maximo) ??
    [...escala.rangos].sort((a, b) => b.valor_minimo - a.valor_minimo).find((r) => redondeada >= r.valor_minimo);
  return rango ? { nota, nivel: rango.nivel, etiqueta: rango.etiqueta, aprobado: rango.es_aprobatorio } : null;
}
