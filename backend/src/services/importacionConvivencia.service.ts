import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { ClientSession, Types } from 'mongoose';
import { FAMILIAS_OBSERVACION, TIPOS_SITUACION } from '../constants/convivencia';
import {
  COLUMNAS_IMPORTACION,
  MAX_BYTES_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  NOMBRES_PROCESO_IMPORTACION,
  PROCESOS_IMPORTACION,
  ProcesoImportacion,
  VERSION_PLANTILLA_IMPORTACION,
} from '../constants/importacionConvivencia';
import { ROLES } from '../constants/roles';
import CategoriaDescriptor from '../models/categoriaDescriptor.model';
import Descriptor from '../models/descriptor.model';
import LoteImportacion from '../models/loteImportacion.model';
import Observacion, { IObservacion } from '../models/observacion.model';
import TipoObservacion from '../models/tipoObservacion.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { leerCsv, normalizarEncabezado } from '../utils/csv';
import {
  claveDeNombre,
  leerDecimal,
  leerEstado,
  leerOrden,
  leerSiNo,
  neutralizarFormula,
  normalizarFecha,
  partirLista,
} from '../utils/importacion';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { listarCatalogo, obtenerInstitucionConvivencia } from './convivenciaCatalogo.service';
import { buscarEstudiantes, prepararObservaciones } from './observacion.service';

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const HOJA_CARGA = 'Carga';
const HOJA_INSTRUCCIONES = 'Instrucciones';
const HOJA_LISTAS = 'Listas';
const HOJA_CONTEXTO = 'Contexto';
const COLUMNA_ESTUDIANTE = 'estudiante';

type Fila = Record<string, string>;

/** Una fila sin datos se ignora; la columna informativa «estudiante» no cuenta como dato (la plantilla por grupo la precarga). */
const tieneDatos = (valores: Fila) => Object.entries(valores).some(([columna, valor]) => columna !== COLUMNA_ESTUDIANTE && valor !== '');
interface FilaLeida {
  numero: number;
  valores: Fila;
}
interface ErrorFila {
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacion {
  lote_id: string;
  proceso: ProcesoImportacion;
  formato: 'xlsx' | 'csv';
  filas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
}

const ROLES_CATALOGO: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];
const ROLES_OBSERVACIONES: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.DOCENTE];

export function validarProceso(valor: string): ProcesoImportacion {
  if (!(PROCESOS_IMPORTACION as readonly string[]).includes(valor)) throw new ApiError(404, 'Proceso de carga no válido.');
  return valor as ProcesoImportacion;
}

