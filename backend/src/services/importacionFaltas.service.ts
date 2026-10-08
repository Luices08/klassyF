import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { ClientSession, Types } from 'mongoose';
import { TIPOS_SITUACION, TipoSituacion } from '../constants/convivencia';
import {
  COLUMNAS_FALTAS,
  MAX_BYTES_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  VERSION_PLANTILLA_IMPORTACION,
} from '../constants/importacionConvivencia';
import { ROLES } from '../constants/roles';
import FaltaConvivencia from '../models/faltaConvivencia.model';
import LoteImportacion from '../models/loteImportacion.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { leerCsv, normalizarEncabezado } from '../utils/csv';
import { claveDeNombre, leerDecimal, leerEstado, neutralizarFormula } from '../utils/importacion';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { obtenerInstitucionConvivencia } from './convivenciaCatalogo.service';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const HOJA_CARGA = 'Carga';
const HOJA_INSTRUCCIONES = 'Instrucciones';
const HOJA_LISTAS = 'Listas';
const HOJA_CONTEXTO = 'Contexto';
const PROCESO = 'faltas';
const NOMBRES_COLUMNAS = COLUMNAS_FALTAS.map((c) => c.nombre);

type Fila = Record<string, string>;
interface FilaLeida {
  numero: number;
  valores: Fila;
}
interface ErrorFila {
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacionFaltas {
  lote_id: string;
  formato: 'xlsx' | 'csv';
  filas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
}

const ROLES_CATALOGO: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];

function exigirPermiso(usuario: UserDocument) {
  if (!ROLES_CATALOGO.includes(usuario.rol)) throw new ApiError(403, 'Solo administración y coordinación de convivencia cargan las faltas del manual.');
}

// --- Lectura de archivos ---

/** Texto de una celda; las fórmulas se rechazan (el archivo debe traer datos, no cálculos que se evalúen). */
function valorDeCelda(celda: ExcelJS.Cell, fila: number): string {
  const valor = celda.value;
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('formula' in valor || 'sharedFormula' in valor) {
      throw new ApiError(400, `La fila ${fila} tiene una fórmula. Pega solo valores: no se aceptan fórmulas.`);
    }
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('').trim();
    if ('text' in valor) return String(valor.text ?? '').trim();
    return '';
  }
  return String(valor).trim();
}

async function leerExcel(buffer: Buffer): Promise<FilaLeida[]> {
  if (!buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido.');
  }

  const contexto = libro.getWorksheet(HOJA_CONTEXTO);
  if (contexto && String(contexto.getCell('B1').value ?? '').trim() !== PROCESO) {
    throw new ApiError(400, 'Este Excel no es la plantilla de faltas. Descarga la plantilla de faltas del manual.');
  }

  const hoja = libro.getWorksheet(HOJA_CARGA) ?? libro.worksheets[0];
  if (!hoja) throw new ApiError(400, 'El archivo no tiene hojas.');
  const encabezados = new Map<number, string>();
  hoja.getRow(1).eachCell((celda, columna) => encabezados.set(columna, normalizarEncabezado(valorDeCelda(celda, 1))));

  const faltantes = COLUMNAS_FALTAS.filter((c) => c.obligatoria && ![...encabezados.values()].includes(c.nombre));
  if (faltantes.length > 0) throw new ApiError(400, `Al archivo le faltan estas columnas en el encabezado: ${faltantes.map((c) => c.nombre).join(', ')}.`);

  const filas: FilaLeida[] = [];
  for (let numero = 2; numero <= hoja.rowCount; numero += 1) {
    const fila = hoja.getRow(numero);
    const valores: Fila = {};
    for (const [columna, nombre] of encabezados) valores[nombre] = valorDeCelda(fila.getCell(columna), numero);
    if (Object.values(valores).some((v) => v !== '')) filas.push({ numero, valores });
  }
  return filas;
}

async function leerArchivo(buffer: Buffer, nombre: string): Promise<{ filas: FilaLeida[]; formato: 'xlsx' | 'csv' }> {
  if (buffer.length === 0) throw new ApiError(400, 'El archivo está vacío.');
  if (buffer.length > MAX_BYTES_IMPORTACION) throw new ApiError(400, 'El archivo supera los 2 MB.');

  const esCsv = /\.csv$/i.test(nombre);
  const filas = esCsv
    ? leerCsv(buffer, COLUMNAS_FALTAS.filter((c) => c.obligatoria).map((c) => c.nombre)).registros
        .map((valores, i) => ({ numero: i + 2, valores }))
        .filter((f) => Object.values(f.valores).some((v) => v !== ''))
    : await leerExcel(buffer);

  if (filas.length === 0) throw new ApiError(400, 'El archivo no tiene filas con datos.');
  if (filas.length > MAX_FILAS_IMPORTACION) {
    throw new ApiError(400, `El archivo tiene ${filas.length} filas: el máximo para esta carga es ${MAX_FILAS_IMPORTACION}.`);
  }
  return { filas, formato: esCsv ? 'csv' : 'xlsx' };
}

