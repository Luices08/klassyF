import { reevaluarPendientes } from './titulacion.service';
import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, Rol } from '../constants/enums';
import { COMENTARIO_APROBACION_AUTOMATICA, EstadoPazYSalvo, FiltroEstadoPazYSalvo } from '../constants/pazYSalvo';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Enrollment, { IChecklistItem } from '../models/enrollment.model';
import Institution from '../models/institution.model';
import PazYSalvo, { PazYSalvoDocument } from '../models/pazYSalvo.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { checklistCompleto } from '../utils/documentosMatricula';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { PermisoPazYSalvo, permisoPazYSalvo } from '../utils/permisosPazYSalvo';
import { registrarEvento } from './audit.service';

/**
 * Paz y salvo de fin de año (M04, lo lee la matrícula de quien sigue estudiando). Es un registro por estudiante y año que
 * confirma el personal de matrículas o, si la institución lo habilitó, los docentes. Una vez confirmado, la matrícula del año
 * siguiente aprueba sola el documento `PAZ_Y_SALVO_ANIO_ANTERIOR` de su checklist.
 */

type Actor = { id: string | Types.ObjectId; rol: Rol };

const ESTADOS_QUE_AUN_PIDEN_DOCUMENTOS = ['PREINSCRITO', 'MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'] as const;
const TIPO_EN_CHECKLIST = 'PAZ_Y_SALVO_ANIO_ANTERIOR';

async function docentesHabilitados(): Promise<boolean> {
  const institucion = await Institution.findOne().select('paz_y_salvo_docentes');
  return Boolean(institucion?.paz_y_salvo_docentes);
}

export async function permisosDelActor(rol: Rol): Promise<PermisoPazYSalvo> {
  return permisoPazYSalvo(rol, rol === ROLES.DOCENTE ? await docentesHabilitados() : false);
}

/** Un docente solo gestiona a los estudiantes de los grupos donde dicta clase o es director. */
async function gruposDelDocente(docenteId: string | Types.ObjectId, anioId: string): Promise<string[]> {
  const grupos = await TeacherAssignment.find({
    docente_id: docenteId,
    academic_year_id: anioId,
    estado: ESTADO_ACTIVO,
    tipo_asignacion: { $in: ['CLASE', 'DIRECCION_GRUPO'] },
    group_id: { $ne: null },
  }).distinct('group_id');
  return grupos.map(String);
}

async function exigirPermiso(actor: Actor, accion: keyof Omit<PermisoPazYSalvo, 'motivo'>): Promise<PermisoPazYSalvo> {
  const permiso = await permisosDelActor(actor.rol);
  if (!permiso[accion]) throw new ApiError(403, permiso.motivo ?? 'No tienes permiso para esta acción del paz y salvo.');
  return permiso;
}

/** El estudiante debe estar matriculado en ese año y, si es un docente, en uno de sus grupos. */
async function exigirAlcance(actor: Actor, studentId: string, anioId: string): Promise<void> {
  const filtro: Record<string, unknown> = {
    student_id: studentId,
    academic_year_id: anioId,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  };
  if (actor.rol === ROLES.DOCENTE) filtro.group_id = { $in: await gruposDelDocente(actor.id, anioId) };
  if (!(await Enrollment.exists(filtro))) {
    throw new ApiError(404, 'El estudiante no tiene una matrícula activa en ese año lectivo entre los grupos que puedes gestionar.');
  }
}