/** El catálogo lo cargan ADMIN y el coordinador de convivencia; las observaciones, quien puede registrarlas una a una. */
function exigirPermisoDeProceso(proceso: ProcesoImportacion, usuario: UserDocument) {
  const permitidos = proceso === 'observaciones' ? ROLES_OBSERVACIONES : ROLES_CATALOGO;
  if (!permitidos.includes(usuario.rol)) throw new ApiError(403, 'Tu rol no puede usar esta carga.');
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

async function leerExcel(buffer: Buffer, proceso: ProcesoImportacion): Promise<FilaLeida[]> {
  if (!buffer.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido.');
  }

  const contexto = libro.getWorksheet(HOJA_CONTEXTO);
  if (contexto && String(contexto.getCell('B1').value ?? '').trim() !== proceso) {
    throw new ApiError(400, `Esta plantilla no corresponde a «${NOMBRES_PROCESO_IMPORTACION[proceso]}». Descarga la plantilla de ese proceso.`);
  }

  const hoja = libro.getWorksheet(HOJA_CARGA) ?? libro.worksheets[0];
  if (!hoja) throw new ApiError(400, 'El archivo no tiene hojas.');
  const encabezados = new Map<number, string>();
  hoja.getRow(1).eachCell((celda, columna) => encabezados.set(columna, normalizarEncabezado(valorDeCelda(celda, 1))));

  const faltantes = COLUMNAS_IMPORTACION[proceso].filter((c) => c.obligatoria && ![...encabezados.values()].includes(c.nombre));
  if (faltantes.length > 0) throw new ApiError(400, `Al archivo le faltan estas columnas en el encabezado: ${faltantes.map((c) => c.nombre).join(', ')}.`);

  const filas: FilaLeida[] = [];
  for (let numero = 2; numero <= hoja.rowCount; numero += 1) {
    const fila = hoja.getRow(numero);
    const valores: Fila = {};
    for (const [columna, nombre] of encabezados) valores[nombre] = valorDeCelda(fila.getCell(columna), numero);
    if (tieneDatos(valores)) filas.push({ numero, valores });
  }
  return filas;
}

async function leerArchivo(buffer: Buffer, nombre: string, proceso: ProcesoImportacion): Promise<{ filas: FilaLeida[]; formato: 'xlsx' | 'csv' }> {
  if (buffer.length === 0) throw new ApiError(400, 'El archivo está vacío.');
  if (buffer.length > MAX_BYTES_IMPORTACION) throw new ApiError(400, 'El archivo supera los 2 MB.');

  const esCsv = /\.csv$/i.test(nombre);
  const filas = esCsv
    ? leerCsv(buffer, COLUMNAS_IMPORTACION[proceso].filter((c) => c.obligatoria).map((c) => c.nombre)).registros
        .map((valores, i) => ({ numero: i + 2, valores }))
        .filter((f) => tieneDatos(f.valores))
    : await leerExcel(buffer, proceso);

  if (filas.length === 0) throw new ApiError(400, 'El archivo no tiene filas con datos.');
  if (filas.length > MAX_FILAS_IMPORTACION[proceso]) {
    throw new ApiError(400, `El archivo tiene ${filas.length} filas: el máximo para esta carga es ${MAX_FILAS_IMPORTACION[proceso]}.`);
  }
  return { filas, formato: esCsv ? 'csv' : 'xlsx' };
}

// --- Procesos ---

interface Plan {
  creados: number;
  actualizados: number;
  omitidos: number;
  aplicar: (session: ClientSession) => Promise<void>;
}

const sinErrores = (errores: ErrorFila[]) => {
  if (errores.length > 0) {
    throw new ApiError(400, `El archivo tiene ${errores.length} fila(s) con errores; no se guardó nada.`, errores.slice(0, 100));
  }
};

async function planTipos(filas: FilaLeida[], institucionId: Types.ObjectId): Promise<Plan> {
  const errores: ErrorFila[] = [];
  const existentes = await TipoObservacion.find({ institucion_id: institucionId });
  const porClave = new Map(existentes.map((t) => [claveDeNombre(t.nombre), t]));
  const vistos = new Set<string>();
  const acciones: ((session: ClientSession) => Promise<void>)[] = [];
  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const { numero, valores: v } of filas) {
    const nombre = (v.nombre ?? '').trim();
    const familia = (v.familia ?? '').trim().toUpperCase();
    const visible = leerSiNo(v.visible_estudiante ?? '', false);
    const orden = leerOrden(v.orden ?? '');
    const estado = leerEstado(v.estado ?? '');
    const problemas: string[] = [];
    if (!nombre) problemas.push('Falta el nombre.');
    if (nombre.length > 60) problemas.push('El nombre supera 60 caracteres.');
    if (!(FAMILIAS_OBSERVACION as readonly string[]).includes(familia)) problemas.push(`La familia debe ser una de: ${FAMILIAS_OBSERVACION.join(', ')}.`);
    if (visible === null) problemas.push('visible_estudiante debe ser SI o NO.');
    if (orden === null) problemas.push('El orden debe ser un entero.');
    if (estado === null) problemas.push('El estado debe ser ACTIVO o INACTIVO.');
    const clave = claveDeNombre(nombre);
    if (nombre && vistos.has(clave)) problemas.push('Este tipo está repetido en el archivo.');
    vistos.add(clave);
    const existente = porClave.get(clave);
    if (existente && familia && existente.familia !== familia) problemas.push(`El tipo ya existe con la familia ${existente.familia}: la familia no se cambia.`);
    if (problemas.length > 0) {
      errores.push({ fila: numero, mensaje: problemas.join(' ') });
      continue;
    }

    const datos = { nombre, visible_estudiante: Boolean(visible), orden: orden ?? 0, estado: estado ?? 'activo' };
    // Si ya existe, el archivo lo identifica sin importar mayúsculas: no se le cambia el nombre que ya tenía.
    const { nombre: _nombre, ...cambios } = datos;
    if (!existente) {
      creados += 1;
      const familiaValida = familia as (typeof FAMILIAS_OBSERVACION)[number];
      acciones.push(async (session) => {
        await TipoObservacion.create([{ ...datos, familia: familiaValida, institucion_id: institucionId }], { session });
      });
    } else if (existente.visible_estudiante === datos.visible_estudiante && existente.orden === datos.orden && existente.estado === datos.estado) {
      omitidos += 1;
    } else {
      actualizados += 1;
      acciones.push(async (session) => {
        existente.set(cambios);
        await existente.save({ session });
      });
    }
  }
  sinErrores(errores);
  return {
    creados,
    actualizados,
    omitidos,
    aplicar: async (session) => {
      for (const accion of acciones) await accion(session);
    },
  };
}