// --- Validación y plan (todo el archivo antes de escribir) ---

interface Plan {
  creados: number;
  actualizados: number;
  omitidos: number;
  aplicar: (session: ClientSession) => Promise<void>;
}

async function planFaltas(filas: FilaLeida[], institucionId: Types.ObjectId): Promise<Plan> {
  const errores: ErrorFila[] = [];
  const existentes = await FaltaConvivencia.find({ institucion_id: institucionId });
  const porCodigo = new Map(existentes.map((f) => [claveDeNombre(f.codigo), f]));
  const vistos = new Set<string>();
  const acciones: ((session: ClientSession) => Promise<void>)[] = [];
  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const { numero, valores: v } of filas) {
    const codigo = (v.codigo ?? '').trim();
    const descripcion = (v.descripcion ?? '').trim();
    const gravedad = (v.gravedad ?? '').trim().toUpperCase();
    const decimas = leerDecimal(v.descuento_decimas ?? '');
    const estado = leerEstado(v.estado ?? '');
    const problemas: string[] = [];
    if (!codigo) problemas.push('Falta el código.');
    if (codigo.length > 20) problemas.push('El código supera 20 caracteres.');
    if (!descripcion) problemas.push('Falta la descripción.');
    if (descripcion.length > 400) problemas.push('La descripción supera 400 caracteres.');
    if (!(TIPOS_SITUACION as readonly string[]).includes(gravedad)) problemas.push('La gravedad debe ser I, II o III.');
    if (decimas === undefined || (decimas !== null && decimas > 5)) problemas.push('Las décimas deben ser un número entre 0 y 5.');
    if (estado === null) problemas.push('El estado debe ser ACTIVO o INACTIVO.');
    const clave = claveDeNombre(codigo);
    if (codigo && vistos.has(clave)) problemas.push('Este código está repetido en el archivo.');
    vistos.add(clave);
    if (problemas.length > 0) {
      errores.push({ fila: numero, mensaje: problemas.join(' ') });
      continue;
    }

    const datos = { descripcion, gravedad: gravedad as TipoSituacion, descuento_decimas: decimas ?? null, estado: estado ?? 'activo' };
    const existente = porCodigo.get(clave);
    if (!existente) {
      creados += 1;
      acciones.push(async (session) => {
        await FaltaConvivencia.create([{ ...datos, codigo, institucion_id: institucionId }], { session });
      });
    } else if (
      existente.descripcion === datos.descripcion &&
      existente.gravedad === datos.gravedad &&
      (existente.descuento_decimas ?? null) === datos.descuento_decimas &&
      existente.estado === datos.estado
    ) {
      omitidos += 1;
    } else {
      actualizados += 1;
      // Si ya existe, el archivo la identifica sin importar mayúsculas: no se le cambia el código que ya tenía.
      acciones.push(async (session) => {
        existente.set(datos);
        await existente.save({ session });
      });
    }
  }

  if (errores.length > 0) {
    throw new ApiError(400, `El archivo tiene ${errores.length} fila(s) con errores; no se guardó nada.`, errores.slice(0, 100));
  }
  return {
    creados,
    actualizados,
    omitidos,
    aplicar: async (session) => {
      for (const accion of acciones) await accion(session);
    },
  };
}

/**
 * Carga las faltas del manual desde un Excel o CSV. Se valida TODO el archivo antes de escribir: una fila con error y no se guarda
 * ninguna. Es idempotente por código: reenviar el mismo archivo no duplica. Del archivo solo se conserva su huella.
 */
