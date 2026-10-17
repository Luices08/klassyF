import {
  MAX_CONCEPTOS_ESCALA_EXTERNA,
  MAX_RANGOS_ESCALA_EXTERNA,
  MetodoConversion,
  TipoEscalaExterna,
} from '../constants/traslados';
import { redondear } from './recuperaciones';

/**
 * Funciones puras de la homologación de notas por traslado (sin Mongoose). Nada está quemado: la escala de origen la define el
 * colegio en su catálogo de escalas externas (M32) y la de destino es la del año lectivo (M05).
 */

export interface RangoEquivalencia {
  desde: number;
  hasta: number;
  /** Nota en la escala institucional. */
  nota: number;
}

export interface ConceptoEquivalencia {
  concepto: string;
  /** Sigla con la que también puede venir en el certificado de origen (E, S, A...). */
  abreviatura: string;
  nota: number;
}

export interface EscalaExternaCalculo {
  nombre: string;
  tipo: TipoEscalaExterna;
  valor_minimo: number | null;
  valor_maximo: number | null;
  /** null = no se sabe con qué nota se aprobaba allá: la conversión lineal es una proporción simple entre extremos. */
  valor_aprobatorio: number | null;
  metodo: MetodoConversion;
  rangos: readonly RangoEquivalencia[];
  conceptos: readonly ConceptoEquivalencia[];
}

/** Lo que de la escala del año necesita la conversión. */
export interface EscalaInstitucionalCalculo {
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
  precision_decimales: number;
}

/** Problemas de forma de una escala externa (el primero, en español), o null si es válida. */
export function validarEscalaExterna(escala: EscalaExternaCalculo): string | null {
  if (!escala.nombre.trim()) return 'La escala necesita un nombre.';
  if (escala.tipo === 'CONCEPTUAL') {
    if (escala.conceptos.length === 0) return 'Una escala conceptual necesita al menos un concepto con su equivalencia.';
    if (escala.conceptos.length > MAX_CONCEPTOS_ESCALA_EXTERNA) return `Una escala admite hasta ${MAX_CONCEPTOS_ESCALA_EXTERNA} conceptos.`;
    const vistos = new Set<string>();
    for (const c of escala.conceptos) {
      if (!c.concepto.trim()) return 'Hay un concepto sin nombre.';
      if (!Number.isFinite(c.nota) || c.nota < 0) return `La equivalencia de «${c.concepto}» no es una nota válida.`;
      for (const clave of [c.concepto, c.abreviatura].map(normalizar).filter(Boolean)) {
        if (vistos.has(clave)) return `«${clave}» está repetido en la escala.`;
        vistos.add(clave);
      }
    }
    return null;
  }

  const { valor_minimo: min, valor_maximo: max, valor_aprobatorio: aprob } = escala;
  if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max)) return 'Una escala numérica necesita su valor mínimo y su valor máximo.';
  if (min >= max) return 'El valor mínimo de la escala debe ser menor que el máximo.';
  if (aprob !== null && (aprob <= min || aprob >= max)) return 'La nota aprobatoria de origen debe estar entre el mínimo y el máximo de la escala.';
  if (escala.metodo === 'RANGOS') {
    if (escala.rangos.length === 0) return 'La conversión por rangos necesita al menos un rango.';
    if (escala.rangos.length > MAX_RANGOS_ESCALA_EXTERNA) return `Una escala admite hasta ${MAX_RANGOS_ESCALA_EXTERNA} rangos.`;
    for (const r of escala.rangos) {
      if (r.desde > r.hasta) return `El rango ${r.desde}–${r.hasta} está al revés.`;
      if (r.desde < min || r.hasta > max) return `El rango ${r.desde}–${r.hasta} se sale de la escala [${min}, ${max}].`;
      if (!Number.isFinite(r.nota) || r.nota < 0) return `La equivalencia del rango ${r.desde}–${r.hasta} no es una nota válida.`;
    }
    const ordenados = [...escala.rangos].sort((a, b) => a.desde - b.desde);
    for (let i = 1; i < ordenados.length; i++) {
      const anterior = ordenados[i - 1] as RangoEquivalencia;
      const actual = ordenados[i] as RangoEquivalencia;
      if (actual.desde <= anterior.hasta) return `Los rangos ${anterior.desde}–${anterior.hasta} y ${actual.desde}–${actual.hasta} se traslapan.`;
    }
  }
  return null;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Lee un número tal como viene en un certificado colombiano: «8,5» o «8.5». */
