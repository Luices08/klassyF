import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { ColumnaSimat, FORMATOS_SIMAT, FormatoSimat, MAX_BYTES_SIMAT, MAX_FILAS_SIMAT } from '../constants/importacionSimat';
import ApiError from '../utils/ApiError';
import { decodificarCsv, parseCsv } from '../utils/csv';
import { detectarDelimitadorSimat, FilaCruda, MapaDeColumnas, mapearColumnas, textoDeCelda } from '../utils/importacionSimat';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRMA_EXCEL_ANTIGUO = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export interface FilaLeida {
  /** Número de fila en el archivo (la 1 es el encabezado). */
  numero: number;
  cruda: FilaCruda;
}

export interface LecturaSimat {
  formato: FormatoSimat;
  filas: FilaLeida[];
  total_filas: number;
  otras_instituciones: number;
  sin_institucion: number;
  /** Cuántas instituciones distintas trae el archivo (el consolidado de una ETC trae decenas; el de un colegio, una). */
  instituciones_en_archivo: number;
  opcionales_ausentes: ColumnaSimat[];
}

/** Formato por la extensión; el contenido real se vuelve a confirmar al leerlo (firma de bytes), nunca se confía en el nombre. */
export function formatoDeArchivo(nombre: string): FormatoSimat {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre.trim())?.[1]?.toLowerCase() ?? '';
  if (extension === 'xls') {
    throw new ApiError(400, 'El formato .xls (Excel antiguo) no se admite: ábrelo y guárdalo como .xlsx, o exporta el archivo de SIMAT como .csv o .txt.');
  }
  if (!(FORMATOS_SIMAT as readonly string[]).includes(extension)) {
    throw new ApiError(400, 'Solo se admiten archivos .xlsx, .csv o .txt (los formatos que exporta SIMAT).');
  }
  return extension as FormatoSimat;
}

/**
 * Reúne las filas de LA institución mientras lee: las de otras instituciones (el archivo de la ETC trae todas) se cuentan y se descartan en el
 * acto, sin guardarlas ni dejarlas en memoria, y de cada fila solo se toman las columnas conocidas (nada de lo que no se necesite, como las del SRPA).
 */
class Acumulador {
  readonly filas: FilaLeida[] = [];
  total = 0;
  otras = 0;
  sinInstitucion = 0;
  private readonly instituciones = new Set<string>();

  constructor(
    private readonly daneInstitucion: string,
    private readonly mapa: MapaDeColumnas
  ) {}

  agregar(numero: number, valores: readonly unknown[]): void {
    if (valores.every((v) => textoDeCelda(v) === '')) return;
    for (const v of valores) {
      if (typeof v === 'object' && v !== null && !(v instanceof Date) && ('formula' in v || 'sharedFormula' in v)) {
        throw new ApiError(400, `La fila ${numero} tiene una fórmula. El archivo debe traer solo valores: expórtalo de nuevo desde SIMAT.`);
      }
    }
    this.total += 1;
    const dane = textoDeCelda(valores[this.mapa.indices.dane!]).replace(/\D/g, '');
    if (dane === '') {
      this.sinInstitucion += 1;
      return;
    }
    this.instituciones.add(dane);
    if (dane !== this.daneInstitucion) {
      this.otras += 1;
      return;
    }
    if (this.filas.length >= MAX_FILAS_SIMAT) {
      throw new ApiError(400, `El archivo trae más de ${MAX_FILAS_SIMAT} estudiantes de la institución: divide la importación por sede.`);
    }
    const cruda: FilaCruda = {};
    for (const [columna, indice] of Object.entries(this.mapa.indices) as Array<[ColumnaSimat, number]>) cruda[columna] = valores[indice];
    this.filas.push({ numero, cruda });
  }

  resultado(formato: FormatoSimat): LecturaSimat {
    return {
      formato,
      filas: this.filas,
      total_filas: this.total,
      otras_instituciones: this.otras,
      sin_institucion: this.sinInstitucion,
      instituciones_en_archivo: this.instituciones.size,
      opcionales_ausentes: this.mapa.opcionalesAusentes,
    };
  }
}

function errorDeColumnas(faltantes: readonly string[], detalle = ''): ApiError {
  return new ApiError(400, `Al archivo le faltan estas columnas de SIMAT: ${faltantes.join(', ')}.${detalle}`);
}

/** Primera fila de una hoja: la que trae el encabezado de SIMAT se usa; las demás (tabla dinámica, convenciones) se recorren sin guardar nada. */
class SelectorDeHoja {
  acumulador: Acumulador | null = null;
  faltantes: string[] | null = null;

  constructor(private readonly daneInstitucion: string) {}

