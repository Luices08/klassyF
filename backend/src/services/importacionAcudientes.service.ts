import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { Parentesco, TIPOS_DOCUMENTO } from '../constants/enums';
import {
  ClasificacionAcudientes,
  COLUMNAS_ACUDIENTES,
  COLUMNAS_ACUDIENTES_SIN_DESTINO,
  DIAS_VIGENCIA_SIMULACION_ACUDIENTES,
  ENCABEZADOS_PLANTILLA_ACUDIENTES,
  ETIQUETA_CLASIFICACION_ACUDIENTES,
  MINUTOS_RESERVA_LOTE_ACUDIENTES,
  MOTIVOS_ACUDIENTES,
  MotivoAcudientes,
  PARENTESCOS_ARCHIVO,
  SEGUNDOS_ENTRE_REVISIONES_ACUDIENTES,
  TELEFONO_SIN_DATO,
} from '../constants/importacionAcudientes';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import {
  IAvisoPrevioAcudientes,
  IOpcionesImportacionAcudientes,
  IResultadoFilaAcudientes,
  IResumenImportacionAcudientes,
  ImportacionAcudientes,
  ImportacionAcudientesDocument,
  ImportacionAcudientesFila,
} from '../models/importacionAcudientes.model';
import StudentGuardian from '../models/studentGuardian.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { neutralizarFormula } from '../utils/importacion';
import { camposACompletar, FilaAcudiente, normalizarFilaAcudiente, nombreCoincide } from '../utils/importacionAcudientes';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { habilitarPortalDeAcudientesDe } from './guardian.service';
import { leerArchivoAcudientes } from './importacionAcudientesLectura.service';

const PUEDEN_IMPORTAR: string[] = [ROLES.ADMIN, ROLES.SECRETARIA];
const POR_LOTE = 500;
const MATRICULA_CONFIRMADA = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'];

export interface ArchivoAcudientes {
  buffer: Buffer;
  nombre: string;
}

export interface OpcionesEntradaAcudientes {
  habilitar_portal?: boolean;
}

type FilaPlan = FilaAcudiente & { estudiante_id: string | null; principal_por_defecto: boolean };

const plural = (n: number, singular: string, pluralTexto: string): string => `${n} ${n === 1 ? singular : pluralTexto}`;

// ---------------------------------------------------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------------------------------------------------

function exigirPermiso(usuario: UserDocument): void {
  if (!usuario.roles.some((r) => PUEDEN_IMPORTAR.includes(r))) throw new ApiError(403, 'Solo el administrador y la secretaría importan acudientes.');
}

async function cargarLote(id: string, usuario: UserDocument): Promise<ImportacionAcudientesDocument> {
  exigirPermiso(usuario);
  const lote = Types.ObjectId.isValid(id) ? await ImportacionAcudientes.findById(id) : null;
  // «No existe» y «no es tuyo» responden igual: la secretaría solo ve las importaciones que hizo ella.
  if (!lote || (!usuario.roles.includes(ROLES.ADMIN) && String(lote.usuario_id) !== String(usuario._id))) throw new ApiError(404, 'La importación no existe.');
  return lote;
}

// ---------------------------------------------------------------------------------------------------------------------
// Contexto contra el que se cruza el archivo
// ---------------------------------------------------------------------------------------------------------------------

interface PersonaDelSistema {
  _id: Types.ObjectId;
  roles: string[];
  estado?: string;
  nombre: string;
  apellido: string;
  tipo_documento: string;
}

interface AcudienteDelSistema {
  _id: Types.ObjectId;
  nombre: string;
  apellido: string;
  tipo_documento: string;
  telefono_principal: string;
  telefono_secundario?: string | null;
  email?: string | null;
  ocupacion?: string | null;
  direccion?: string | null;
  user_id: Types.ObjectId | null;
}

interface Contexto {
  personas: Map<string, PersonaDelSistema>;
  acudientes: Map<string, AcudienteDelSistema>;
  vinculos: Set<string>;
  conPrincipal: Set<string>;
  conMatriculaConfirmada: Set<string>;
}

const trozos = <T>(lista: T[], tamano = 1000): T[][] => Array.from({ length: Math.ceil(lista.length / tamano) }, (_, i) => lista.slice(i * tamano, (i + 1) * tamano));

async function cargarContexto(filas: FilaAcudiente[], conMatriculas: boolean): Promise<Contexto> {
  const documentos = [...new Set(filas.flatMap((f) => [f.doc_estudiante, f.numero_documento]).filter(Boolean))];
  const docsAcudientes = [...new Set(filas.map((f) => f.numero_documento).filter(Boolean))];
  const personas = new Map<string, PersonaDelSistema>();
  for (const grupo of trozos(documentos)) {
    const usuarios = await User.find({ numero_documento: { $in: grupo } }).select('roles estado nombre apellido tipo_documento numero_documento').lean();
    for (const u of usuarios) personas.set(u.numero_documento, u as unknown as PersonaDelSistema);
  }
  const acudientes = new Map<string, AcudienteDelSistema>();
  for (const grupo of trozos(docsAcudientes)) {
    const lista = await Guardian.find({ numero_documento: { $in: grupo } }).lean();
    for (const g of lista) acudientes.set(g.numero_documento, g as unknown as AcudienteDelSistema);
  }
  const idsEstudiantes = [...new Set(filas.map((f) => personas.get(f.doc_estudiante)).filter((p) => p?.roles.includes(ROLES.ESTUDIANTE)).map((p) => p!._id))];
  const vinculos = new Set<string>();
  const conPrincipal = new Set<string>();
  const conMatriculaConfirmada = new Set<string>();
  for (const grupo of trozos(idsEstudiantes)) {
    for (const v of await StudentGuardian.find({ student_id: { $in: grupo } }).select('student_id guardian_id es_principal').lean()) {
      vinculos.add(`${v.student_id}|${v.guardian_id}`);
      if (v.es_principal) conPrincipal.add(String(v.student_id));
    }
    if (conMatriculas) {
      for (const id of await Enrollment.distinct('student_id', { student_id: { $in: grupo }, estado: { $in: MATRICULA_CONFIRMADA } })) conMatriculaConfirmada.add(String(id));
    }
  }
  return { personas, acudientes, vinculos, conPrincipal, conMatriculaConfirmada };
}