async function planCategorias(filas: FilaLeida[], institucionId: Types.ObjectId): Promise<Plan> {
  const errores: ErrorFila[] = [];
  const existentes = await CategoriaDescriptor.find({ institucion_id: institucionId });
  const porClave = new Map(existentes.map((c) => [claveDeNombre(c.nombre), c]));
  const vistos = new Set<string>();
  const acciones: ((session: ClientSession) => Promise<void>)[] = [];
  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const { numero, valores: v } of filas) {
    const nombre = (v.nombre ?? '').trim();
    const orden = leerOrden(v.orden ?? '');
    const estado = leerEstado(v.estado ?? '');
    const problemas: string[] = [];
    if (!nombre) problemas.push('Falta el nombre.');
    if (nombre.length > 80) problemas.push('El nombre supera 80 caracteres.');
    if (orden === null) problemas.push('El orden debe ser un entero.');
    if (estado === null) problemas.push('El estado debe ser ACTIVO o INACTIVO.');
    const clave = claveDeNombre(nombre);
    if (nombre && vistos.has(clave)) problemas.push('Esta categoría está repetida en el archivo.');
    vistos.add(clave);
    if (problemas.length > 0) {
      errores.push({ fila: numero, mensaje: problemas.join(' ') });
      continue;
    }

    const datos = { nombre, orden: orden ?? 0, estado: estado ?? 'activo' };
    const { nombre: _nombre, ...cambios } = datos;
    const existente = porClave.get(clave);
    if (!existente) {
      creados += 1;
      acciones.push(async (session) => {
        await CategoriaDescriptor.create([{ ...datos, institucion_id: institucionId }], { session });
      });
    } else if (existente.orden === datos.orden && existente.estado === datos.estado) {
      omitidos += 1;
    } else {
      actualizados += 1;
      acciones.push(async (session) => {
        existente.set(cambios);
        await existente.save({ session });
      });
    }
  }
  sinErrores(errores);
  return {
    creados,
    actualizados,
    omitidos,
    aplicar: async (session) => {
      for (const accion of acciones) await accion(session);
    },
  };
}

