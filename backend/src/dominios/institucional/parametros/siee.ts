import { PONDERACION_COMPONENTES_POR_DEFECTO } from './siee.constants';
import type { IEscalaEvaluacion, IPonderacionComponentes } from '../calendario/academicYear.model';
import { escalaEfectiva, resolverDesempeno, ResultadoDesempeno } from './escalaEvaluacion';

/** Redondeo a 2 decimales para todas las notas expuestas en el boletin. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nivel cualitativo (Decreto 1290) de una nota según la escala de evaluación institucional del
 * año lectivo (o el respaldo 1.0-5.0 mientras no se haya configurado — CU-ADM-04). Delega en
 * `resolverDesempeno` para no duplicar la lógica de cortes ahora que la escala es configurable.
 */
export function desempenoCualitativo(nota: number, escala: IEscalaEvaluacion | null): ResultadoDesempeno {
  return resolverDesempeno(nota, escalaEfectiva(escala));
}

/**
 * Pesos de Saber/Hacer/Ser para la nota de asignatura: los que la institución personalizó en
 * el año lectivo (`AcademicYear.ponderacion_componentes`), o el respaldo 40/40/20 mientras no
 * lo haga (CU-ADM-04).
 */
export function ponderacionEfectiva(ponderacion: IPonderacionComponentes | null): IPonderacionComponentes {
  return ponderacion ?? PONDERACION_COMPONENTES_POR_DEFECTO;
}

/** Coherencia de la ponderación de componentes: los 3 pesos deben sumar exactamente 1 (100%). */
export function validarPonderacionComponentes(ponderacion: IPonderacionComponentes): string | null {
  const suma = Object.values(ponderacion).reduce((sum, peso) => sum + peso, 0);
  // Redondeo a 3 decimales para evitar falsos negativos por precision de punto flotante.
  const sumaRedondeada = Math.round(suma * 1000) / 1000;
  if (sumaRedondeada !== 1) {
    return `La suma de los pesos de los componentes (Saber + Hacer + Ser) debe ser exactamente 1 (100%). Suma actual: ${sumaRedondeada}.`;
  }
  return null;
}