function leerNumero(valor: string | number): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const limpio = valor.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

export type ResultadoConversion = { ok: true; nota: number } | { ok: false; error: string };

/**
 * Convierte una nota de la escala de origen a la del año. La lineal anclada en la aprobatoria reparte por separado lo que reprueba y lo
 * que aprueba, así un 6/10 (aprobatorio allá) cae en la aprobatoria de aquí y un 5.9 nunca se redondea hacia arriba hasta aprobar.
 */
export function convertirNota(escala: EscalaExternaCalculo, valorOriginal: string | number, destino: EscalaInstitucionalCalculo): ResultadoConversion {
  const decimales = destino.precision_decimales;
  const dentroDeDestino = (nota: number): ResultadoConversion =>
    nota < destino.nota_minima || nota > destino.nota_maxima
      ? { ok: false, error: `La equivalencia ${nota} se sale de la escala del año [${destino.nota_minima}, ${destino.nota_maxima}]: revisa la escala «${escala.nombre}».` }
      : { ok: true, nota: redondear(nota, decimales) };

  if (escala.tipo === 'CONCEPTUAL') {
    const buscado = normalizar(String(valorOriginal));
    const concepto = escala.conceptos.find((c) => normalizar(c.concepto) === buscado || (c.abreviatura && normalizar(c.abreviatura) === buscado));
    if (!concepto) {
      return { ok: false, error: `«${String(valorOriginal)}» no es un concepto de la escala «${escala.nombre}» (${escala.conceptos.map((c) => c.concepto).join(', ')}).` };
    }
    return dentroDeDestino(concepto.nota);
  }

  const valor = leerNumero(valorOriginal);
  const min = escala.valor_minimo as number;
  const max = escala.valor_maximo as number;
  if (valor === null) return { ok: false, error: `«${String(valorOriginal)}» no es un número.` };
  if (valor < min || valor > max) return { ok: false, error: `${valor} está fuera de la escala «${escala.nombre}» [${min}, ${max}].` };

  if (escala.metodo === 'RANGOS') {
    const rango = escala.rangos.find((r) => valor >= r.desde && valor <= r.hasta);
    if (!rango) return { ok: false, error: `${valor} no cae en ningún rango de la escala «${escala.nombre}».` };
    return dentroDeDestino(rango.nota);
  }

  const { nota_minima: dMin, nota_maxima: dMax, nota_aprobatoria: dAprob } = destino;
  const aprob = escala.valor_aprobatorio;
  if (aprob === null) return dentroDeDestino(dMin + ((valor - min) / (max - min)) * (dMax - dMin));
  if (valor >= aprob) return dentroDeDestino(dAprob + ((valor - aprob) / (max - aprob)) * (dMax - dAprob));
  const paso = 1 / 10 ** decimales;
  const proporcional = dMin + ((valor - min) / (aprob - min)) * (dAprob - dMin);
  // Lo que reprueba allá reprueba aquí: el redondeo no puede llevarlo a la aprobatoria.
  return dentroDeDestino(Math.min(redondear(proporcional, decimales), redondear(dAprob - paso, decimales)));
}

export interface FuenteNota {
  nota_convertida: number;
  /** Cuánto de ese periodo de origen cae en el periodo local (0–100). */
  peso: number;
}