async function planFrases(filas: FilaLeida[], institucionId: Types.ObjectId): Promise<Plan> {
  const errores: ErrorFila[] = [];
  const [tipos, categorias, existentes] = await Promise.all([
    TipoObservacion.find({ institucion_id: institucionId }),
    CategoriaDescriptor.find({ institucion_id: institucionId }),
    Descriptor.find({ institucion_id: institucionId }),
  ]);
  const tipoPorClave = new Map(tipos.map((t) => [claveDeNombre(t.nombre), t]));
  const categoriaPorClave = new Map(categorias.map((c) => [claveDeNombre(c.nombre), c]));
  // Una frase se identifica por su código dentro del tipo; sin código, por su texto.
  const claveDe = (tipoId: unknown, codigo: string | null, texto: string) =>
    codigo ? `${tipoId}|c|${codigo.toLowerCase()}` : `${tipoId}|t|${claveDeNombre(texto)}`;
  const existentePorClave = new Map(existentes.map((d) => [claveDe(d.tipo_id, d.codigo, d.texto), d]));
  const vistos = new Set<string>();
  const acciones: ((session: ClientSession) => Promise<void>)[] = [];
  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const { numero, valores: v } of filas) {
    const problemas: string[] = [];
    const tipo = tipoPorClave.get(claveDeNombre(v.tipo ?? ''));
    if (!tipo) problemas.push(`El tipo «${v.tipo ?? ''}» no existe: cárgalo antes.`);
    const nombreCategoria = (v.categoria ?? '').trim();
    const categoria = nombreCategoria ? categoriaPorClave.get(claveDeNombre(nombreCategoria)) : undefined;
    if (nombreCategoria && !categoria) problemas.push(`La categoría «${nombreCategoria}» no existe: cárgala antes.`);
    const texto = (v.texto ?? '').trim();
    const codigo = (v.codigo ?? '').trim() || null;
    const situacionTexto = (v.tipo_situacion ?? '').trim().toUpperCase();
    const decimas = leerDecimal(v.descuento_decimas ?? '');
    const orden = leerOrden(v.orden ?? '');
    const estado = leerEstado(v.estado ?? '');
    if (!texto) problemas.push('Falta el texto.');
    if (texto.length > 400) problemas.push('El texto supera 400 caracteres.');
    if (codigo && codigo.length > 20) problemas.push('El código supera 20 caracteres.');
    if (situacionTexto && !(TIPOS_SITUACION as readonly string[]).includes(situacionTexto)) problemas.push('El tipo de situación debe ser I, II o III.');
    if (decimas === undefined || (decimas !== null && decimas > 5)) problemas.push('Las décimas deben ser un número entre 0 y 5.');
    if (orden === null) problemas.push('El orden debe ser un entero.');
    if (estado === null) problemas.push('El estado debe ser ACTIVO o INACTIVO.');
    if (tipo && tipo.familia !== 'DISCIPLINARIA' && (situacionTexto || (decimas !== null && decimas !== undefined))) {
      problemas.push('El tipo de situación y las décimas solo aplican a las faltas de un tipo disciplinario.');
    }
    const clave = tipo ? claveDe(tipo._id, codigo, texto) : '';
    if (clave && vistos.has(clave)) problemas.push('Esta frase está repetida en el archivo.');
    if (clave) vistos.add(clave);
    if (problemas.length > 0 || !tipo) {
      errores.push({ fila: numero, mensaje: problemas.join(' ') });
      continue;
    }

    const datos = {
      categoria_id: categoria?._id ?? null,
      codigo,
      texto,
      tipo_situacion: situacionTexto ? (situacionTexto as (typeof TIPOS_SITUACION)[number]) : null,
      descuento_decimas: decimas ?? null,
      orden: orden ?? 0,
      estado: estado ?? 'activo',
    };
    const existente = existentePorClave.get(clave);
    if (!existente) {
      creados += 1;
      acciones.push(async (session) => {
        await Descriptor.create([{ ...datos, tipo_id: tipo._id, institucion_id: institucionId }], { session });
      });
    } else if (
      String(existente.categoria_id ?? '') === String(datos.categoria_id ?? '') &&
      existente.texto === datos.texto &&
      existente.tipo_situacion === datos.tipo_situacion &&
      (existente.descuento_decimas ?? null) === datos.descuento_decimas &&
      existente.orden === datos.orden &&
      existente.estado === datos.estado
    ) {
      omitidos += 1;
    } else {
      actualizados += 1;
      acciones.push(async (session) => {
        existente.set(datos);
        await existente.save({ session });
      });
    }
  }
  sinErrores(errores);
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
 * Cada fila pasa por `prepararObservaciones`, el mismo camino del registro individual (alcance del docente, matrícula
 * activa, fecha, periodo, frases del tipo, contenido): la carga masiva nunca es una vía paralela con reglas propias.
 */