// ---------------------------------------------------------------------------------------------------------------------
// Clasificación de cada fila
// ---------------------------------------------------------------------------------------------------------------------

interface Clasificada {
  clasificacion: ClasificacionAcudientes;
  codigo_motivo: MotivoAcudientes | '';
  avisos: string[];
  campos: string[];
  identidad: string[];
  estudiante_id: string | null;
  principal_por_defecto: boolean;
  /** false cuando el acudiente ya estaba vinculado a este estudiante (solo se completarían sus datos). */
  vinculo_nuevo: boolean;
}

interface Seguimiento {
  pares: Map<string, number>;
  /** Estudiante -> principal que ya se planeó para él en este archivo (la fila y si lo dijo el archivo o lo decidió el sistema). */
  principales: Map<string, { fila: number; explicito: boolean }>;
  acudientes: Map<string, { fila: number; nombre: string; hijos: Set<string> }>;
}

function clasificarFila(fila: FilaAcudiente, errores: MotivoAcudientes[], avisosFila: string[], ctx: Contexto, seg: Seguimiento): Clasificada {
  const avisos = [...avisosFila];
  const base = { avisos, campos: [] as string[], identidad: [] as string[], estudiante_id: null as string | null, principal_por_defecto: false, vinculo_nuevo: true };
  const error = (codigo: MotivoAcudientes): Clasificada => ({ ...base, clasificacion: 'ERROR', codigo_motivo: codigo });

  if (errores.length > 0) {
    for (const e of errores.slice(1)) avisos.push(MOTIVOS_ACUDIENTES[e]);
    return error(errores[0]!);
  }

  const estudiante = ctx.personas.get(fila.doc_estudiante);
  if (!estudiante) return error('ESTUDIANTE_NO_EXISTE');
  if (!estudiante.roles.includes(ROLES.ESTUDIANTE)) return error('DOC_ESTUDIANTE_DE_OTRO_ROL');
  const estudianteId = String(estudiante._id);
  base.estudiante_id = estudianteId;
  if (estudiante.estado === 'inactivo') avisos.push(MOTIVOS_ACUDIENTES.ESTUDIANTE_INACTIVO);
  if (fila.tipo_doc_estudiante && fila.tipo_doc_estudiante !== estudiante.tipo_documento) {
    avisos.push(`El tipo de documento del estudiante en el archivo (${fila.tipo_doc_estudiante}) no coincide con el de Klassy (${estudiante.tipo_documento}).`);
  }
  if (fila.nombre_estudiante && !nombreCoincide(fila.nombre_estudiante, `${estudiante.apellido} ${estudiante.nombre}`)) {
    avisos.push(`El nombre del estudiante en el archivo («${fila.nombre_estudiante}») no se parece al de Klassy («${estudiante.apellido} ${estudiante.nombre}»): revisa que el documento esté bien digitado.`);
  }

  if (fila.numero_documento === fila.doc_estudiante) return error('ACUDIENTE_ES_EL_ESTUDIANTE');
  if (ctx.personas.get(fila.numero_documento)?.roles.includes(ROLES.ESTUDIANTE)) return error('ACUDIENTE_ES_ESTUDIANTE');

  const llavePar = `${fila.doc_estudiante}|${fila.numero_documento}`;
  const previa = seg.pares.get(llavePar);
  if (previa !== undefined) {
    avisos.push(`La fila ${previa} ya trae a este estudiante con este acudiente.`);
    return error('FILA_REPETIDA');
  }
  seg.pares.set(llavePar, fila.numero);

  // Principal: lo que dice el archivo manda; si no dice nada, el primero de un estudiante sin principal.
  const planeado = seg.principales.get(estudianteId);
  if (fila.es_principal === true) {
    if (planeado?.explicito) {
      avisos.push(`La fila ${planeado.fila} ya marca a otro acudiente como principal de este estudiante.`);
      return error('DOS_PRINCIPALES');
    }
    if (ctx.conPrincipal.has(estudianteId)) avisos.push('Pasará a ser el acudiente principal y reemplaza al principal actual.');
    seg.principales.set(estudianteId, { fila: fila.numero, explicito: true });
  } else if (fila.es_principal === null && !ctx.conPrincipal.has(estudianteId) && !planeado) {
    base.principal_por_defecto = true;
    seg.principales.set(estudianteId, { fila: fila.numero, explicito: false });
    avisos.push('El estudiante no tiene acudiente principal: este será el principal.');
  }

  const existente = ctx.acudientes.get(fila.numero_documento);
  const visto = seg.acudientes.get(fila.numero_documento);
  const hijos = visto?.hijos ?? new Set<string>();
  hijos.add(fila.doc_estudiante);
  const nombreCompleto = `${fila.nombre} ${fila.apellido}`;
  seg.acudientes.set(fila.numero_documento, { fila: visto?.fila ?? fila.numero, nombre: visto?.nombre ?? nombreCompleto, hijos });

  if (existente) {
    const { campos, identidad } = camposACompletar(existente, fila);
    base.campos = campos;
    base.identidad = identidad;
    if (ctx.vinculos.has(`${estudianteId}|${existente._id}`)) {
      if (campos.length > 0) avisos.push('Ya estaba vinculado a este estudiante: solo se completan sus datos vacíos.');
      return { ...base, vinculo_nuevo: false, clasificacion: campos.length > 0 ? 'VINCULAR' : 'SIN_CAMBIOS', codigo_motivo: '' };
    }
    return { ...base, clasificacion: 'VINCULAR', codigo_motivo: '' };
  }
  if (visto) {
    avisos.push(`Es el mismo acudiente de la fila ${visto.fila}: se crea una sola vez y se vincula a cada hijo.`);
    if (nombreCompleto.toLowerCase() !== visto.nombre.toLowerCase()) avisos.push(`Sus datos difieren de la fila ${visto.fila} («${visto.nombre}»): se usan los de la primera.`);
    return { ...base, clasificacion: 'VINCULAR', codigo_motivo: '' };
  }
  return { ...base, clasificacion: 'NUEVO', codigo_motivo: '' };
}

