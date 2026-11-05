import ExcelJS from 'exceljs';
import { FormatoSimat } from '../constants/importacionSimat';
import { COLUMNAS_ACUDIENTES, ColumnaAcudientes, MAX_BYTES_ACUDIENTES, MAX_FILAS_ACUDIENTES } from '../constants/importacionAcudientes';
import ApiError from '../utils/ApiError';
import { decodificarCsv, parseCsv } from '../utils/csv';
import { FilaCrudaAcudientes, MapaDeColumnasAcudientes, mapearColumnasAcudientes } from '../utils/importacionAcudientes';
import { detectarDelimitadorSimat, textoDeCelda } from '../utils/importacionSimat';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRMA_EXCEL_ANTIGUO = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export interface FilaLeidaAcudiente {
  /** Número de fila en el archivo (la 1 es el encabezado). */
  numero: number;
  cruda: FilaCrudaAcudientes;
}

export interface LecturaAcudientes {
  formato: FormatoSimat;
  filas: FilaLeidaAcudiente[];
  opcionales_ausentes: ColumnaAcudientes[];
}

function formatoDeArchivo(nombre: string): FormatoSimat {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre.trim())?.[1]?.toLowerCase() ?? '';
  if (extension === 'xls') throw new ApiError(400, 'El formato .xls (Excel antiguo) no se admite: guárdalo como .xlsx o como CSV.');
  if (extension !== 'xlsx' && extension !== 'csv' && extension !== 'txt') throw new ApiError(400, 'Solo se admiten archivos .xlsx, .csv o .txt.');
  return extension;
}

function errorDeColumnas(faltantes: readonly ColumnaAcudientes[], detalle = ''): ApiError {
  const nombres = faltantes.map((c) => COLUMNAS_ACUDIENTES[c].alias[0]).join(', ');
  return new ApiError(400, `Al archivo le faltan estas columnas: ${nombres}. Descarga la plantilla para ver los encabezados.${detalle}`);
}

function aFilas(mapa: MapaDeColumnasAcudientes, filas: Array<{ numero: number; valores: readonly unknown[] }>): FilaLeidaAcudiente[] {
  const salida: FilaLeidaAcudiente[] = [];
  for (const { numero, valores } of filas) {
    if (valores.every((v) => textoDeCelda(v) === '')) continue;
    for (const v of valores) {
      if (typeof v === 'object' && v !== null && !(v instanceof Date) && ('formula' in v || 'sharedFormula' in v)) {
        throw new ApiError(400, `La fila ${numero} tiene una fórmula. El archivo debe traer solo valores: pégalos como valores y súbelo de nuevo.`);
      }
    }
    const cruda: FilaCrudaAcudientes = {};
    for (const [columna, indice] of Object.entries(mapa.indices) as Array<[ColumnaAcudientes, number]>) cruda[columna] = valores[indice];
    salida.push({ numero, cruda });
    if (salida.length > MAX_FILAS_ACUDIENTES) throw new ApiError(400, `El archivo trae más de ${MAX_FILAS_ACUDIENTES} filas: divídelo en varios.`);
  }
  return salida;
}

async function leerXlsx(buffer: Buffer): Promise<LecturaAcudientes> {
  if (!buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido o está dañado.');
  }
  let faltantes: ColumnaAcudientes[] | null = null;
  for (const hoja of libro.worksheets) {
    if (hoja.rowCount < 1) continue;
    const mapa = mapearColumnasAcudientes((hoja.getRow(1).values as unknown[]).slice(1));
    if (mapa.faltantes.length > 0) {
      faltantes ??= mapa.faltantes;
      continue;
    }
    const filas: Array<{ numero: number; valores: unknown[] }> = [];
    for (let numero = 2; numero <= hoja.rowCount; numero += 1) filas.push({ numero, valores: (hoja.getRow(numero).values as unknown[]).slice(1) });
    return { formato: 'xlsx', filas: aFilas(mapa, filas), opcionales_ausentes: mapa.opcionalesAusentes };
  }
  throw errorDeColumnas(faltantes ?? [], ' Ninguna hoja trae el encabezado en la primera fila.');
}

function leerTexto(buffer: Buffer, formato: 'csv' | 'txt'): LecturaAcudientes {
  if (buffer.subarray(0, 4096).includes(0)) throw new ApiError(400, `El archivo no parece un ${formato.toUpperCase()} de texto.`);
  const contenido = decodificarCsv(buffer);
  const filas = parseCsv(contenido, detectarDelimitadorSimat(contenido));
  if (filas.length === 0) throw new ApiError(400, 'El archivo está vacío.');
  const mapa = mapearColumnasAcudientes(filas[0]!);
  if (mapa.faltantes.length > 0) throw errorDeColumnas(mapa.faltantes);
  return { formato, filas: aFilas(mapa, filas.slice(1).map((valores, i) => ({ numero: i + 2, valores }))), opcionales_ausentes: mapa.opcionalesAusentes };
}

/** Lee el archivo de acudientes (xlsx, csv o txt). No toca la base de datos. */
export async function leerArchivoAcudientes(buffer: Buffer, nombre: string): Promise<LecturaAcudientes> {
  if (buffer.length === 0) throw new ApiError(400, 'El archivo está vacío.');
  if (buffer.length > MAX_BYTES_ACUDIENTES) throw new ApiError(400, `El archivo supera los ${MAX_BYTES_ACUDIENTES / 1024 / 1024} MB.`);
  const formato = formatoDeArchivo(nombre);
  if (formato !== 'xlsx' && buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo es un Excel (.xlsx) con otra extensión: súbelo con la extensión .xlsx.');
  if (buffer.subarray(0, 4).equals(FIRMA_EXCEL_ANTIGUO)) throw new ApiError(400, 'El archivo es un Excel antiguo (.xls): guárdalo como .xlsx.');
  const lectura = formato === 'xlsx' ? await leerXlsx(buffer) : leerTexto(buffer, formato);
  if (lectura.filas.length === 0) throw new ApiError(400, 'El archivo no trae filas con datos debajo del encabezado.');
  return lectura;
}
