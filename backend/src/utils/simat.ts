/**
 * Plantilla de cierre para SIMAT: una hoja continua, encabezados técnicos en la primera fila y un estudiante por fila (sin títulos, totales ni resúmenes).
 * Los nombres de las columnas y los códigos son los acordados con el colegio y **deben validarse con el anexo técnico vigente del MEN** (cambia por versión).
 */
export const ENCABEZADOS_SIMAT = [
  'CODIGO_DANE_SEDE',
  'ANIO',
  'TIPO_DOCUMENTO',
  'NUMERO_DOCUMENTO',
  'PRIMER_APELLIDO',
  'SEGUNDO_APELLIDO',
  'PRIMER_NOMBRE',
  'SEGUNDO_NOMBRE',
  'GRADO',
  'GRUPO',
  'SITUACION_ACADEMICA',
  'AREAS_REPROBADAS',
] as const;

/** Los tipos de documento que lista el instructivo del colegio para SIMAT. */
export const TIPOS_DOCUMENTO_SIMAT: readonly string[] = ['TI', 'RC', 'CC', 'NES', 'PEP', 'PPT'];

/** P promovido · R no promovido · D desertor o retirado · G graduado (solo grado 11) · N pendiente de apoyo o nivelación final. */
export type SituacionSimat = 'P' | 'R' | 'D' | 'G' | 'N';

/** Código oficial del grado: dos cifras (00 Transición, 01 a 11). Un grado anterior a Transición no tiene un código confirmado: se escribe su número y se avisa. */
export const codigoDeGrado = (numero: number): string => (numero >= 0 ? String(numero).padStart(2, '0') : String(numero));

const RESULTADOS_QUE_PROMUEVEN = ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE'];

/**
 * La situación final de un estudiante. Manda, en este orden: haberse retirado (D), estar graduado (G) y el resultado de promoción del año
 * (promovido P, no promovido R; lo que aún espera recuperación, comisión, una persona o notas es N).
 */
export function situacionSimat(e: { retirado: boolean; graduado: boolean; resultado: string | null }): SituacionSimat {
  if (e.retirado) return 'D';
  if (e.graduado) return 'G';
  if (e.resultado && RESULTADOS_QUE_PROMUEVEN.includes(e.resultado)) return 'P';
  if (e.resultado === 'NO_PROMOVIDO') return 'R';
  return 'N';
}

export interface FilaSimat {
  codigo_dane_sede: string;
  anio: number;
  tipo_documento: string;
  numero_documento: string;
  primer_apellido: string;
  segundo_apellido: string;
  primer_nombre: string;
  segundo_nombre: string;
  grado: string;
  grupo: string;
  situacion: SituacionSimat;
  areas_reprobadas: number;
}

/** Lo que el archivo no dice pero quien lo sube debe saber: no cambia ninguna fila, solo avisa. */
export type CodigoAdvertenciaSimat = 'SIN_NOMBRES' | 'SIN_CIERRE' | 'DANE_INVALIDO' | 'TIPO_DOCUMENTO' | 'GRADO_SIN_CODIGO' | 'APROBO_SIN_GRADO';

export const MENSAJE_ADVERTENCIA_SIMAT: Record<CodigoAdvertenciaSimat, string> = {
  SIN_NOMBRES: 'Sin primer nombre o primer apellido separados (se dejan vacíos: el sistema no parte los nombres por adivinación). Complétalos en la ficha del estudiante.',
  SIN_CIERRE: 'Sin cierre de promoción oficial: la situación es una proyección y puede cambiar.',
  DANE_INVALIDO: 'La sede no tiene un código DANE de 12 dígitos.',
  TIPO_DOCUMENTO: 'Tipo de documento fuera de la lista del instructivo (TI, RC, CC, NES, PEP, PPT).',
  GRADO_SIN_CODIGO: 'Grado anterior a Transición: no hay un código confirmado; se escribe su número.',
  APROBO_SIN_GRADO: 'Aprobó once pero aún no está graduado (le falta un requisito): se reporta como promovido (P).',
};

export interface EntradaRevisionSimat {
  fila: FilaSimat;
  etiqueta: string;
  oficial: boolean;
  grado_numero: number;
  aprobo_sin_grado: boolean;
}

/** Las advertencias de una fila, sin tocarla. */
export function advertenciasDeFila(e: EntradaRevisionSimat): CodigoAdvertenciaSimat[] {
  const f = e.fila;
  const lista: CodigoAdvertenciaSimat[] = [];
  if (!f.primer_nombre || !f.primer_apellido) lista.push('SIN_NOMBRES');
  if (!e.oficial && f.situacion !== 'D') lista.push('SIN_CIERRE');
  if (!/^\d{12}$/.test(f.codigo_dane_sede)) lista.push('DANE_INVALIDO');
  if (!TIPOS_DOCUMENTO_SIMAT.includes(f.tipo_documento)) lista.push('TIPO_DOCUMENTO');
  if (e.grado_numero < 0) lista.push('GRADO_SIN_CODIGO');
  if (e.aprobo_sin_grado) lista.push('APROBO_SIN_GRADO');
  return lista;
}

export interface RevisionSimat {
  total: number;
  por_situacion: Record<SituacionSimat, number>;
  /** Sin ninguna advertencia: el archivo se puede subir tal cual. */
  listo: boolean;
  advertencias: Array<{ codigo: CodigoAdvertenciaSimat; mensaje: string; cantidad: number; ejemplos: string[] }>;
}

const MAX_EJEMPLOS = 5;

export function revisarSimat(entradas: EntradaRevisionSimat[]): RevisionSimat {
  const por_situacion: Record<SituacionSimat, number> = { P: 0, R: 0, D: 0, G: 0, N: 0 };
  const grupos = new Map<CodigoAdvertenciaSimat, { cantidad: number; ejemplos: string[] }>();
  for (const e of entradas) {
    por_situacion[e.fila.situacion] += 1;
    for (const codigo of advertenciasDeFila(e)) {
      const g = grupos.get(codigo) ?? { cantidad: 0, ejemplos: [] };
      g.cantidad += 1;
      if (g.ejemplos.length < MAX_EJEMPLOS) g.ejemplos.push(e.etiqueta);
      grupos.set(codigo, g);
    }
  }
  const advertencias = [...grupos.entries()].map(([codigo, g]) => ({ codigo, mensaje: MENSAJE_ADVERTENCIA_SIMAT[codigo], ...g }));
  return { total: entradas.length, por_situacion, listo: advertencias.length === 0, advertencias };
}

/** Una celda de texto en el archivo de salida: una barra, comillas o separadores no rompen el CSV (se entrecomilla lo que haga falta). */
export function celdaCsv(valor: string | number, separador: string): string {
  const texto = String(valor);
  return texto.includes(separador) || texto.includes('"') || texto.includes('\n') ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** El CSV completo: BOM para que Excel en español lea las tildes, separador `;` (el que Excel usa en español) y fin de línea de Windows. */
export function aCsv(filas: FilaSimat[], separador = ';'): string {
  const lineas = [ENCABEZADOS_SIMAT.join(separador)];
  for (const f of filas) {
    lineas.push(
      [f.codigo_dane_sede, f.anio, f.tipo_documento, f.numero_documento, f.primer_apellido, f.segundo_apellido, f.primer_nombre, f.segundo_nombre, f.grado, f.grupo, f.situacion, f.areas_reprobadas]
        .map((c) => celdaCsv(c, separador))
        .join(separador)
    );
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}
