import { NIVELES_DESEMPENO, NivelDesempeno } from '../constants/enums';
import type { IEscalaEvaluacion, IRangoCualitativo } from '../models/academicYear.model';
import ApiError from './ApiError';

/**
 * Escala de evaluación institucional (SIEE, Decreto 1290 de 2009, CU-ADM-04): la escala numérica,
 * la nota aprobatoria y los cortes de cada nivel cualitativo son configuración de cada
 * institución, no un número mágico en el motor de calificación (regla de oro de datos).
 */

const ETIQUETAS_POR_DEFECTO: Record<NivelDesempeno, string> = {
  BAJO: 'Bajo',
  BASICO: 'Básico',
  ALTO: 'Alto',
  SUPERIOR: 'Superior',
};

export interface SugerenciaRangosInput {
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
  /** Entero >= 0; por defecto 1 (ej. escala 1.0–5.0). */
  precision_decimales?: number;
}

/**
 * Sugiere los 4 rangos cualitativos a partir de los 3 valores base que configura la
 * institución (CU-ADM-04):
 *  - BAJO cubre [nota_minima, nota_aprobatoria - delta] (no aprobatorio).
 *  - El resto [nota_aprobatoria, nota_maxima] se reparte en 3 partes iguales entre
 *    BASICO/ALTO/SUPERIOR (todos aprobatorios).
 *  - El límite superior de SUPERIOR cierra siempre exactamente en nota_maxima.
 * El directivo puede ajustar manualmente los cortes sugeridos antes de guardar.
 */
export function sugerirRangos(input: SugerenciaRangosInput): IRangoCualitativo[] {
  const { nota_minima, nota_maxima, nota_aprobatoria } = input;
  const precision = input.precision_decimales ?? 1;

  if (nota_minima >= nota_maxima) {
    throw new ApiError(400, 'nota_minima debe ser menor que nota_maxima.');
  }
  if (nota_aprobatoria <= nota_minima || nota_aprobatoria >= nota_maxima) {
    throw new ApiError(400, 'nota_aprobatoria debe estar entre nota_minima y nota_maxima.');
  }

  // Number.toFixed() evita el arrastre de precision flotante de JS (ej. 0.1 + 0.2).
  const redondear = (valor: number) => Number(valor.toFixed(precision));
  const delta = redondear(1 / 10 ** precision);

  const espacioAprobatorio = nota_maxima - nota_aprobatoria;
  const paso = espacioAprobatorio / 3;
  if (paso <= delta) {
    throw new ApiError(
      400,
      'El espacio entre nota_aprobatoria y nota_maxima es muy pequeño para dividirlo en 3 niveles con esta precisión decimal.'
    );
  }

  return [
    {
      nivel: 'BAJO',
      etiqueta: ETIQUETAS_POR_DEFECTO.BAJO,
      valor_minimo: redondear(nota_minima),
      valor_maximo: redondear(nota_aprobatoria - delta),
      es_aprobatorio: false,
    },
    {
      nivel: 'BASICO',
      etiqueta: ETIQUETAS_POR_DEFECTO.BASICO,
      valor_minimo: redondear(nota_aprobatoria),
      valor_maximo: redondear(nota_aprobatoria + paso - delta),
      es_aprobatorio: true,
    },
    {
      nivel: 'ALTO',
      etiqueta: ETIQUETAS_POR_DEFECTO.ALTO,
      valor_minimo: redondear(nota_aprobatoria + paso),
      valor_maximo: redondear(nota_aprobatoria + 2 * paso - delta),
      es_aprobatorio: true,
    },
    {
      nivel: 'SUPERIOR',
      etiqueta: ETIQUETAS_POR_DEFECTO.SUPERIOR,
      valor_minimo: redondear(nota_aprobatoria + 2 * paso),
      valor_maximo: redondear(nota_maxima),
      es_aprobatorio: true,
    },
  ];
}

/**
 * Coherencia de una escala de evaluación: los 4 niveles exactos, cada rango dentro de los
 * límites de la escala y sin traslapes entre rangos. Devuelve el primer problema (en español)
 * o null si es válida.
 */
export function validarEscalaEvaluacion(escala: IEscalaEvaluacion): string | null {
  if (escala.nota_minima >= escala.nota_maxima) {
    return 'nota_minima debe ser menor que nota_maxima.';
  }
  if (escala.nota_aprobatoria <= escala.nota_minima || escala.nota_aprobatoria >= escala.nota_maxima) {
    return 'nota_aprobatoria debe estar entre nota_minima y nota_maxima.';
  }
  if (escala.rangos.length !== NIVELES_DESEMPENO.length) {
    return `La escala debe tener exactamente los ${NIVELES_DESEMPENO.length} niveles: ${NIVELES_DESEMPENO.join(', ')}.`;
  }

  const nivelesVistos = new Set<NivelDesempeno>();
  for (const rango of escala.rangos) {
    if (nivelesVistos.has(rango.nivel)) return `El nivel ${rango.nivel} está repetido en la escala.`;
    nivelesVistos.add(rango.nivel);

    if (rango.valor_minimo > rango.valor_maximo) {
      return `El rango de ${rango.nivel} tiene valor_minimo mayor que valor_maximo.`;
    }
    if (rango.valor_minimo < escala.nota_minima || rango.valor_maximo > escala.nota_maxima) {
      return `El rango de ${rango.nivel} se sale de los límites de la escala [${escala.nota_minima}, ${escala.nota_maxima}].`;
    }
  }
  for (const nivel of NIVELES_DESEMPENO) {
    if (!nivelesVistos.has(nivel)) return `Falta el nivel ${nivel} en la escala.`;
  }

  const ordenados = [...escala.rangos].sort((a, b) => a.valor_minimo - b.valor_minimo);
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1]!;
    const actual = ordenados[i]!;
    if (actual.valor_minimo <= anterior.valor_maximo) {
      return `Los rangos de ${anterior.nivel} y ${actual.nivel} se traslapan.`;
    }
  }

  return null;
}

export interface ResultadoDesempeno {
  nota: number;
  nivel: NivelDesempeno;
  aprobado: boolean;
}

/**
 * Resuelve el nivel cualitativo (Decreto 1290) de una nota según la escala institucional
 * configurada para el año lectivo. Lista para cuando M12 (notas) y M17 (boletines) la
 * necesiten — hoy ningún motor de calificación la invoca todavía.
 */
export function resolverDesempeno(nota: number, configEscala: IEscalaEvaluacion): ResultadoDesempeno {
  if (nota < configEscala.nota_minima || nota > configEscala.nota_maxima) {
    throw new ApiError(
      400,
      `La nota ${nota} está fuera de la escala institucional configurada [${configEscala.nota_minima}, ${configEscala.nota_maxima}].`
    );
  }

  const rango = configEscala.rangos.find((r) => nota >= r.valor_minimo && nota <= r.valor_maximo);
  if (!rango) {
    throw new ApiError(400, `La nota ${nota} no cae en ningún rango configurado de la escala de evaluación institucional.`);
  }

  return { nota, nivel: rango.nivel, aprobado: rango.es_aprobatorio };
}