/**
 * La nota del periodo local: el promedio de las notas de origen que lo cubren, ponderado por cuánto lo cubre cada una (un trimestre que
 * cubre dos tercios del periodo pesa el doble que el que cubre un tercio). Sin pesos, todas valen lo mismo.
 */
export function notaDesdeFuentes(fuentes: readonly FuenteNota[], decimales: number): number | null {
  if (fuentes.length === 0) return null;
  const sumaPesos = fuentes.reduce((suma, f) => suma + f.peso, 0);
  if (sumaPesos <= 0) return redondear(fuentes.reduce((suma, f) => suma + f.nota_convertida, 0) / fuentes.length, decimales);
  return redondear(fuentes.reduce((suma, f) => suma + f.nota_convertida * f.peso, 0) / sumaPesos, decimales);
}

export interface PeriodoConFechas {
  numero: number;
  fecha_inicio?: Date | null;
  fecha_fin?: Date | null;
}

export interface PeriodoOrigen {
  nombre: string;
  fecha_inicio?: Date | null;
  fecha_fin?: Date | null;
}

export interface CorrespondenciaPeriodo {
  periodo_numero: number;
  fuentes: Array<{ indice_origen: number; peso: number }>;
}

/** Tramo [desde, hasta] de cada periodo dentro del año, en fracción 0–1: por sus fechas si todos las tienen, si no partes iguales. */
function tramos(periodos: ReadonlyArray<{ fecha_inicio?: Date | null; fecha_fin?: Date | null }>, inicioAnio: number | null, finAnio: number | null): Array<[number, number]> {
  const conFechas = inicioAnio !== null && finAnio !== null && finAnio > inicioAnio && periodos.every((p) => p.fecha_inicio && p.fecha_fin);
  if (!conFechas) return periodos.map((_, i) => [i / periodos.length, (i + 1) / periodos.length]);
  const total = (finAnio as number) - (inicioAnio as number);
  return periodos.map((p) => [
    ((p.fecha_inicio as Date).getTime() - (inicioAnio as number)) / total,
    ((p.fecha_fin as Date).getTime() - (inicioAnio as number)) / total,
  ]);
}

/**
 * Propone qué periodos de origen alimentan cada periodo local y con qué peso (3 trimestres → 4 periodos, por ejemplo). Si ambos esquemas
 * tienen fechas se cruzan por fechas; si no, cada esquema se reparte el año en partes iguales. Es solo una sugerencia: secretaría la ajusta.
 */
export function sugerirCorrespondencia(locales: readonly PeriodoConFechas[], origen: readonly PeriodoOrigen[]): CorrespondenciaPeriodo[] {
  if (locales.length === 0 || origen.length === 0) return locales.map((p) => ({ periodo_numero: p.numero, fuentes: [] }));
  const todas = [...locales, ...origen].filter((p) => p.fecha_inicio && p.fecha_fin);
  const usarFechas = todas.length === locales.length + origen.length;
  const inicio = usarFechas ? Math.min(...todas.map((p) => (p.fecha_inicio as Date).getTime())) : null;
  const fin = usarFechas ? Math.max(...todas.map((p) => (p.fecha_fin as Date).getTime())) : null;
  const tLocales = tramos(locales, inicio, fin);
  const tOrigen = tramos(origen, inicio, fin);

  return locales.map((p, i) => {
    const [desde, hasta] = tLocales[i] as [number, number];
    const largo = hasta - desde;
    const fuentes = tOrigen
      .map(([oDesde, oHasta], indice) => ({ indice_origen: indice, cruce: Math.max(0, Math.min(hasta, oHasta) - Math.max(desde, oDesde)) }))
      .filter((f) => f.cruce > 1e-9)
      .map((f) => ({ indice_origen: f.indice_origen, peso: largo > 0 ? redondear((f.cruce / largo) * 100, 1) : 0 }));
    return { periodo_numero: p.numero, fuentes };
  });
}
