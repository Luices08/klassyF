import { COMPONENTES_SIEE } from '../constants/enums';
import { MAX_CASILLAS_BLOQUE, MAX_CASILLAS_POR_DEFECTO, MAX_COMPONENTES_EVALUATIVOS } from '../constants/notas';
import { NOMBRES_COMPONENTE_SIEE, PONDERACION_COMPONENTES_POR_DEFECTO } from '../constants/siee';
import type { IEscalaEvaluacion, IPonderacionComponentes } from '../models/academicYear.model';
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

export interface ComponenteEvaluativo {
  clave: string;
  nombre: string;
  porcentaje: number;
  max_casillas: number;
}

/**
 * Los bloques que forman la nota de una asignatura: los que la institución definió para el año (M12) o, mientras no
 * lo haga, Saber/Hacer/Ser con la ponderación que ya tenía (o el respaldo 40/40/20). Así un año anterior a M12 sigue
 * calculando exactamente igual, sin migrar datos.
 */
export function componentesEfectivos(anio: {
  componentes_evaluativos?: readonly ComponenteEvaluativo[] | null;
  ponderacion_componentes?: IPonderacionComponentes | null;
}): ComponenteEvaluativo[] {
  if (anio.componentes_evaluativos && anio.componentes_evaluativos.length > 0) {
    return anio.componentes_evaluativos.map(({ clave, nombre, porcentaje, max_casillas }) => ({ clave, nombre, porcentaje, max_casillas }));
  }
  const ponderacion = ponderacionEfectiva(anio.ponderacion_componentes ?? null);
  return COMPONENTES_SIEE.map((clave) => ({
    clave,
    nombre: NOMBRES_COMPONENTE_SIEE[clave],
    porcentaje: round2(ponderacion[clave] * 100),
    max_casillas: MAX_CASILLAS_POR_DEFECTO,
  }));
}

/** Coherencia de los bloques: claves y nombres únicos, al menos uno alimentado por actividades y porcentajes que suman 100. */
export function validarComponentesEvaluativos(componentes: readonly ComponenteEvaluativo[]): string | null {
  if (componentes.length === 0) return 'Define al menos un componente evaluativo.';
  if (componentes.length > MAX_COMPONENTES_EVALUATIVOS) {
    return `Un año admite hasta ${MAX_COMPONENTES_EVALUATIVOS} componentes evaluativos.`;
  }
  if (new Set(componentes.map((c) => c.clave)).size !== componentes.length) return 'Hay componentes con la misma clave.';
  if (new Set(componentes.map((c) => c.nombre.trim().toLowerCase())).size !== componentes.length) {
    return 'Hay componentes con el mismo nombre.';
  }
  const sinCasillas = componentes.find((c) => !Number.isInteger(c.max_casillas) || c.max_casillas < 1 || c.max_casillas > MAX_CASILLAS_BLOQUE);
  if (sinCasillas) return `«${sinCasillas.nombre}»: las casillas máximas deben ser un entero entre 1 y ${MAX_CASILLAS_BLOQUE}.`;
  const suma = Math.round(componentes.reduce((total, c) => total + c.porcentaje, 0) * 100) / 100;
  if (suma !== 100) return `Los porcentajes de los componentes deben sumar exactamente 100. Suma actual: ${suma}.`;
  return null;
}

/** Clave estable para un componente nuevo a partir de su nombre (HETEROEVALUACION), sin chocar con las ya usadas. */
export function claveDeComponente(nombre: string, usadas: ReadonlySet<string>): string {
  const base =
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 34) || 'COMPONENTE';
  let clave = base.length >= 2 ? base : `${base}_`;
  for (let i = 2; usadas.has(clave); i += 1) clave = `${base}_${i}`;
  return clave;
}