function avisosPrevios(r: Omit<IResumenImportacionAcudientes, 'avisos_previos'>, opciones: IOpcionesImportacionAcudientes, sinTelefono: number, portalSinCorreo: number): IAvisoPrevioAcudientes[] {
  const avisos: IAvisoPrevioAcudientes[] = [
    {
      clave: 'ESTUDIANTES_PREVIOS',
      titulo: 'Los estudiantes deben existir antes',
      detalle:
        'Cada acudiente se vincula a un estudiante que ya está en Klassy (creado a mano, por carga masiva o importado de SIMAT). Las filas cuyo estudiante no existe no se importan: créalo y vuelve a subir el archivo, que no duplica nada.',
      severidad: (r.por_motivo.ESTUDIANTE_NO_EXISTE ?? 0) > 0 ? 'warning' : 'info',
      cantidad: r.por_motivo.ESTUDIANTE_NO_EXISTE ?? 0,
    },
    {
      clave: 'DATOS_PERSONALES',
      titulo: 'Datos personales de las familias',
      detalle: 'Se guardan nombre, documento, teléfono, correo y dirección de los acudientes, asociados a los estudiantes. Confirma que el colegio cuenta con la autorización de tratamiento de datos (Ley 1581 de 2012).',
      severidad: 'info',
      cantidad: r.acudientes_por_crear,
    },
    {
      clave: 'IDENTIDAD',
      titulo: 'Un acudiente que ya existe no se modifica',
      detalle: 'Si el documento ya está registrado, se reutiliza a esa persona y solo se completan sus datos vacíos. Un nombre o un tipo de documento distinto no se cambia: se informa en el detalle de la fila.',
      severidad: 'info',
      cantidad: r.por_clasificacion.VINCULAR ?? 0,
    },
    {
      clave: 'PRINCIPAL',
      titulo: 'Acudiente principal (responsable legal)',
      detalle: 'Si el archivo no trae la columna ES_PRINCIPAL, el primer acudiente de cada estudiante sin principal queda como principal: es quien firma la matrícula y recibe las citaciones.',
      severidad: 'info',
      cantidad: r.vinculos_por_crear,
    },
  ];
  if (sinTelefono > 0) {
    avisos.push({
      clave: 'TELEFONO',
      titulo: 'Acudientes sin teléfono',
      detalle: `Se guardarán «${TELEFONO_SIN_DATO}» para ${plural(sinTelefono, 'acudiente que no trae teléfono', 'acudientes que no traen teléfono')}. Complétalo en su ficha: lo necesitan las citaciones.`,
      severidad: 'warning',
      cantidad: sinTelefono,
    });
  }
  if (opciones.habilitar_portal) {
    avisos.push({
      clave: 'PORTAL',
      titulo: 'Se abrirán cuentas del portal de acudientes',
      detalle:
        `Se abrirá la cuenta de ${plural(r.portal_por_abrir, 'acudiente principal', 'acudientes principales')} cuyo estudiante ya tiene la matrícula confirmada. Entran con su número de documento y ese mismo número es su contraseña temporal: el sistema les exige cambiarla al primer ingreso.` +
        (portalSinCorreo > 0 ? ` ${plural(portalSinCorreo, 'no tiene', 'no tienen')} correo registrado y no se les podrá abrir la cuenta.` : ''),
      severidad: 'warning',
      cantidad: r.portal_por_abrir,
    });
  }
  const conError = r.por_clasificacion.ERROR ?? 0;
  if (conError > 0) {
    avisos.push({
      clave: 'ERRORES',
      titulo: 'Hay filas con errores',
      detalle: `${plural(conError, 'fila no se importará', 'filas no se importarán')}. Descarga el informe, corrígelas y vuelve a subir el archivo: lo que ya quedó importado se reconoce y no se duplica.`,
      severidad: 'warning',
      cantidad: conError,
    });
  }
  return avisos;
}

// ---------------------------------------------------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lee el archivo, lo cruza con Klassy y deja el PLAN de lo que se haría, sin escribir ningún acudiente ni vínculo. Lo único que se guarda es la
 * simulación (que se descarta sola a los pocos días) con el informe de qué pasará con cada fila.
 */