async function exigirAnioAbierto(anioId: string): Promise<void> {
  const anio = await AcademicYear.findById(anioId).select('estado year');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año lectivo ${anio.year} está cerrado: su paz y salvo ya no se modifica.`);
}

export interface FiltroListadoPazYSalvo {
  academic_year_id: string;
  group_id?: string;
  estado?: FiltroEstadoPazYSalvo;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarPazYSalvo(actor: Actor, filtro: FiltroListadoPazYSalvo) {
  const permiso = await permisosDelActor(actor.rol);
  const vacio = { data: [], total: 0, page: 1, pages: 1, resumen: { total: 0, sin_cargar: 0, cargado: 0, confirmado: 0, rechazado: 0 }, puede: permiso };
  if (!permiso.ver) return vacio;

  const base: Record<string, unknown> = { academic_year_id: filtro.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } };
  if (actor.rol === ROLES.DOCENTE) {
    const propios = await gruposDelDocente(actor.id, filtro.academic_year_id);
    if (filtro.group_id && !propios.includes(filtro.group_id)) return vacio;
    base.group_id = filtro.group_id ? filtro.group_id : { $in: propios };
  } else if (filtro.group_id) {
    base.group_id = filtro.group_id;
  }
  if (filtro.search) {
    const regex = new RegExp(filtro.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const usuarios = await User.find({ $or: [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }] }).select('_id');
    base.student_id = { $in: usuarios.map((u) => u._id) };
  }

  const estudiantes = (await Enrollment.find(base).select('student_id').lean()).map((m) => String(m.student_id));
  const registros = await PazYSalvo.find({ academic_year_id: filtro.academic_year_id, student_id: { $in: estudiantes } }).lean();
  const porEstudiante = new Map(registros.map((r) => [String(r.student_id), r]));

  const resumen = { total: estudiantes.length, sin_cargar: 0, cargado: 0, confirmado: 0, rechazado: 0 };
  for (const id of estudiantes) {
    const estado = porEstudiante.get(id)?.estado;
    if (!estado) resumen.sin_cargar += 1;
    else if (estado === 'CARGADO') resumen.cargado += 1;
    else if (estado === 'CONFIRMADO') resumen.confirmado += 1;
    else resumen.rechazado += 1;
  }

  const delFiltro = filtro.estado
    ? estudiantes.filter((id) => (porEstudiante.get(id)?.estado ?? 'SIN_CARGAR') === filtro.estado)
    : estudiantes;

  const page = Math.max(1, filtro.page ?? 1);
  const limit = Math.min(100, Math.max(1, filtro.limit ?? 25));
  const consulta = { ...base, student_id: { $in: delFiltro } };
  const [matriculas, total] = await Promise.all([
    Enrollment.find(consulta)
      .sort({ group_id: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('student_id', 'nombre apellido numero_documento')
      .populate('group_id', 'nomenclatura'),
    Enrollment.countDocuments(consulta),
  ]);

  const personas = await User.find({
    _id: { $in: registros.flatMap((r) => [r.cargado_por, r.revisado_por]).filter(Boolean) },
  }).select('nombre apellido');
  const nombreDe = new Map(personas.map((p) => [String(p._id), `${p.nombre} ${p.apellido}`]));

  const data = matriculas.map((m) => {
    const estudiante = m.student_id as unknown as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
    const grupo = m.group_id as unknown as { _id: Types.ObjectId; nomenclatura: string } | null;
    const r = porEstudiante.get(String(estudiante._id));
    return {
      student_id: String(estudiante._id),
      nombre: estudiante.nombre,
      apellido: estudiante.apellido,
      numero_documento: estudiante.numero_documento,
      group_id: grupo ? String(grupo._id) : null,
      grupo: grupo?.nomenclatura ?? null,
      paz_y_salvo_id: r ? String(r._id) : null,
      estado: (r?.estado ?? 'SIN_CARGAR') as FiltroEstadoPazYSalvo,
      tiene_archivo: Boolean(r?.archivo_path),
      cargado_por: r?.cargado_por ? (nombreDe.get(String(r.cargado_por)) ?? null) : null,
      cargado_por_rol: r?.cargado_por_rol ?? null,
      fecha_carga: r?.fecha_carga ?? null,
      revisado_por: r?.revisado_por ? (nombreDe.get(String(r.revisado_por)) ?? null) : null,
      revisado_por_rol: r?.revisado_por_rol ?? null,
      fecha_revision: r?.fecha_revision ?? null,
      observacion: r?.observacion ?? null,
    };
  });

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)), resumen, puede: permiso };
}

/** Guarda el soporte. Queda CARGADO: alguien lo tiene que confirmar (puede ser la misma persona, en otro paso). */
export async function cargarPazYSalvo(
  actor: Actor,
  studentId: string,
  anioId: string,
  archivoPath: string
): Promise<PazYSalvoDocument> {
  await exigirPermiso(actor, 'cargar');
  await exigirAnioAbierto(anioId);
  await exigirAlcance(actor, studentId, anioId);

  const existente = await PazYSalvo.findOne({ student_id: studentId, academic_year_id: anioId });
  if (existente?.estado === 'CONFIRMADO') {
    throw new ApiError(409, 'Este paz y salvo ya está confirmado. Quita la confirmación antes de reemplazar el archivo.');
  }

  const registro =
    existente ?? new PazYSalvo({ student_id: studentId, academic_year_id: anioId });
  registro.estado = 'CARGADO';
  registro.archivo_path = archivoPath;
  registro.cargado_por = new Types.ObjectId(actor.id);
  registro.cargado_por_rol = actor.rol;
  registro.fecha_carga = new Date();
  registro.revisado_por = null;
  registro.revisado_por_rol = null;
  registro.fecha_revision = null;
  registro.observacion = null;
  await registro.save();

  await registrarEvento({ usuario_id: actor.id, accion: 'PAZ_Y_SALVO_CARGADO', entidad: 'PazYSalvo', entidad_id: registro._id, detalle: `Estudiante ${studentId}` });
  return registro;
}

export interface RevisionPazYSalvo {
  estado: Extract<EstadoPazYSalvo, 'CONFIRMADO' | 'RECHAZADO'>;
  observacion?: string;
}

/** Confirmar es el «check»: no exige archivo. Rechazar (o quitar una confirmación) exige decir por qué. */
export async function revisarPazYSalvo(
  actor: Actor,
  studentId: string,
  anioId: string,
  input: RevisionPazYSalvo
): Promise<PazYSalvoDocument> {
  const permiso = await exigirPermiso(actor, 'confirmar');
  await exigirAnioAbierto(anioId);
  await exigirAlcance(actor, studentId, anioId);

  const observacion = input.observacion?.trim() || null;
  if (input.estado === 'RECHAZADO' && !observacion) {
    throw new ApiError(400, 'Indica el motivo por el que no se confirma el paz y salvo.');
  }

  const registro = (await PazYSalvo.findOne({ student_id: studentId, academic_year_id: anioId })) ?? new PazYSalvo({ student_id: studentId, academic_year_id: anioId });
  if (registro.estado === input.estado && !registro.isNew) {
    throw new ApiError(400, `El paz y salvo ya está ${input.estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}.`);
  }
  const revocaConfirmacion = !registro.isNew && registro.estado === 'CONFIRMADO' && input.estado === 'RECHAZADO';
  if (revocaConfirmacion && !permiso.revocar) {
    throw new ApiError(403, 'Solo el personal de matrículas puede quitar una confirmación ya dada.');
  }

  registro.estado = input.estado;
  registro.revisado_por = new Types.ObjectId(actor.id);
  registro.revisado_por_rol = actor.rol;
  registro.fecha_revision = new Date();
  registro.observacion = observacion;
  await registro.save();

  if (input.estado === 'CONFIRMADO') await aprobarEnMatriculasPosteriores(registro, actor.id);
  // M26: un paz y salvo confirmado puede ser lo último que le faltaba a quien aprobó el último grado (grado por ventanilla).
  if (input.estado === 'CONFIRMADO') await reevaluarPendientes(studentId, 'Paz y salvo confirmado', null);
  else if (revocaConfirmacion) await devolverEnMatriculasPosteriores(registro);

  await registrarEvento({
    usuario_id: actor.id,
    accion: input.estado === 'CONFIRMADO' ? 'PAZ_Y_SALVO_CONFIRMADO' : 'PAZ_Y_SALVO_RECHAZADO',
    entidad: 'PazYSalvo',
    entidad_id: registro._id,
    detalle: `Estudiante ${studentId}${revocaConfirmacion ? ' (se quitó la confirmación)' : ''}`,
  });
  return registro;
}

export async function obtenerArchivoPazYSalvo(actor: Actor, id: string): Promise<string> {
  await exigirPermiso(actor, 'ver');
  const registro = await PazYSalvo.findById(id);
  if (!registro?.archivo_path) throw new ApiError(404, 'Ese paz y salvo no tiene archivo cargado.');
  await exigirAlcance(actor, String(registro.student_id), String(registro.academic_year_id));
  await registrarEvento({ usuario_id: actor.id, accion: 'PAZ_Y_SALVO_DESCARGADO', entidad: 'PazYSalvo', entidad_id: registro._id });
  return registro.archivo_path;
}

/**
 * Para la matrícula de un año: el paz y salvo confirmado del estudiante en un año anterior, si existe. Quien lo crea o
 * sincroniza el checklist aprueba con él el documento sin pedirlo de nuevo.
 */
export async function pazYSalvoConfirmadoPrevio(studentId: string | Types.ObjectId, anio: number): Promise<PazYSalvoDocument | null> {
  const aniosPrevios = await AcademicYear.find({ year: { $lt: anio } }).distinct('_id');
  if (aniosPrevios.length === 0) return null;
  return PazYSalvo.findOne({ student_id: studentId, academic_year_id: { $in: aniosPrevios }, estado: 'CONFIRMADO' });
}

/** Marca el documento como aprobado por el paz y salvo ya confirmado (sin archivo propio: el soporte está en ese registro). */
export function aprobarItemConPazYSalvo(item: Pick<IChecklistItem, 'estado' | 'comentario' | 'revisado_por'>, pazYSalvo: PazYSalvoDocument): void {
  item.estado = 'APROBADO';
  item.comentario = COMENTARIO_APROBACION_AUTOMATICA;
  item.revisado_por = pazYSalvo.revisado_por;
}

const esAprobacionAutomatica = (item: IChecklistItem): boolean =>
  item.tipo_documento === TIPO_EN_CHECKLIST && item.estado === 'APROBADO' && !item.archivo_path;

async function matriculasPosteriores(registro: PazYSalvoDocument) {
  const anio = await AcademicYear.findById(registro.academic_year_id).select('year');
  if (!anio) return [];
  const posteriores = await AcademicYear.find({ year: { $gt: anio.year } }).distinct('_id');
  return Enrollment.find({
    student_id: registro.student_id,
    academic_year_id: { $in: posteriores },
    estado: { $in: ESTADOS_QUE_AUN_PIDEN_DOCUMENTOS },
    'checklist.tipo_documento': TIPO_EN_CHECKLIST,
  });
}

/** Si ya tiene matrícula del año siguiente (preinscrita o condicional), el documento se aprueba al confirmar el paz y salvo. */
async function aprobarEnMatriculasPosteriores(registro: PazYSalvoDocument, actorId: string | Types.ObjectId): Promise<void> {
  for (const matricula of await matriculasPosteriores(registro)) {
    const item = matricula.checklist.find((c) => c.tipo_documento === TIPO_EN_CHECKLIST);
    if (!item || item.estado === 'APROBADO') continue;
    aprobarItemConPazYSalvo(item, registro);
    item.revisado_por = new Types.ObjectId(actorId);
    if (matricula.estado === 'MATRICULADO_CONDICIONAL' && checklistCompleto(matricula.checklist)) {
      matricula.estado = 'MATRICULADO_DEFINITIVO';
      matricula.fecha_limite_compromiso = null;
    }
    await matricula.save();
    await registrarEvento({
      usuario_id: actorId,
      accion: 'DOCUMENTO_REVISADO',
      entidad: 'Enrollment',
      entidad_id: matricula._id,
      detalle: `${TIPO_EN_CHECKLIST}: APROBADO (paz y salvo confirmado)${matricula.estado === 'MATRICULADO_DEFINITIVO' ? ' — checklist completo: matrícula pasa a MATRICULADO_DEFINITIVO' : ''}`,
    });
  }
}

/** Quitar la confirmación deshace solo lo que se aprobó automáticamente; un documento que alguien revisó con archivo no se toca. */
async function devolverEnMatriculasPosteriores(registro: PazYSalvoDocument): Promise<void> {
  for (const matricula of await matriculasPosteriores(registro)) {
    const item = matricula.checklist.find((c) => c.tipo_documento === TIPO_EN_CHECKLIST);
    if (!item || !esAprobacionAutomatica(item)) continue;
    item.estado = 'PENDIENTE';
    item.comentario = null;
    item.revisado_por = null;
    if (matricula.estado === 'MATRICULADO_DEFINITIVO') matricula.estado = 'MATRICULADO_CONDICIONAL';
    await matricula.save();
  }
}
