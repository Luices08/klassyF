import { MetodoCalculoEvaluacion } from '../constants/enums';
import { EstadoNota } from '../constants/notas';
import { ComponenteEvaluativo, round2 } from './siee';

/**
 * Motor de cálculo de M12 (funciones puras): de las notas de las actividades y las notas directas llega a la nota de la
 * asignatura, y de las asignaturas a la del área. Lo usan la planilla, el cierre y el boletín (M17): una sola fórmula.
 * `null` significa «falta nota», nunca 0: un 0 es una nota.
 */

export interface ActividadParaCalculo {
  id: string;
  componente: string;
  peso: number;
}

export interface EntradaNotaAsignatura {
  componentes: readonly ComponenteEvaluativo[];
  actividades: readonly ActividadParaCalculo[];
  /** Notas del estudiante en las actividades: id de actividad -> nota (solo las ya calificadas). */
  notasActividad: ReadonlyMap<string, number>;
  /** Notas directas del estudiante: clave del componente -> nota. */
  notasDirectas: ReadonlyMap<string, number>;
}

export interface NotaComponente {
  clave: string;
  nota: number | null;
  /** Tiene nota y, si se alimenta de actividades, todas están calificadas. */
  completo: boolean;
}

export interface ResultadoAsignatura {
  componentes: NotaComponente[];
  /** Promedio ponderado de los componentes que ya tienen nota: parcial mientras `completa` sea false. */
  nota: number | null;
  completa: boolean;
  /** Claves de los componentes que aún no están completos. */
  faltantes: string[];
}

/**
 * Promedio de las actividades calificadas ponderado por su peso. Si todos los pesos son 0 se promedian por igual (no se
 * divide por cero). Sin ninguna calificada no hay nota.
 */
function promedioDeActividades(actividades: readonly ActividadParaCalculo[], notas: ReadonlyMap<string, number>): NotaComponente['nota'] {
  const calificadas = actividades.filter((a) => notas.has(a.id));
  if (calificadas.length === 0) return null;

  const sumaPesos = calificadas.reduce((suma, a) => suma + a.peso, 0);
  if (sumaPesos === 0) return round2(calificadas.reduce((suma, a) => suma + (notas.get(a.id) as number), 0) / calificadas.length);
  return round2(calificadas.reduce((suma, a) => suma + (notas.get(a.id) as number) * a.peso, 0) / sumaPesos);
}

export function calcularNotaAsignatura(entrada: EntradaNotaAsignatura): ResultadoAsignatura {
  const componentes: NotaComponente[] = entrada.componentes.map((componente) => {
    if (componente.origen === 'NOTA_DIRECTA') {
      const nota = entrada.notasDirectas.get(componente.clave) ?? null;
      return { clave: componente.clave, nota, completo: nota !== null };
    }

    const propias = entrada.actividades.filter((a) => a.componente === componente.clave);
    const nota = promedioDeActividades(propias, entrada.notasActividad);
    const todasCalificadas = propias.length > 0 && propias.every((a) => entrada.notasActividad.has(a.id));
    return { clave: componente.clave, nota, completo: todasCalificadas };
  });

  const porcentajeDe = new Map(entrada.componentes.map((c) => [c.clave, c.porcentaje]));
  const conNota = componentes.filter((c) => c.nota !== null);
  const sumaPorcentajes = conNota.reduce((suma, c) => suma + (porcentajeDe.get(c.clave) ?? 0), 0);
  const nota =
    conNota.length === 0 || sumaPorcentajes === 0
      ? null
      : round2(conNota.reduce((suma, c) => suma + (c.nota as number) * (porcentajeDe.get(c.clave) ?? 0), 0) / sumaPorcentajes);

  return {
    componentes,
    nota,
    completa: componentes.length > 0 && componentes.every((c) => c.completo),
    faltantes: componentes.filter((c) => !c.completo).map((c) => c.clave),
  };
}

/** Mientras no se cierre, la nota está PENDIENTE (faltan notas) o en BORRADOR (completa, aún editable). */
export function estadoAbiertoDe(resultado: Pick<ResultadoAsignatura, 'completa'>): Extract<EstadoNota, 'PENDIENTE' | 'BORRADOR'> {
  return resultado.completa ? 'BORRADOR' : 'PENDIENTE';
}

export interface AsignaturaParaArea {
  nota: number | null;
  /** Solo cuenta con el método PONDERADO (M06); con ARITMETICO todas pesan igual. */
  porcentaje: number | null;
}

/** Nota del área según el método configurado en M06. Si falta la nota de alguna asignatura, el área no se calcula. */
export function calcularNotaArea(asignaturas: readonly AsignaturaParaArea[], metodo: MetodoCalculoEvaluacion): number | null {
  if (asignaturas.length === 0 || asignaturas.some((a) => a.nota === null)) return null;
  if (metodo === 'PONDERADO') {
    return round2(asignaturas.reduce((suma, a) => suma + (a.nota as number) * ((a.porcentaje ?? 0) / 100), 0));
  }
  return round2(asignaturas.reduce((suma, a) => suma + (a.nota as number), 0) / asignaturas.length);
}

/** Promedio aritmético de las notas de área; sin todas las áreas no hay promedio general. */
export function calcularPromedioGeneral(notasArea: ReadonlyArray<number | null>): number | null {
  if (notasArea.length === 0 || notasArea.some((n) => n === null)) return null;
  return round2((notasArea as number[]).reduce((suma, n) => suma + n, 0) / notasArea.length);
}