export async function simularImportacion(archivo: ArchivoAcudientes, usuario: UserDocument, entrada: OpcionesEntradaAcudientes, ip?: string | null) {
  exigirPermiso(usuario);
  const opciones: IOpcionesImportacionAcudientes = { habilitar_portal: Boolean(entrada.habilitar_portal) };
  const lectura = await leerArchivoAcudientes(archivo.buffer, archivo.nombre);
  const normalizadas = lectura.filas.map((l) => ({ numero: l.numero, ...normalizarFilaAcudiente(l.cruda, l.numero) }));
  const ctx = await cargarContexto(normalizadas.map((n) => n.fila), opciones.habilitar_portal);

  const seg: Seguimiento = { pares: new Map(), principales: new Map(), acudientes: new Map() };
  const clasificadas = normalizadas.map((n) => ({ n, c: clasificarFila(n.fila, n.errores, n.avisos, ctx, seg) }));

  const porClasificacion: Record<string, number> = {};
  const porMotivo: Record<string, number> = {};
  const estudiantes = new Set<string>();
  const acudientesNuevos = new Set<string>();
  let vinculos = 0;
  let conDatos = 0;
  let sinTelefono = 0;
  const portal = new Set<string>();
  const portalSinCorreo = new Set<string>();
  for (const { n, c } of clasificadas) {
    porClasificacion[c.clasificacion] = (porClasificacion[c.clasificacion] ?? 0) + 1;
    if (c.codigo_motivo) porMotivo[c.codigo_motivo] = (porMotivo[c.codigo_motivo] ?? 0) + 1;
    if (c.clasificacion === 'ERROR') continue;
    const f = n.fila;
    estudiantes.add(f.doc_estudiante);
    if (c.clasificacion === 'NUEVO') acudientesNuevos.add(f.numero_documento);
    if (c.vinculo_nuevo) vinculos += 1;
    if (c.campos.length > 0) conDatos += 1;
    if (f.telefono_principal === TELEFONO_SIN_DATO && c.clasificacion === 'NUEVO') sinTelefono += 1;
    if (opciones.habilitar_portal && c.estudiante_id && ctx.conMatriculaConfirmada.has(c.estudiante_id)) {
      const esPrincipal = f.es_principal === true || c.principal_por_defecto;
      const existente = ctx.acudientes.get(f.numero_documento);
      if (esPrincipal && !existente?.user_id) {
        portal.add(f.numero_documento);
        if (!f.email && !existente?.email) portalSinCorreo.add(f.numero_documento);
      }
    }
  }
  const conVariosHijos = [...seg.acudientes.values()].filter((a) => a.hijos.size > 1).length;

  const advertencias: string[] = [];
  const faltantesEstudiante = porMotivo.ESTUDIANTE_NO_EXISTE ?? 0;
  if (faltantesEstudiante > 0) {
    advertencias.push(`${plural(faltantesEstudiante, 'fila trae un estudiante', 'filas traen estudiantes')} que no existe en Klassy: créalos o impórtalos primero.`);
  }
  if (lectura.opcionales_ausentes.length > 0) {
    advertencias.push(`El archivo no trae las columnas: ${lectura.opcionales_ausentes.map((c) => COLUMNAS_ACUDIENTES[c].alias[0]).join(', ')}. Esos datos quedarán vacíos.`);
  }
  const sinDestino = COLUMNAS_ACUDIENTES_SIN_DESTINO.filter((c) => !lectura.opcionales_ausentes.includes(c));
  if (sinDestino.length > 0) advertencias.push(`Las columnas ${sinDestino.map((c) => COLUMNAS_ACUDIENTES[c].alias[0]).join(', ')} se leen pero no se guardan: Klassy no tiene dónde registrarlas.`);

  const base: Omit<IResumenImportacionAcudientes, 'avisos_previos'> = {
    filas_archivo: lectura.filas.length,
    por_clasificacion: porClasificacion,
    por_motivo: porMotivo,
    estudiantes: estudiantes.size,
    acudientes_por_crear: acudientesNuevos.size,
    acudientes_con_varios_hijos: conVariosHijos,
    vinculos_por_crear: vinculos,
    con_datos_por_completar: conDatos,
    portal_por_abrir: portal.size,
    advertencias,
  };
  const resumen: IResumenImportacionAcudientes = { ...base, avisos_previos: avisosPrevios(base, opciones, sinTelefono, portalSinCorreo.size) };

  const expira = new Date(Date.now() + DIAS_VIGENCIA_SIMULACION_ACUDIENTES * 86_400_000);
  const procesables = clasificadas.filter(({ c }) => c.clasificacion !== 'ERROR').length;
  const lote = await ImportacionAcudientes.create({
    usuario_id: usuario._id,
    archivo_nombre: archivo.nombre.slice(0, 200),
    formato: lectura.formato,
    hash: createHash('sha256').update(archivo.buffer).digest('hex'),
    estado: 'SIMULADO',
    opciones,
    resumen,
    progreso: { total: procesables, procesadas: 0, correctas: 0, con_error: 0 },
    expira_en: expira,
  });

  for (let i = 0; i < clasificadas.length; i += POR_LOTE) {
    await ImportacionAcudientesFila.insertMany(
      clasificadas.slice(i, i + POR_LOTE).map(({ n, c }) => {
        const plan: FilaPlan = { ...n.fila, estudiante_id: c.estudiante_id, principal_por_defecto: c.principal_por_defecto };
        return {
          lote_id: lote._id,
          numero: n.numero,
          documento_estudiante: n.fila.doc_estudiante,
          estudiante: n.fila.nombre_estudiante,
          documento_acudiente: n.fila.numero_documento,
          acudiente: `${n.fila.nombre} ${n.fila.apellido}`.trim(),
          parentesco: n.fila.parentesco ?? '',
          clasificacion: c.clasificacion,
          codigo_motivo: c.codigo_motivo,
          motivo: c.codigo_motivo ? MOTIVOS_ACUDIENTES[c.codigo_motivo] : '',
          avisos: c.avisos,
          diferencias_identidad: c.identidad,
          campos_a_actualizar: c.campos,
          // Solo las filas que se procesarán conservan sus datos personales.
          datos: c.clasificacion === 'ERROR' ? null : plan,
          resultado: null,
          expira_en: expira,
        };
      })
    );
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_ACUDIENTES_SIMULADA',
    entidad: 'ImportacionAcudientes',
    entidad_id: lote._id,
    detalle: `Simulación de ${lectura.filas.length} filas (${porClasificacion.NUEVO ?? 0} acudientes nuevos, ${porClasificacion.VINCULAR ?? 0} ya registrados)`,
    ip,
  });

  return lote.toObject();
}

// ---------------------------------------------------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------------------------------------------------

export async function obtenerImportacion(id: string, usuario: UserDocument) {
  return (await cargarLote(id, usuario)).toObject();
}