async function planObservaciones(filas: FilaLeida[], usuario: UserDocument, loteId: Types.ObjectId): Promise<Plan> {
  const errores: ErrorFila[] = [];
  const { tipos, descriptores } = await listarCatalogo(false);
  const tipoPorClave = new Map(tipos.map((t) => [claveDeNombre(t.nombre), t]));
  const documentos: Partial<IObservacion>[] = [];
  const vistos = new Set<string>();
  let omitidos = 0;

  for (const { numero, valores: v } of filas) {
    try {
      const documento = (v.numero_documento ?? '').trim();
      const estudiante = documento ? await User.findOne({ numero_documento: documento, rol: ROLES.ESTUDIANTE }).select('_id') : null;
      if (!estudiante) throw new ApiError(400, `No hay un estudiante con el documento «${documento}».`);

      const tipo = tipoPorClave.get(claveDeNombre(v.tipo ?? ''));
      if (!tipo) throw new ApiError(400, `El tipo «${v.tipo ?? ''}» no existe o está inactivo.`);
      if (tipo.familia === 'DISCIPLINARIA') throw new ApiError(400, 'Las observaciones disciplinarias no se cargan por archivo: exigen un proceso individual (caso, descargos, protocolo).');

      const fecha = normalizarFecha(v.fecha_hecho ?? '');
      if (!fecha) throw new ApiError(400, 'La fecha del hecho debe ser AAAA-MM-DD o DD/MM/AAAA.');

      const delTipo = descriptores.filter((d) => String(d.tipo_id) === String(tipo._id));
      const ids: string[] = [];
      for (const ficha of partirLista(v.descriptores ?? '')) {
        const frase = delTipo.find((d) => (d.codigo ?? '').toLowerCase() === ficha.toLowerCase()) ?? delTipo.find((d) => claveDeNombre(d.texto) === claveDeNombre(ficha));
        if (!frase) throw new ApiError(400, `La frase «${ficha}» no existe en el tipo ${tipo.nombre}.`);
        ids.push(String(frase._id));
      }

      const comentario = (v.comentario ?? '').trim();
      const repetida = `${estudiante._id}|${fecha}|${tipo._id}|${[...ids].sort().join(',')}|${claveDeNombre(comentario)}`;
      if (vistos.has(repetida)) throw new ApiError(400, 'Esta observación está repetida en el archivo.');
      vistos.add(repetida);

      const { documentos: preparados } = await prepararObservaciones(
        { estudiantes_ids: [String(estudiante._id)], tipo_id: String(tipo._id), descriptores_ids: ids, comentario, fecha_hecho: fecha },
        usuario,
        loteId
      );
      const nuevo = preparados[0];
      if (!nuevo) continue;
      // Reenviar el mismo archivo no duplica: lo que ya está registrado (activo) se omite.
      const yaExiste = await Observacion.exists({ student_id: nuevo.student_id, fecha_hecho: nuevo.fecha_hecho, tipo_id: nuevo.tipo_id, texto_generado: nuevo.texto_generado, estado: 'ACTIVA' });
      if (yaExiste) omitidos += 1;
      else documentos.push(nuevo);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      errores.push({ fila: numero, mensaje: err.message });
    }
  }
  sinErrores(errores);
  return {
    creados: documentos.length,
    actualizados: 0,
    omitidos,
    aplicar: async (session) => {
      if (documentos.length > 0) await Observacion.insertMany(documentos, { session });
    },
  };
}

// --- Importación ---

export async function importarArchivo(
  procesoCrudo: string,
  archivo: { buffer: Buffer; originalname: string },
  usuario: UserDocument,
  ip?: string | null
): Promise<ResultadoImportacion> {
  const proceso = validarProceso(procesoCrudo);
  exigirPermisoDeProceso(proceso, usuario);
  const { filas, formato } = await leerArchivo(archivo.buffer, archivo.originalname, proceso);
  const institucion = await obtenerInstitucionConvivencia();
  const loteId = new Types.ObjectId();

  // Se valida TODO antes de escribir: una fila con error y no se guarda nada.
  const plan =
    proceso === 'tipos'
      ? await planTipos(filas, institucion._id)
      : proceso === 'categorias'
        ? await planCategorias(filas, institucion._id)
        : proceso === 'frases'
          ? await planFrases(filas, institucion._id)
          : await planObservaciones(filas, usuario, loteId);

  const hash = createHash('sha256').update(archivo.buffer).digest('hex');
  await runTransaction(async (session) => {
    await plan.aplicar(session);
    await LoteImportacion.create(
      [{ _id: loteId, proceso, usuario_id: usuario._id, archivo_nombre: archivo.originalname.slice(0, 200), formato, hash, filas: filas.length, creados: plan.creados, actualizados: plan.actualizados, omitidos: plan.omitidos }],
      { session }
    );
  });

  // El archivo no se conserva: solo su huella y el resultado.
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_CONVIVENCIA',
    entidad: 'LoteImportacion',
    entidad_id: loteId,
    detalle: `${proceso}; ${filas.length} filas; +${plan.creados} ~${plan.actualizados} =${plan.omitidos}; sha256 ${hash}`,
    ip,
  });
  return { lote_id: String(loteId), proceso, formato, filas: filas.length, creados: plan.creados, actualizados: plan.actualizados, omitidos: plan.omitidos };
}

