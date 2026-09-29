import ApiError from './ApiError';

/**
 * Lectura de CSV minima (sin dependencia externa: evita el historial de CVEs sin
 * parche de librerias tipo `xlsx` al procesar archivos subidos por usuarios).
 * Soporta comillas dobles, delimitadores dentro de campos citados y comillas
 * escapadas (""). Excel en español guarda los CSV con punto y coma (;) y, segun
 * la opcion elegida, en Windows-1252 o UTF-8 con BOM: todo eso se maneja aqui.
 */

export type Delimitador = ',' | ';';

/** UTF-8 estricto; si el archivo no lo es (Excel "CSV" en Windows) se lee como Windows-1252 para no romper tildes ni la ñ. */
export function decodificarCsv(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const LINEA_SEP = /^\s*sep=(.)\s*$/i;

function lineas(texto: string): string[] {
  return texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * Coma o punto y coma, segun el encabezado: gana el que mas aparezca fuera de comillas
 * (o el indicado en una primera linea "sep=;" que Excel agrega a veces). Empate -> coma.
 */
export function detectarDelimitador(contenido: string): Delimitador {
  const ls = lineas(contenido).filter((l) => l.trim() !== '');
  const primera = ls[0] ?? '';

  const sep = LINEA_SEP.exec(primera)?.[1];
  if (sep === ',' || sep === ';') return sep;

  const encabezado = LINEA_SEP.test(primera) ? (ls[1] ?? '') : primera;
  let comas = 0;
  let puntosYComa = 0;
  let dentroDeComillas = false;
  for (const char of encabezado) {
    if (char === '"') dentroDeComillas = !dentroDeComillas;
    else if (!dentroDeComillas && char === ',') comas += 1;
    else if (!dentroDeComillas && char === ';') puntosYComa += 1;
  }
  return puntosYComa > comas ? ';' : ',';
}

export function parseCsv(contenido: string, delimitador: Delimitador = detectarDelimitador(contenido)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;

  const texto = lineas(contenido)
    .filter((l, i, todas) => !(LINEA_SEP.test(l) && todas.slice(0, i).every((p) => p.trim() === '')))
    .join('\n');

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];

    if (dentroDeComillas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeComillas = true;
    } else if (char === delimitador) {
      fila.push(campo);
      campo = '';
    } else if (char === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += char;
    }
  }

  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

/** "Tipo Documento" y "tipo_documento" son la misma columna: minusculas, sin tildes y con guion bajo. */
export function normalizarEncabezado(encabezado: string): string {
  return encabezado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_');
}

/** Convierte filas CSV (con encabezado) a objetos { encabezado: valor }. */
export function csvARegistros(filas: string[][]): Array<Record<string, string>> {
  if (filas.length === 0) return [];
  const encabezados = filas[0]!.map(normalizarEncabezado);
  return filas.slice(1).map((fila) => {
    const registro: Record<string, string> = {};
    encabezados.forEach((h, idx) => {
      registro[h] = (fila[idx] ?? '').trim();
    });
    return registro;
  });
}

export interface CsvLeido {
  registros: Array<Record<string, string>>;
  delimitador: Delimitador;
}

/**
 * Lee un archivo CSV subido (codificacion y separador detectados) y exige que el
 * encabezado traiga las columnas obligatorias: falla una sola vez con un mensaje
 * claro en lugar de repetir "faltan columnas" en cada fila.
 */
export function leerCsv(buffer: Buffer, columnasObligatorias: readonly string[]): CsvLeido {
  const texto = decodificarCsv(buffer);
  const delimitador = detectarDelimitador(texto);
  const filas = parseCsv(texto, delimitador);

  if (filas.length > 0) {
    const encabezados = filas[0]!.map(normalizarEncabezado);
    const faltantes = columnasObligatorias.filter((c) => !encabezados.includes(c));
    if (faltantes.length > 0) {
      throw new ApiError(
        400,
        `Al archivo le faltan estas columnas en el encabezado: ${faltantes.join(', ')}. ` +
          `Se leyó con el separador "${delimitador}" y se encontró: ${encabezados.join(', ')}.`
      );
    }
  }

  return { registros: csvARegistros(filas), delimitador };
}
