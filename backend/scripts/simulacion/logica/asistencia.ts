/**
 * Asistencia y faltas de convivencia del estudiante simulado. Salen de sus variables latentes (`asistencia_base`, `puntualidad`,
 * `riesgo_convivencia`), que ya se correlacionan con la habilidad al generarlo: así la inasistencia y las faltas acompañan al bajo
 * rendimiento sin ser una copia de la nota. Funciones puras con pruebas.
 */
import { Azar } from '../nucleo/azar';
import { diaIso } from '../nucleo/fechas';
import { Latentes } from './perfiles';

export interface ParametrosAsistencia {
  /** De cada inasistencia, qué fracción trae excusa (estado justificado). */
  proporcion_justificadas: number;
  /** Probabilidad de retardo en una clase = puntualidad × este factor. */
  factor_retardo: number;
  /** Cada cuántos días lectivos el docente pasa la asistencia a la plataforma. */
  dias_por_registro: number;
}

export type Ausencia = 'INJUSTIFICADA' | 'JUSTIFICADA' | null;

/**
 * ¿Falta el estudiante ese día? Se decide una vez por estudiante y día (el azar se pide con esas claves), así falta a todas las
 * clases del día y no a una sí y a otra no.
 */
export function ausenciaDelDia(latentes: Pick<Latentes, 'asistencia_base'>, parametros: ParametrosAsistencia, azar: Azar): Ausencia {
  if (!azar.prob(latentes.asistencia_base)) return null;
  return azar.prob(parametros.proporcion_justificadas) ? 'JUSTIFICADA' : 'INJUSTIFICADA';
}

export function hayRetardo(latentes: Pick<Latentes, 'puntualidad'>, parametros: ParametrosAsistencia, azar: Azar): boolean {
  return azar.prob(Math.min(0.3, latentes.puntualidad * parametros.factor_retardo));
}

/** Los días lectivos en que la clase se dicta según el horario publicado (días ISO); sin horario, todos. */
export function diasDeClase(lectivos: readonly Date[], diasDeLaSemana: ReadonlySet<number> | undefined): Date[] {
  if (!diasDeLaSemana || diasDeLaSemana.size === 0) return [...lectivos];
  return lectivos.filter((d) => diasDeLaSemana.has(diaIso(d)));
}

/** Parte los días lectivos en tramos de `tamano` días: al final de cada uno el docente sube la asistencia del tramo. */
export function tramos<T>(lista: readonly T[], tamano: number): T[][] {
  if (tamano < 1) throw new Error('El tramo debe tener al menos un día.');
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

/** Conteo de Poisson (Knuth): para pocos eventos por periodo es exacto y suficiente. */
export function poisson(lambda: number, azar: Azar): number {
  if (lambda <= 0) return 0;
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= azar.num();
  } while (p > limite);
  return k - 1;
}

export type Gravedad = 'I' | 'II' | 'III';

export interface ParametrosConvivencia {
  /** Faltas esperadas por periodo para un riesgo de convivencia de 1 (Tipo I lineal, II cuadrático y III cúbico en el riesgo). */
  tasa: Record<Gravedad, number>;
  /** Multiplicador en 6° a 9°, donde se concentran los conflictos. */
  factor_secundaria: number;
  /** En primaria baja (Transición a 2°) casi no se registran faltas formales. */
  factor_primaria_baja: number;
}

/** Cuántas faltas de cada gravedad comete el estudiante en un periodo. */
export function faltasDelPeriodo(latentes: Pick<Latentes, 'riesgo_convivencia'>, grado: number, parametros: ParametrosConvivencia, azar: Azar): Record<Gravedad, number> {
  const r = latentes.riesgo_convivencia;
  const factor = grado >= 6 && grado <= 9 ? parametros.factor_secundaria : grado <= 2 ? parametros.factor_primaria_baja : 1;
  return {
    I: poisson(parametros.tasa.I * r * factor, azar),
    II: poisson(parametros.tasa.II * r * r * factor, azar),
    III: poisson(parametros.tasa.III * r * r * r * factor, azar),
  };
}