export async function importarFaltas(
  archivo: { buffer: Buffer; originalname: string },
  usuario: UserDocument,
  ip?: string | null
): Promise<ResultadoImportacionFaltas> {
  exigirPermiso(usuario);
  const { filas, formato } = await leerArchivo(archivo.buffer, archivo.originalname);
  const institucion = await obtenerInstitucionConvivencia();
  const plan = await planFaltas(filas, institucion._id);

  const loteId = new Types.ObjectId();
  const hash = createHash('sha256').update(archivo.buffer).digest('hex');
  await runTransaction(async (session) => {
    await plan.aplicar(session);
    await LoteImportacion.create(
      [{ _id: loteId, proceso: PROCESO, usuario_id: usuario._id, archivo_nombre: archivo.originalname.slice(0, 200), formato, hash, filas: filas.length, creados: plan.creados, actualizados: plan.actualizados, omitidos: plan.omitidos }],
      { session }
    );
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_CONVIVENCIA',
    entidad: 'LoteImportacion',
    entidad_id: loteId,
    detalle: `${PROCESO}; ${filas.length} filas; +${plan.creados} ~${plan.actualizados} =${plan.omitidos}; sha256 ${hash}`,
    ip,
  });
  return { lote_id: String(loteId), formato, filas: filas.length, creados: plan.creados, actualizados: plan.actualizados, omitidos: plan.omitidos };
}

// --- Plantillas ---

/** La plantilla se genera con el sistema: en Excel trae listas desplegables, instrucciones y un contexto oculto; en CSV, punto y coma con BOM. */
export async function generarPlantillaFaltas(usuario: UserDocument, formato: 'xlsx' | 'csv') {
  exigirPermiso(usuario);

  if (formato === 'csv') {
    const celda = (valor: string) => `"${neutralizarFormula(valor).replace(/"/g, '""')}"`;
    // UTF-8 con BOM y punto y coma: así lo abre Excel en español sin dañar tildes ni la ñ.
    return { buffer: Buffer.from(`﻿${NOMBRES_COLUMNAS.map(celda).join(';')}\r\n`, 'utf8'), nombreArchivo: 'plantilla-faltas.csv', contentType: 'text/csv; charset=utf-8' };
  }

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_CARGA, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = NOMBRES_COLUMNAS.map((nombre) => ({ header: nombre, width: nombre === 'descripcion' ? 70 : 18 }));
  hoja.getRow(1).font = { bold: true };
  // Texto, no número: un código como 2.10 no debe perder el cero.
  hoja.getColumn(NOMBRES_COLUMNAS.indexOf('codigo') + 1).numFmt = '@';

  const instrucciones = libro.addWorksheet(HOJA_INSTRUCCIONES);
  instrucciones.columns = [{ header: 'Columna', width: 20 }, { header: 'Obligatoria', width: 13 }, { header: 'Qué va aquí', width: 85 }, { header: 'Ejemplo', width: 44 }];
  instrucciones.getRow(1).font = { bold: true };
  for (const c of COLUMNAS_FALTAS) instrucciones.addRow([c.nombre, c.obligatoria ? 'Sí' : 'No', neutralizarFormula(c.descripcion), neutralizarFormula(c.ejemplo)]);
  instrucciones.addRow([]);
  instrucciones.addRow(['', '', 'Se valida todo el archivo antes de guardar: si una fila tiene un error, no se guarda ninguna.', '']);
  instrucciones.addRow(['', '', 'Reenviar el mismo archivo no duplica nada: una falta con el mismo código se actualiza o se omite.', '']);

  const listas = libro.addWorksheet(HOJA_LISTAS, { state: 'hidden' });
  [[...TIPOS_SITUACION], ['ACTIVO', 'INACTIVO']].forEach((valores, i) => valores.forEach((valor, j) => (listas.getCell(j + 1, i + 1).value = valor)));
  const validaciones: [string, string, number][] = [['gravedad', 'A', TIPOS_SITUACION.length], ['estado', 'B', 2]];
  for (const [columna, letra, cantidad] of validaciones) {
    const posicion = NOMBRES_COLUMNAS.indexOf(columna) + 1;
    for (let fila = 2; fila <= 502; fila += 1) {
      hoja.getCell(fila, posicion).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`${HOJA_LISTAS}!$${letra}$1:$${letra}$${cantidad}`],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Elige un valor de la lista.',
      };
    }
  }

  const contexto = libro.addWorksheet(HOJA_CONTEXTO, { state: 'hidden' });
  contexto.getCell('A1').value = 'proceso';
  contexto.getCell('B1').value = PROCESO;
  contexto.getCell('A2').value = 'version';
  contexto.getCell('B2').value = VERSION_PLANTILLA_IMPORTACION;

  return {
    buffer: Buffer.from(await libro.xlsx.writeBuffer()),
    nombreArchivo: 'plantilla-faltas.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