export async function listarLotes(usuario: UserDocument) {
  return LoteImportacion.find(usuario.rol === ROLES.ADMIN ? {} : { usuario_id: usuario._id })
    .sort({ createdAt: -1 })
    .limit(50);
}

/** Solo un ADMIN, con motivo. Anula las observaciones del lote (no se borran); las cargas de catálogo se corrigen desde su pantalla. */
export async function anularLote(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador anula una carga.');
  const lote = Types.ObjectId.isValid(id) ? await LoteImportacion.findById(id) : null;
  if (!lote) throw new ApiError(404, 'Carga no encontrada.');
  if (lote.estado === 'ANULADO') throw new ApiError(409, 'La carga ya está anulada.');
  if (lote.proceso !== 'observaciones') {
    throw new ApiError(409, 'Las cargas de catálogo no se anulan en bloque: corrige o desactiva lo cargado desde el catálogo de convivencia.');
  }

  const ahora = new Date();
  const anuladas = await runTransaction(async (session) => {
    const resultado = await Observacion.updateMany(
      { lote_id: lote._id, estado: 'ACTIVA' },
      { $set: { estado: 'ANULADA', anulacion: { motivo: `Carga anulada: ${motivo.trim()}`, por: usuario._id, fecha: ahora } } },
      { session }
    );
    lote.estado = 'ANULADO';
    lote.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: ahora, observaciones_anuladas: resultado.modifiedCount };
    await lote.save({ session });
    return resultado.modifiedCount;
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'IMPORTACION_CONVIVENCIA_ANULADA', entidad: 'LoteImportacion', entidad_id: lote._id, detalle: `${anuladas} observación(es)`, ip });
  return lote;
}

// --- Plantillas ---

interface OpcionesPlantilla {
  formato: 'xlsx' | 'csv';
  /** Solo para «observaciones»: precarga los estudiantes del grupo (recomendado, como la planilla de asistencia). */
  group_id?: string;
}

interface ListaDesplegable {
  columna: string;
  valores: string[];
}