export async function listarImportaciones(usuario: UserDocument) {
  exigirPermiso(usuario);
  const filtro = usuario.roles.includes(ROLES.ADMIN) ? {} : { usuario_id: usuario._id };
  return ImportacionAcudientes.find(filtro).sort({ createdAt: -1 }).limit(20).lean();
}

export interface FiltroFilasAcudientes {
  clasificacion?: ClasificacionAcudientes;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarFilasImportacion(id: string, usuario: UserDocument, filtro: FiltroFilasAcudientes) {
  const lote = await cargarLote(id, usuario);
  const page = Math.max(1, filtro.page ?? 1);
  const limit = Math.min(200, Math.max(1, filtro.limit ?? 50));
  const condicion: Record<string, unknown> = { lote_id: lote._id };
  if (filtro.clasificacion) condicion.clasificacion = filtro.clasificacion;
  if (filtro.search) {
    const patron = new RegExp(filtro.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    condicion.$or = [{ documento_estudiante: patron }, { documento_acudiente: patron }, { estudiante: patron }, { acudiente: patron }];
  }
  const [filas, total] = await Promise.all([
    ImportacionAcudientesFila.find(condicion).sort({ numero: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportacionAcudientesFila.countDocuments(condicion),
  ]);
  return { data: filas, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function descartarImportacion(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const lote = await cargarLote(id, usuario);
  if (lote.estado !== 'SIMULADO') throw new ApiError(409, 'Solo se descarta una simulación que aún no se aplicó.');
  await Promise.all([ImportacionAcudientesFila.deleteMany({ lote_id: lote._id }), lote.deleteOne()]);
  await registrarEvento({ usuario_id: usuario._id, accion: 'IMPORTACION_ACUDIENTES_DESCARTADA', entidad: 'ImportacionAcudientes', entidad_id: lote._id, ip });
}

// ---------------------------------------------------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosAplicacionAcudientes {
  contrasena: string;
  confirmo_advertencias: boolean;
}

let procesadorActivo = false;
let procesando = false;

/** Confirma una simulación y la deja en cola; la aplica el servidor en segundo plano. Exige la contraseña de quien confirma y haber leído las advertencias. */
export async function aplicarImportacion(id: string, datos: DatosAplicacionAcudientes, usuario: UserDocument, ip?: string | null) {
  const lote = await cargarLote(id, usuario);
  if (!datos.confirmo_advertencias) throw new ApiError(400, 'Debes confirmar que leíste las advertencias antes de importar.');
  if (lote.estado !== 'SIMULADO') throw new ApiError(409, `Esta importación ya está ${lote.estado === 'APLICADO' ? 'aplicada' : 'en proceso o terminada'}.`);
  if (lote.expira_en && lote.expira_en.getTime() < Date.now()) throw new ApiError(409, 'La simulación venció. Sube el archivo de nuevo.');

  const quien = await User.findById(usuario._id).select('+password_hash');
  if (!quien || !(await quien.comparePassword(datos.contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  const reclamada = await ImportacionAcudientes.findOneAndUpdate(
    { _id: lote._id, estado: 'SIMULADO' },
    { $set: { estado: 'EN_COLA', aplicado_por: usuario._id, fecha_aplicacion: new Date(), expira_en: null } },
    { new: true }
  );
  if (!reclamada) throw new ApiError(409, 'Otra persona ya aplicó esta importación.');
  await ImportacionAcudientesFila.updateMany({ lote_id: lote._id }, { $set: { expira_en: null } });

  const resumen = lote.resumen as IResumenImportacionAcudientes;
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'IMPORTACION_ACUDIENTES_APLICADA',
    entidad: 'ImportacionAcudientes',
    entidad_id: lote._id,
    detalle: `Se confirmó la importación: ${resumen.acudientes_por_crear} acudientes nuevos, ${resumen.vinculos_por_crear} vínculos con estudiantes`,
    ip,
  });
  despertarProcesador();
  return reclamada.toObject();
}

export function despertarProcesador(): void {
  if (!procesadorActivo) return;
  setImmediate(() => {
    procesarPendientes().catch((err) => console.error('[acudientes] Error procesando importaciones:', err));
  });
}

/** Arranca el proceso en segundo plano: revisa cada pocos segundos si hay una importación confirmada (o una cuyo proceso murió a la mitad). */
export function iniciarProcesadorImportacionAcudientes(): void {
  procesadorActivo = true;
  const pasada = (): void => {
    procesarPendientes().catch((err) => console.error('[acudientes] Error procesando importaciones:', err));
  };
  setTimeout(pasada, 9_000).unref();
  setInterval(pasada, SEGUNDOS_ENTRE_REVISIONES_ACUDIENTES * 1000).unref();
}

async function procesarPendientes(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    for (;;) {
      const lote = await reclamarSiguienteLote();
      if (!lote) return;
      await ejecutarLote(lote);
    }
  } finally {
    procesando = false;
  }
}

async function reclamarSiguienteLote(id?: string): Promise<ImportacionAcudientesDocument | null> {
  const ahora = new Date();
  return ImportacionAcudientes.findOneAndUpdate(
    {
      ...(id ? { _id: id } : {}),
      // Un lote cuyo proceso murió: al vencer su reserva lo retoma otro y solo procesa las filas que no tienen resultado.
      $or: [{ estado: 'EN_COLA' }, { estado: 'APLICANDO', reservado_hasta: { $lte: ahora } }],
    },
    { $set: { estado: 'APLICANDO', reservado_hasta: new Date(ahora.getTime() + MINUTOS_RESERVA_LOTE_ACUDIENTES * 60_000) } },
    { new: true, sort: { fecha_aplicacion: 1 } }
  );
}

/** Para las pruebas y los scripts: aplica un lote ya confirmado sin esperar al proceso en segundo plano. */
export async function procesarLoteAhora(id: string): Promise<void> {
  const lote = await reclamarSiguienteLote(id);
  if (lote) await ejecutarLote(lote);
}

async function procesarFila(actor: UserDocument, opciones: IOpcionesImportacionAcudientes, f: FilaPlan): Promise<IResultadoFilaAcudientes> {
  const { estudianteId, creado, completados, vinculo, esPrincipal } = await runTransaction(async (session) => {
    const estudiante = await User.findOne({ numero_documento: f.doc_estudiante, roles: ROLES.ESTUDIANTE }).session(session);
    if (!estudiante) throw new ApiError(404, 'El estudiante ya no existe en Klassy.');

    let guardian = await Guardian.findOne({ numero_documento: f.numero_documento }).session(session);
    let creadoAhora = false;
    let completadosAhora: string[] = [];
    if (!guardian) {
      const [nuevo] = await Guardian.create(
        [
          {
            tipo_documento: f.tipo_documento,
            numero_documento: f.numero_documento,
            nombre: f.nombre,
            apellido: f.apellido,
            telefono_principal: f.telefono_principal,
            ...(f.telefono_secundario ? { telefono_secundario: f.telefono_secundario } : {}),
            ...(f.email ? { email: f.email } : {}),
            ...(f.ocupacion ? { ocupacion: f.ocupacion } : {}),
            ...(f.direccion ? { direccion: f.direccion } : {}),
          },
        ],
        { session }
      );
      guardian = nuevo!;
      creadoAhora = true;
    } else {
      // Solo se completa lo que está vacío: un dato que ya hay en Klassy nunca se pisa.
      const { campos } = camposACompletar(guardian, f);
      if (campos.includes('teléfono principal')) guardian.telefono_principal = f.telefono_principal;
      if (campos.includes('teléfono secundario')) guardian.telefono_secundario = f.telefono_secundario ?? undefined;
      if (campos.includes('correo')) guardian.email = f.email ?? undefined;
      if (campos.includes('ocupación')) guardian.ocupacion = f.ocupacion ?? undefined;
      if (campos.includes('dirección')) guardian.direccion = f.direccion ?? undefined;
      if (campos.length > 0) await guardian.save({ session });
      completadosAhora = campos;
    }

    const previo = await StudentGuardian.findOne({ student_id: estudiante._id, guardian_id: guardian._id }).session(session);
    if (previo) {
      return { estudianteId: estudiante._id, creado: creadoAhora, completados: completadosAhora, vinculo: 'EXISTENTE' as const, esPrincipal: previo.es_principal };
    }
    const principal =
      f.es_principal === true || (f.es_principal === null && f.principal_por_defecto && !(await StudentGuardian.exists({ student_id: estudiante._id, es_principal: true }).session(session)));
    // El vínculo nace sin marcar y se sube a principal con un `updateOne` de la misma sesión: el hook de guardado del modelo desmarcaría a los demás
    // con una escritura FUERA de la transacción sobre filas que esta ya modificó, y se bloquearía.
    const [nuevoVinculo] = await StudentGuardian.create(
      [{ student_id: estudiante._id, guardian_id: guardian._id, parentesco: f.parentesco as Parentesco, es_principal: false, autorizado_retiro: f.autorizado_retiro ?? true }],
      { session }
    );
    if (principal) {
      await StudentGuardian.updateMany({ student_id: estudiante._id, _id: { $ne: nuevoVinculo!._id } }, { $set: { es_principal: false } }, { session });
      await StudentGuardian.updateOne({ _id: nuevoVinculo!._id }, { $set: { es_principal: true } }, { session });
    }
    return { estudianteId: estudiante._id, creado: creadoAhora, completados: completadosAhora, vinculo: 'CREADO' as const, esPrincipal: principal };
  });

  const partes: string[] = [creado ? 'Acudiente creado' : 'Acudiente ya registrado'];
  partes.push(vinculo === 'CREADO' ? 'vinculado al estudiante.' : 'ya estaba vinculado al estudiante.');
  if (completados.length > 0) partes.push(`Se completó: ${completados.join(', ')}.`);
  if (vinculo === 'CREADO' && esPrincipal) partes.push('Quedó como acudiente principal.');

  // La cuenta del portal es opcional y nunca tumba la fila: lo que no se pueda abrir se anota.
  if (opciones.habilitar_portal && esPrincipal && (await Enrollment.exists({ student_id: estudianteId, estado: { $in: MATRICULA_CONFIRMADA } }))) {
    const portal = await habilitarPortalDeAcudientesDe(estudianteId, { usuarioId: actor._id });
    if (portal.habilitados > 0) partes.push('Se abrió su cuenta del portal.');
    else if (portal.omitidos[0]) partes.push(`No se abrió su cuenta del portal: ${portal.omitidos[0].motivo}`);
  }
  return { estado: 'CORRECTA', detalle: partes.join(' '), acudiente_creado: creado, vinculo, campos_actualizados: completados };
}

async function ejecutarLote(lote: ImportacionAcudientesDocument): Promise<void> {
  try {
    const actor = lote.aplicado_por ? await User.findById(lote.aplicado_por) : null;
    if (!actor) throw new Error('Falta quien confirmó la importación.');
    const opciones = lote.opciones as IOpcionesImportacionAcudientes;

    // Solo las filas que aún no tienen resultado: así un lote retomado tras una caída no repite lo ya hecho.
    const pendientes = await ImportacionAcudientesFila.find({ lote_id: lote._id, clasificacion: { $ne: 'ERROR' }, resultado: null }).select('+datos').sort({ numero: 1 }).lean();
    for (const doc of pendientes) {
      let resultado: IResultadoFilaAcudientes;
      try {
        resultado = await procesarFila(actor, opciones, doc.datos as FilaPlan);
      } catch (err) {
        if (!(err instanceof ApiError)) console.error('[acudientes] Fila fallida:', err);
        resultado = { estado: 'ERROR', detalle: err instanceof ApiError ? err.message : 'No se pudo procesar la fila.', acudiente_creado: false, vinculo: 'NINGUNO', campos_actualizados: [] };
      }
      // La fila con sus datos personales ya no hace falta: queda solo el resultado.
      await ImportacionAcudientesFila.updateOne({ _id: doc._id }, { $set: { resultado, datos: null } });
      await ImportacionAcudientes.updateOne(
        { _id: lote._id },
        {
          $inc: { 'progreso.procesadas': 1, [resultado.estado === 'CORRECTA' ? 'progreso.correctas' : 'progreso.con_error']: 1 },
          $set: { reservado_hasta: new Date(Date.now() + MINUTOS_RESERVA_LOTE_ACUDIENTES * 60_000) },
        }
      );
    }
    await ImportacionAcudientesFila.updateMany({ lote_id: lote._id }, { $set: { datos: null } });
    await ImportacionAcudientes.updateOne({ _id: lote._id }, { $set: { estado: 'APLICADO', reservado_hasta: null } });
  } catch (err) {
    console.error('[acudientes] Importación fallida:', err);
    await ImportacionAcudientes.updateOne({ _id: lote._id }, { $set: { estado: 'FALLIDO', reservado_hasta: null, error: err instanceof Error ? err.message.slice(0, 300) : 'Error inesperado.' } });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Informe descargable
// ---------------------------------------------------------------------------------------------------------------------

export async function informeExcel(id: string, usuario: UserDocument): Promise<Buffer> {
  const lote = await cargarLote(id, usuario);
  const filas = await ImportacionAcudientesFila.find({ lote_id: lote._id }).sort({ numero: 1 }).lean();
  const r = lote.resumen as IResumenImportacionAcudientes;
  const libro = new ExcelJS.Workbook();

  const resumen = libro.addWorksheet('Resumen');
  const lineas: Array<[string, string | number]> = [
    ['Archivo', neutralizarFormula(lote.archivo_nombre)],
    ['Estado', lote.estado],
    ['Filas del archivo', r.filas_archivo],
    ...Object.entries(r.por_clasificacion).map(([k, v]) => [ETIQUETA_CLASIFICACION_ACUDIENTES[k as ClasificacionAcudientes] ?? k, v] as [string, number]),
    ['Estudiantes distintos', r.estudiantes],
    ['Acudientes nuevos', r.acudientes_por_crear],
    ['Acudientes con varios hijos', r.acudientes_con_varios_hijos],
    ['Vínculos con estudiantes', r.vinculos_por_crear],
    ['Cuentas de portal por abrir', r.portal_por_abrir],
    ...r.advertencias.map((a, i) => [`Advertencia ${i + 1}`, neutralizarFormula(a)] as [string, string]),
  ];
  for (const l of lineas) resumen.addRow(l);
  resumen.getColumn(1).width = 40;
  resumen.getColumn(2).width = 90;

  const hoja = libro.addWorksheet('Detalle');
  hoja.columns = [
    { header: 'Fila', key: 'fila', width: 7 },
    { header: 'Documento estudiante', key: 'doc_est', width: 20 },
    { header: 'Estudiante', key: 'estudiante', width: 34 },
    { header: 'Documento acudiente', key: 'doc_acu', width: 20 },
    { header: 'Acudiente', key: 'acudiente', width: 34 },
    { header: 'Parentesco', key: 'parentesco', width: 14 },
    { header: 'Clasificación', key: 'clasificacion', width: 22 },
    { header: 'Motivo', key: 'motivo', width: 52 },
    { header: 'Resultado', key: 'resultado', width: 12 },
    { header: 'Detalle', key: 'detalle', width: 60 },
    { header: 'Datos completados', key: 'campos', width: 36 },
    { header: 'Diferencias con lo registrado (no se aplicaron)', key: 'identidad', width: 36 },
    { header: 'Avisos', key: 'avisos', width: 70 },
  ];
  hoja.getRow(1).font = { bold: true };
  for (const f of filas) {
    hoja.addRow({
      fila: f.numero,
      // Documentos como texto: conservan ceros y no se vuelven notación científica.
      doc_est: neutralizarFormula(f.documento_estudiante),
      estudiante: neutralizarFormula(f.estudiante),
      doc_acu: neutralizarFormula(f.documento_acudiente),
      acudiente: neutralizarFormula(f.acudiente),
      parentesco: f.parentesco,
      clasificacion: ETIQUETA_CLASIFICACION_ACUDIENTES[f.clasificacion] ?? f.clasificacion,
      motivo: f.motivo,
      resultado: f.resultado?.estado ?? '',
      detalle: neutralizarFormula(f.resultado?.detalle ?? ''),
      campos: (f.resultado?.campos_actualizados ?? f.campos_a_actualizar).join(', '),
      identidad: f.diferencias_identidad.join(', '),
      avisos: neutralizarFormula(f.avisos.join(' | ')),
    });
  }
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------------------------------------------------
// Plantilla de ayuda
// ---------------------------------------------------------------------------------------------------------------------

const GUIA_PLANTILLA: ReadonlyArray<readonly [string, string, string, string]> = [
  ['TIPODOC_EST', 'No', 'Tipo de documento del estudiante. Solo sirve para avisar si no coincide con el de Klassy.', 'TI'],
  ['DOC_EST', 'Sí', 'Documento del estudiante, que YA debe existir en Klassy. Es lo que liga al acudiente con su hijo.', '1109672200'],
  ['NOMBRE_ESTUDIANTE', 'No', 'Solo para que quien llena el archivo reconozca la fila: si no se parece al nombre en Klassy se avisa (documento mal digitado).', 'Santiago Abad'],
  ['TIPODOC_ACUDIENTE', 'No', 'CC, CE, PEP, PPT, TI, RC o NES. Vacío = CC.', 'CC'],
  ['DOC_ACUDIENTE', 'Sí', 'Documento del acudiente, solo letras y números. Si ya existe en Klassy se reutiliza a esa persona.', '31852960'],
  ['APELLIDO1', 'Sí', 'Primer apellido del acudiente.', 'Pérez'],
  ['APELLIDO2', 'No', 'Segundo apellido.', 'Gómez'],
  ['NOMBRE1', 'Sí', 'Primer nombre del acudiente.', 'Kelly'],
  ['NOMBRE2', 'No', 'Segundo nombre.', 'Andrea'],
  ['PARENTESCO', 'Sí', 'MADRE, PADRE, ABUELO(A), TIO(A), HERMANO(A), TUTOR LEGAL u OTRO. En los que llevan (A) decide la columna GENERO.', 'MADRE'],
  ['GENERO', 'No', 'FEMENINO o MASCULINO. Solo se usa para resolver ABUELO(A), TIO(A) y HERMANO(A); no se guarda.', 'FEMENINO'],
  ['DIRECCION', 'No', 'Dirección de residencia.', 'Cra 10 # 20-30'],
  ['BARRIO', 'No', 'Se agrega al final de la dirección (Klassy no tiene un campo aparte).', 'Centro'],
  ['TELEFONO', 'No', 'Celular de 10 dígitos o fijo de 7. Si falta se guarda «Sin teléfono» y se avisa.', '3001112233'],
  ['TELEFONO2', 'No', 'Segundo teléfono.', '3109998877'],
  ['CORREO', 'No', 'Correo del acudiente. Lo necesita el portal y el envío de citaciones.', 'kelly@correo.com'],
  ['OCUPACION', 'No', 'Ocupación o profesión.', 'Docente'],
  ['ES_PRINCIPAL', 'No', 'SI o NO. Vacío = el primer acudiente de un estudiante que aún no tiene principal queda como principal (responsable legal).', 'SI'],
  ['AUTORIZADO_RETIRO', 'No', 'SI o NO. Vacío = SI.', 'SI'],
];

export async function generarPlantillaAcudientes(usuario: UserDocument, formato: 'xlsx' | 'csv') {
  exigirPermiso(usuario);
  const celda = (valor: string) => `"${neutralizarFormula(valor).replace(/"/g, '""')}"`;
  if (formato === 'csv') {
    // UTF-8 con BOM y punto y coma: así lo abre Excel en español sin dañar tildes ni la ñ.
    return {
      buffer: Buffer.from(`﻿${ENCABEZADOS_PLANTILLA_ACUDIENTES.map(celda).join(';')}\r\n`, 'utf8'),
      nombreArchivo: 'plantilla-acudientes.csv',
      contentType: 'text/csv; charset=utf-8',
    };
  }

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Acudientes', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = ENCABEZADOS_PLANTILLA_ACUDIENTES.map((nombre) => ({ header: nombre, width: nombre.startsWith('NOMBRE') || nombre === 'DIRECCION' ? 26 : 18 }));
  hoja.getRow(1).font = { bold: true };
  // Documentos y teléfonos como texto: un número no debe perder ceros ni volverse notación científica.
  for (const nombre of ['TIPODOC_EST', 'DOC_EST', 'DOC_ACUDIENTE', 'TELEFONO', 'TELEFONO2']) hoja.getColumn(ENCABEZADOS_PLANTILLA_ACUDIENTES.indexOf(nombre as never) + 1).numFmt = '@';

  const instrucciones = libro.addWorksheet('Instrucciones');
  instrucciones.columns = [{ header: 'Columna', width: 22 }, { header: 'Obligatoria', width: 13 }, { header: 'Qué va aquí', width: 95 }, { header: 'Ejemplo', width: 22 }];
  instrucciones.getRow(1).font = { bold: true };
  for (const [columna, obligatoria, descripcion, ejemplo] of GUIA_PLANTILLA) instrucciones.addRow([columna, obligatoria, descripcion, ejemplo]);
  instrucciones.addRow([]);
  for (const nota of [
    'Cada fila une a UN estudiante con UN acudiente. Si un acudiente tiene varios hijos, repite sus datos en una fila por cada hijo.',
    'Los estudiantes deben existir antes (creados a mano, por carga masiva o importados de SIMAT).',
    'Antes de guardar, Klassy te muestra qué pasaría con cada fila y tú confirmas. Subir el mismo archivo otra vez no duplica nada.',
    'No pongas fórmulas: pega solo valores. No borres ni cambies los encabezados de la hoja «Acudientes».',
  ]) instrucciones.addRow(['', '', nota, '']);

  const listas = libro.addWorksheet('Listas', { state: 'hidden' });
  const opciones: string[][] = [[...TIPOS_DOCUMENTO], [...PARENTESCOS_ARCHIVO], ['FEMENINO', 'MASCULINO'], ['SI', 'NO']];
  opciones.forEach((valores, i) => valores.forEach((valor, j) => (listas.getCell(j + 1, i + 1).value = valor)));
  const validaciones: Array<[string, string, number]> = [
    ['TIPODOC_EST', 'A', opciones[0]!.length],
    ['TIPODOC_ACUDIENTE', 'A', opciones[0]!.length],
    ['PARENTESCO', 'B', opciones[1]!.length],
    ['GENERO', 'C', opciones[2]!.length],
    ['ES_PRINCIPAL', 'D', 2],
    ['AUTORIZADO_RETIRO', 'D', 2],
  ];
  for (const [columna, letra, cantidad] of validaciones) {
    const posicion = ENCABEZADOS_PLANTILLA_ACUDIENTES.indexOf(columna as never) + 1;
    for (let fila = 2; fila <= 2000; fila += 1) {
      hoja.getCell(fila, posicion).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$${letra}$1:$${letra}$${cantidad}`],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Elige un valor de la lista.',
      };
    }
  }

  return {
    buffer: Buffer.from(await libro.xlsx.writeBuffer()),
    nombreArchivo: 'plantilla-acudientes.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