  /** Devuelve el acumulador de esta hoja, o null si no es la de datos. */
  encabezado(valores: readonly unknown[]): Acumulador | null {
    const mapa = mapearColumnas(valores);
    if (mapa.faltantes.length === 0 && !this.acumulador) {
      this.acumulador = new Acumulador(this.daneInstitucion, mapa);
      return this.acumulador;
    }
    this.faltantes ??= mapa.faltantes;
    return null;
  }

  resultado(): LecturaSimat {
    if (!this.acumulador) throw errorDeColumnas(this.faltantes ?? [], ' Ninguna hoja trae el encabezado de SIMAT en la primera fila.');
    return this.acumulador.resultado('xlsx');
  }
}

/** Lectura en streaming: no carga el libro entero (el consolidado de una ETC pesa decenas de MB). Depende del orden de las partes del zip. */
async function leerXlsxEnStreaming(buffer: Buffer, daneInstitucion: string): Promise<LecturaSimat> {
  const selector = new SelectorDeHoja(daneInstitucion);
  const lector = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit' });
  for await (const hoja of lector) {
    let usar: Acumulador | null = null;
    for await (const fila of hoja as unknown as AsyncIterable<ExcelJS.Row>) {
      const valores = (fila.values as unknown[]).slice(1);
      if (fila.number === 1) usar = selector.encabezado(valores);
      else usar?.agregar(fila.number, valores);
    }
  }
  return selector.resultado();
}

/** Respaldo: carga el libro completo. Más pesado, pero lee archivos que otras herramientas guardaron con las partes del zip en otro orden. */
async function leerXlsxCompleto(buffer: Buffer, daneInstitucion: string): Promise<LecturaSimat> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  const selector = new SelectorDeHoja(daneInstitucion);
  for (const hoja of libro.worksheets) {
    if (hoja.rowCount < 1) continue;
    const usar = selector.encabezado((hoja.getRow(1).values as unknown[]).slice(1));
    if (!usar) continue;
    for (let numero = 2; numero <= hoja.rowCount; numero += 1) usar.agregar(numero, (hoja.getRow(numero).values as unknown[]).slice(1));
  }
  return selector.resultado();
}

async function leerXlsx(buffer: Buffer, daneInstitucion: string): Promise<LecturaSimat> {
  if (!buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');
  try {
    return await leerXlsxEnStreaming(buffer, daneInstitucion);
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }
  try {
    return await leerXlsxCompleto(buffer, daneInstitucion);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido o está dañado.');
  }
}

function leerTexto(buffer: Buffer, formato: 'csv' | 'txt', daneInstitucion: string): LecturaSimat {
  if (buffer.subarray(0, 4096).includes(0)) throw new ApiError(400, `El archivo no parece un ${formato.toUpperCase()} de texto.`);
  const contenido = decodificarCsv(buffer);
  const delimitador = detectarDelimitadorSimat(contenido);
  const filas = parseCsv(contenido, delimitador);
  if (filas.length === 0) throw new ApiError(400, 'El archivo está vacío.');

  const mapa = mapearColumnas(filas[0]!);
  if (mapa.faltantes.length > 0) {
    throw errorDeColumnas(mapa.faltantes, ` Se leyó con el separador «${delimitador === '\t' ? 'tabulador' : delimitador}» y ${filas[0]!.length} columnas.`);
  }
  const acumulador = new Acumulador(daneInstitucion, mapa);
  for (let i = 1; i < filas.length; i += 1) acumulador.agregar(i + 1, filas[i]!);
  return acumulador.resultado(formato);
}

/** Lee el archivo de SIMAT (xlsx, csv o txt) y devuelve solo las filas de la institución. No toca la base de datos. */
export async function leerArchivoSimat(buffer: Buffer, nombre: string, daneInstitucion: string): Promise<LecturaSimat> {
  if (buffer.length === 0) throw new ApiError(400, 'El archivo está vacío.');
  if (buffer.length > MAX_BYTES_SIMAT) throw new ApiError(400, `El archivo supera los ${MAX_BYTES_SIMAT / 1024 / 1024} MB.`);
  const formato = formatoDeArchivo(nombre);
  if (formato !== 'xlsx' && buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo es un Excel (.xlsx) con otra extensión: súbelo con la extensión .xlsx.');
  if (buffer.subarray(0, 4).equals(FIRMA_EXCEL_ANTIGUO)) throw new ApiError(400, 'El archivo es un Excel antiguo (.xls): guárdalo como .xlsx.');
  return formato === 'xlsx' ? leerXlsx(buffer, daneInstitucion) : leerTexto(buffer, formato, daneInstitucion);
}