export async function generarPlantilla(procesoCrudo: string, usuario: UserDocument, { formato, group_id }: OpcionesPlantilla) {
  const proceso = validarProceso(procesoCrudo);
  exigirPermisoDeProceso(proceso, usuario);
  const columnas = COLUMNAS_IMPORTACION[proceso];
  const nombres = columnas.map((c) => c.nombre);
  const catalogo = proceso === 'frases' || proceso === 'observaciones' ? await listarCatalogo(false) : null;

  const estudiantes = proceso === 'observaciones' && group_id ? await buscarEstudiantes(usuario, { group_id }) : [];
  const encabezado = proceso === 'observaciones' && estudiantes.length > 0 ? [...nombres, COLUMNA_ESTUDIANTE] : nombres;
  const filas = estudiantes.map((e) => [e.numero_documento, '', '', '', '', `${e.apellido} ${e.nombre}`]);

  if (formato === 'csv') {
    const celda = (valor: string) => `"${neutralizarFormula(valor).replace(/"/g, '""')}"`;
    const lineas = [encabezado, ...filas].map((f) => f.map(celda).join(';'));
    // UTF-8 con BOM y punto y coma: así lo abre Excel en español sin dañar tildes ni la ñ.
    return { buffer: Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8'), nombreArchivo: `plantilla-${proceso}.csv`, contentType: 'text/csv; charset=utf-8' };
  }

  const listas: ListaDesplegable[] = [];
  if (proceso === 'tipos') {
    listas.push({ columna: 'familia', valores: [...FAMILIAS_OBSERVACION] }, { columna: 'visible_estudiante', valores: ['SI', 'NO'] }, { columna: 'estado', valores: ['ACTIVO', 'INACTIVO'] });
  } else if (proceso === 'categorias') {
    listas.push({ columna: 'estado', valores: ['ACTIVO', 'INACTIVO'] });
  } else if (proceso === 'frases') {
    listas.push(
      { columna: 'tipo', valores: (catalogo?.tipos ?? []).map((t) => t.nombre) },
      { columna: 'categoria', valores: (catalogo?.categorias ?? []).map((c) => c.nombre) },
      { columna: 'tipo_situacion', valores: [...TIPOS_SITUACION] },
      { columna: 'estado', valores: ['ACTIVO', 'INACTIVO'] }
    );
  } else {
    listas.push({ columna: 'tipo', valores: (catalogo?.tipos ?? []).filter((t) => t.familia !== 'DISCIPLINARIA').map((t) => t.nombre) });
  }

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_CARGA, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = encabezado.map((nombre) => ({ header: nombre, width: Math.max(16, nombre.length + 4) }));
  hoja.getRow(1).font = { bold: true };
  // Texto, no número: un documento con ceros a la izquierda no debe perderlos.
  const formatoTexto = (nombre: string) => ['numero_documento', 'codigo'].includes(nombre);
  encabezado.forEach((nombre, i) => {
    if (formatoTexto(nombre)) hoja.getColumn(i + 1).numFmt = '@';
  });
  filas.forEach((fila, i) => {
    fila.forEach((valor, j) => {
      if (valor !== '') hoja.getRow(i + 2).getCell(j + 1).value = neutralizarFormula(valor);
    });
  });

  const instrucciones = libro.addWorksheet(HOJA_INSTRUCCIONES);
  instrucciones.columns = [{ header: 'Columna', width: 22 }, { header: 'Obligatoria', width: 13 }, { header: 'Qué va aquí', width: 80 }, { header: 'Ejemplo', width: 34 }];
  instrucciones.getRow(1).font = { bold: true };
  for (const c of columnas) instrucciones.addRow([c.nombre, c.obligatoria ? 'Sí' : 'No', neutralizarFormula(c.descripcion), neutralizarFormula(c.ejemplo)]);
  instrucciones.addRow([]);
  instrucciones.addRow(['', '', 'Se valida todo el archivo antes de guardar: si una fila tiene un error, no se guarda ninguna.', '']);
  if (proceso === 'observaciones') instrucciones.addRow(['', '', 'La columna «estudiante» es solo informativa: la fila se identifica por numero_documento.', '']);

  const hojaListas = libro.addWorksheet(HOJA_LISTAS, { state: 'hidden' });
  const ultimaFila = proceso === 'observaciones' ? Math.max(MAX_FILAS_IMPORTACION[proceso] + 1, filas.length + 1) : MAX_FILAS_IMPORTACION[proceso] + 1;
  listas.forEach((lista, i) => {
    lista.valores.forEach((valor, j) => {
      hojaListas.getCell(j + 1, i + 1).value = neutralizarFormula(valor);
    });
    const posicion = encabezado.indexOf(lista.columna) + 1;
    if (posicion === 0 || lista.valores.length === 0) return;
    const letra = String.fromCharCode(64 + i + 1);
    for (let fila = 2; fila <= Math.min(ultimaFila, 502); fila += 1) {
      hoja.getCell(fila, posicion).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`${HOJA_LISTAS}!$${letra}$1:$${letra}$${lista.valores.length}`],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Elige un valor de la lista.',
      };
    }
  });

  const contexto = libro.addWorksheet(HOJA_CONTEXTO, { state: 'hidden' });
  contexto.getCell('A1').value = 'proceso';
  contexto.getCell('B1').value = proceso;
  contexto.getCell('A2').value = 'version';
  contexto.getCell('B2').value = VERSION_PLANTILLA_IMPORTACION;

  return {
    buffer: Buffer.from(await libro.xlsx.writeBuffer()),
    nombreArchivo: `plantilla-${proceso}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
