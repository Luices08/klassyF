import { ClientSession, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  EstadoCitacion,
  MAX_GRUPOS_POR_CITACION,
  MotivoCitacion,
  NOMBRES_MOTIVO_CITACION,
  TipoCitacion,
  TipoCorreo,
} from '../constants/citaciones';
import AcademicYear from '../models/academicYear.model';
import Citacion, { CitacionDocument } from '../models/citacion.model';
import CitacionDestinatario, { CitacionDestinatarioDocument } from '../models/citacionDestinatario.model';
import CorreoEnCola from '../models/correoEnCola.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { elegirAcudientes, esFechaFutura, generarTokenCitacion, parecerCorreo, puedeConvocar, situacionDeCorreo } from '../utils/citaciones';
import { fechaLegible } from '../utils/correoCitacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { despertarCola, encolarCorreos } from './colaCorreo.service';
import { correoConfigurado, motivoCorreoNoConfigurado } from './correo.service';
import { avisarCitacion } from './notificacionesEventos.service';

/**
 * M24 — Citaciones a acudientes. Una citación es GENERAL (uno o más grupos de una misma sede, p. ej. entrega de boletines) o PARTICULAR (un
 * estudiante, por comportamiento o rendimiento). Al convocar se crea un destinatario por acudiente y se deja el correo en la cola: quien
 * convoca no espera al SMTP. Lo que sabe el sistema (acudientes, correos, grupos) se lee de M03/M04, nunca se vuelve a pedir.
 */

type Id = Types.ObjectId | string;

const noEncontrada = () => new ApiError(404, 'Citación no encontrada.');

export interface GrupoConvocable {
  _id: string;
  nomenclatura: string;
  grado: string;
  sede_id: string;
  es_director: boolean;
}

/** El año en curso, que es el único en el que se citan acudientes. */
async function anioEnCurso() {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) throw new ApiError(409, 'No hay un año lectivo en curso: las citaciones se programan dentro del año vigente.');
  return anio;
}

const esCoordinacion = (usuario: UserDocument) => usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;

/** Los grupos del año en curso que este usuario puede convocar: todos para ADMIN y COORDINADOR; para un docente, donde dicta clase o dirige. */
export async function gruposQueConvoca(usuario: UserDocument): Promise<GrupoConvocable[]> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) return [];
  const base: Record<string, unknown> = { academic_year_id: anio._id, estado: 'ACTIVE' };
  if (!esCoordinacion(usuario)) {
    const clases = await TeacherAssignment.distinct('group_id', { docente_id: usuario._id, academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
    base.$or = [{ _id: { $in: clases } }, { director_grupo_id: usuario._id }];
  }
  const grupos = await Group.find(base).populate<{ grade_id: { nombre: string } }>('grade_id', 'nombre').sort({ nomenclatura: 1 });
  return grupos.map((g) => ({
    _id: String(g._id),
    nomenclatura: g.nomenclatura,
    grado: g.grade_id?.nombre ?? '',
    sede_id: String(g.sede_id),
    es_director: String(g.director_grupo_id) === String(usuario._id),
  }));
}

/** Estudiantes con matrícula activa de un grupo que el usuario puede convocar (para elegir a quién se cita en una citación particular). */
export async function estudiantesDelGrupo(usuario: UserDocument, groupId: string) {
  const grupos = await gruposQueConvoca(usuario);
  if (!grupos.some((g) => g._id === groupId)) return [];
  const matriculas = await Enrollment.find({ group_id: groupId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } }>('student_id', 'nombre apellido numero_documento')
    .limit(200);
  return matriculas
    .filter((m) => m.student_id)
    .map((m) => ({ student_id: String(m.student_id._id), nombre: m.student_id.nombre, apellido: m.student_id.apellido, numero_documento: m.student_id.numero_documento }))
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
}

export interface CitacionInput {
  tipo: TipoCitacion;
  motivo: MotivoCitacion;
  titulo: string;
  descripcion?: string;
  fecha_hora: string | Date;
  lugar: string;
  grupo_ids?: string[];
  student_id?: string;
  todos_los_acudientes?: boolean;
}

interface Objetivo {
  sede_id: Types.ObjectId;
  grupo_ids: Types.ObjectId[];
  student_id: Types.ObjectId | null;
  estudiantes: Types.ObjectId[];
}

/** Resuelve a quién apunta la citación y comprueba, en el servidor, que quien convoca tenga derecho sobre esos grupos o ese estudiante. */
async function resolverObjetivo(input: CitacionInput, usuario: UserDocument, anioId: Types.ObjectId): Promise<Objetivo> {
  const convocables = new Map((await gruposQueConvoca(usuario)).map((g) => [g._id, g]));

  if (input.tipo === 'GENERAL') {
    const ids = [...new Set(input.grupo_ids ?? [])];
    if (ids.length === 0) throw new ApiError(400, 'Elige al menos un grupo.');
    if (ids.length > MAX_GRUPOS_POR_CITACION) throw new ApiError(400, `Una citación abarca como máximo ${MAX_GRUPOS_POR_CITACION} grupos.`);
    for (const id of ids) {
      const grupo = convocables.get(id);
      if (!grupo) throw new ApiError(404, 'Uno de los grupos no existe o no está a tu alcance.');
      if (!puedeConvocar(usuario.rol!, 'GENERAL', grupo)) throw new ApiError(403, `Solo el director del grupo ${grupo.grado} ${grupo.nomenclatura} (o coordinación) puede citar a todo el grupo.`);
    }
    const sedes = new Set(ids.map((id) => (convocables.get(id) as GrupoConvocable).sede_id));
    if (sedes.size > 1) throw new ApiError(400, 'Una citación tiene un solo lugar: elige grupos de una misma sede.');
    const matriculas = await Enrollment.find({ group_id: { $in: ids }, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id').lean();
    return {
      sede_id: new Types.ObjectId([...sedes][0]),
      grupo_ids: ids.map((id) => new Types.ObjectId(id)),
      student_id: null,
      estudiantes: [...new Set(matriculas.map((m) => String(m.student_id)))].map((id) => new Types.ObjectId(id)),
    };
  }

  if (!input.student_id) throw new ApiError(400, 'Elige al estudiante.');
  const matricula = await Enrollment.findOne({ student_id: input.student_id, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('group_id').lean();
  const grupo = matricula ? convocables.get(String(matricula.group_id)) : undefined;
  // «No existe» y «no es de tu alcance» responden igual.
  if (!grupo || !puedeConvocar(usuario.rol!, 'PARTICULAR', grupo)) throw new ApiError(404, 'Estudiante no encontrado.');
  return { sede_id: new Types.ObjectId(grupo.sede_id), grupo_ids: [], student_id: new Types.ObjectId(input.student_id), estudiantes: [new Types.ObjectId(input.student_id)] };
}

interface DestinatarioPlan {
  student_id: Types.ObjectId;
  guardian_id: Types.ObjectId;
  user_id: Types.ObjectId | null;
  email: string;
}

/** Un destinatario por acudiente de cada estudiante, con el correo y la cuenta de portal que M03 tiene hoy. */
async function planDeDestinatarios(estudiantes: Types.ObjectId[], todos: boolean): Promise<DestinatarioPlan[]> {
  const vinculos = await StudentGuardian.find({ student_id: { $in: estudiantes } }).select('student_id guardian_id es_principal').lean();
  const guardians = new Map((await Guardian.find({ _id: { $in: vinculos.map((v) => v.guardian_id) } }).select('email user_id estado').lean()).map((g) => [String(g._id), g]));

  const plan: DestinatarioPlan[] = [];
  for (const estudiante of estudiantes) {
    const delEstudiante = vinculos.filter((v) => String(v.student_id) === String(estudiante));
    const elegidos = elegirAcudientes(
      delEstudiante.map((v) => ({ guardian_id: String(v.guardian_id), es_principal: v.es_principal, activo: guardians.get(String(v.guardian_id))?.estado !== 'inactivo' && guardians.has(String(v.guardian_id)) })),
      todos
    );
    for (const id of elegidos) {
      const g = guardians.get(id);
      if (!g) continue;
      plan.push({ student_id: estudiante, guardian_id: new Types.ObjectId(id), user_id: (g.user_id as Types.ObjectId | null) ?? null, email: parecerCorreo(g.email) ? (g.email as string).trim().toLowerCase() : '' });
    }
  }
  return plan;
}

const cuando = (fecha: Date): string => {
  const { dia, hora } = fechaLegible(fecha);
  return `${dia}, ${hora}`;
};

export async function crearCitacion(input: CitacionInput, usuario: UserDocument, ip?: string) {
  const fecha = new Date(input.fecha_hora);
  if (!esFechaFutura(fecha, new Date())) throw new ApiError(400, 'La fecha y hora de la citación deben ser posteriores a este momento.');
  const anio = await anioEnCurso();
  const objetivo = await resolverObjetivo(input, usuario, anio._id);
  if (objetivo.estudiantes.length === 0) throw new ApiError(409, 'Los grupos elegidos no tienen estudiantes con matrícula activa.');

  const plan = await planDeDestinatarios(objetivo.estudiantes, Boolean(input.todos_los_acudientes));
  if (plan.length === 0) throw new ApiError(409, 'Ninguno de los estudiantes tiene un acudiente registrado: vincúlalos primero en el expediente del estudiante.');

  const enviaCorreo = correoConfigurado();
  const correos: Array<{ _id: Types.ObjectId; tipo: TipoCorreo; referencia_id: Types.ObjectId; para: string }> = [];

  const { citacion, destinatarios } = await runTransaction(async (session) => {
    const [creada] = await Citacion.create(
      [
        {
          tipo: input.tipo,
          motivo: input.motivo,
          titulo: input.titulo,
          descripcion: input.descripcion ?? '',
          fecha_hora: fecha,
          lugar: input.lugar,
          convocante_id: usuario._id,
          convocante_rol: usuario.rol,
          academic_year_id: anio._id,
          sede_id: objetivo.sede_id,
          grupo_ids: objetivo.grupo_ids,
          student_id: objetivo.student_id,
          todos_los_acudientes: Boolean(input.todos_los_acudientes),
        },
      ],
      { session }
    );
    if (!creada) throw new ApiError(500, 'No se pudo crear la citación.');

    const docs = plan.map((p) => {
      const _id = new Types.ObjectId();
      const correo_id = enviaCorreo && p.email ? new Types.ObjectId() : null;
      if (correo_id) correos.push({ _id: correo_id, tipo: 'CITACION_NUEVA', referencia_id: _id, para: p.email });
      return { _id, citacion_id: creada._id, ...p, token: generarTokenCitacion(), correo_id };
    });
    await CitacionDestinatario.insertMany(docs, { session });
    await encolarCorreos(correos, session);
    return { citacion: creada, destinatarios: docs };
  });

  despertarCola();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_CREADA', entidad: 'Citacion', entidad_id: citacion._id, detalle: `${input.tipo}: ${destinatarios.length} acudiente(s), ${correos.length} correo(s) en cola`, ip });
  await avisarCitacion({ _id: citacion._id, titulo: citacion.titulo, fechaLegible: cuando(fecha) }, 'CITACION_NUEVA', destinatarios);

  return { ...(await detalleCitacion(String(citacion._id), usuario)), advertencia_correo: enviaCorreo ? null : motivoCorreoNoConfigurado() };
}

// --- Consulta ---

const puedeVer = (usuario: UserDocument, citacion: { convocante_id: Id }) => esCoordinacion(usuario) || String(citacion.convocante_id) === String(usuario._id);

async function cargarVisible(id: string, usuario: UserDocument): Promise<CitacionDocument> {
  if (!Types.ObjectId.isValid(id)) throw noEncontrada();
  const citacion = await Citacion.findById(id);
  // «No existe» y «no es tuya» responden igual.
  if (!citacion || !puedeVer(usuario, citacion)) throw noEncontrada();
  return citacion;
}

export interface FiltrosCitaciones {
  academic_year_id: string;
  estado?: EstadoCitacion;
  search?: string;
}

export async function listarCitaciones(filtros: FiltrosCitaciones, usuario: UserDocument) {
  const filtro: Record<string, unknown> = { academic_year_id: filtros.academic_year_id };
  if (!esCoordinacion(usuario)) filtro.convocante_id = usuario._id;
  if (filtros.estado) filtro.estado = filtros.estado;
  if (filtros.search?.trim()) filtro.titulo = new RegExp(filtros.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const citaciones = await Citacion.find(filtro).sort({ fecha_hora: -1 }).limit(300).lean();
  if (citaciones.length === 0) return [];

  const [convocantes, conteos] = await Promise.all([
    User.find({ _id: { $in: citaciones.map((c) => c.convocante_id) } }).select('nombre apellido').lean(),
    CitacionDestinatario.aggregate<{ _id: { c: Types.ObjectId; r: string }; n: number }>([
      { $match: { citacion_id: { $in: citaciones.map((c) => c._id) } } },
      { $group: { _id: { c: '$citacion_id', r: '$respuesta' }, n: { $sum: 1 } } },
    ]),
  ]);
  const nombres = new Map(convocantes.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  const respuestas = (id: Types.ObjectId, r: string) => conteos.find((c) => String(c._id.c) === String(id) && c._id.r === r)?.n ?? 0;

  return citaciones.map((c) => ({
    _id: String(c._id),
    tipo: c.tipo,
    motivo: c.motivo,
    titulo: c.titulo,
    fecha_hora: c.fecha_hora,
    lugar: c.lugar,
    estado: c.estado,
    convocante: nombres.get(String(c.convocante_id)) ?? '—',
    destinatarios: respuestas(c._id, 'PENDIENTE') + respuestas(c._id, 'CONFIRMADA') + respuestas(c._id, 'NO_ASISTIRA'),
    confirmados: respuestas(c._id, 'CONFIRMADA'),
    no_asistiran: respuestas(c._id, 'NO_ASISTIRA'),
    pendientes: respuestas(c._id, 'PENDIENTE'),
  }));
}

export async function detalleCitacion(id: string, usuario: UserDocument) {
  const citacion = await cargarVisible(id, usuario);
  const destinatarios = await CitacionDestinatario.find({ citacion_id: citacion._id }).lean();
  const [estudiantes, acudientes, correos, convocante, grupos] = await Promise.all([
    User.find({ _id: { $in: destinatarios.map((d) => d.student_id) } }).select('nombre apellido numero_documento').lean(),
    Guardian.find({ _id: { $in: destinatarios.map((d) => d.guardian_id) } }).select('nombre apellido').lean(),
    CorreoEnCola.find({ _id: { $in: destinatarios.map((d) => d.correo_id).filter(Boolean) } }).select('estado ultimo_error intentos').lean(),
    User.findById(citacion.convocante_id).select('nombre apellido').lean(),
    Group.find({ _id: { $in: citacion.grupo_ids } }).select('nomenclatura').lean(),
  ]);
  const porEstudiante = new Map(estudiantes.map((e) => [String(e._id), e]));
  const porAcudiente = new Map(acudientes.map((a) => [String(a._id), a]));
  const porCorreo = new Map(correos.map((c) => [String(c._id), c]));

  const filas = destinatarios
    .map((d) => {
      const e = porEstudiante.get(String(d.student_id));
      const a = porAcudiente.get(String(d.guardian_id));
      const correo = d.correo_id ? porCorreo.get(String(d.correo_id)) : undefined;
      const situacion = situacionDeCorreo(Boolean(d.email), correo?.estado ?? null);
      return {
        _id: String(d._id),
        estudiante: e ? { nombre: e.nombre, apellido: e.apellido, numero_documento: e.numero_documento } : { nombre: '—', apellido: '', numero_documento: '' },
        acudiente: a ? `${a.nombre} ${a.apellido}` : '—',
        email: d.email,
        tiene_portal: Boolean(d.user_id),
        respuesta: d.respuesta,
        respondida_en: d.respondida_en,
        canal_respuesta: d.canal_respuesta,
        correo: situacion,
        error_correo: situacion === 'FALLIDO' ? correo?.ultimo_error ?? '' : '',
      };
    })
    .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es'));

  const editable = citacion.estado === 'PROGRAMADA';
  return {
    _id: String(citacion._id),
    tipo: citacion.tipo,
    motivo: citacion.motivo,
    nombre_motivo: NOMBRES_MOTIVO_CITACION[citacion.motivo],
    titulo: citacion.titulo,
    descripcion: citacion.descripcion,
    fecha_hora: citacion.fecha_hora,
    lugar: citacion.lugar,
    estado: citacion.estado,
    version: citacion.version,
    convocante: convocante ? `${convocante.nombre} ${convocante.apellido}` : '—',
    convocante_rol: citacion.convocante_rol,
    grupos: grupos.map((g) => g.nomenclatura),
    todos_los_acudientes: citacion.todos_los_acudientes,
    cancelacion: citacion.cancelacion ? { motivo: citacion.cancelacion.motivo, fecha: citacion.cancelacion.fecha } : null,
    destinatarios: filas,
    correo_disponible: correoConfigurado(),
    motivo_correo_no_disponible: motivoCorreoNoConfigurado(),
    puede: { editar: editable, cancelar: editable, marcar_realizada: editable && citacion.fecha_hora.getTime() <= Date.now(), reenviar: editable },
  };
}

// --- Cambios ---

export interface CambiosCitacion {
  motivo?: MotivoCitacion;
  titulo?: string;
  descripcion?: string;
  fecha_hora?: string | Date;
  lugar?: string;
}

/** Correos nuevos (o de cancelación) para los acudientes que tienen correo; `solo_enviados` limita a quienes ya recibieron el primero. */
async function encolarParaDestinatarios(
  destinatarios: CitacionDestinatarioDocument[],
  tipo: TipoCorreo,
  session: ClientSession,
  soloQuienYaRecibio = false
): Promise<number> {
  if (!correoConfigurado()) return 0;
  let candidatos = destinatarios.filter((d) => d.email);
  if (soloQuienYaRecibio) {
    const enviados = new Set((await CorreoEnCola.find({ _id: { $in: candidatos.map((d) => d.correo_id).filter(Boolean) }, estado: 'ENVIADO' }).select('_id').session(session).lean()).map((c) => String(c._id)));
    candidatos = candidatos.filter((d) => d.correo_id && enviados.has(String(d.correo_id)));
  }
  const correos = candidatos.map((d) => ({ _id: new Types.ObjectId(), tipo, referencia_id: d._id as Types.ObjectId, para: d.email }));
  for (const [i, d] of candidatos.entries()) {
    d.correo_id = (correos[i] as { _id: Types.ObjectId })._id;
    await d.save({ session });
  }
  await encolarCorreos(correos, session);
  return correos.length;
}

export async function actualizarCitacion(id: string, cambios: CambiosCitacion, usuario: UserDocument, ip?: string) {
  const citacion = await cargarVisible(id, usuario);
  if (citacion.estado !== 'PROGRAMADA') throw new ApiError(409, 'Solo se puede editar una citación programada.');

  const nuevaFecha = cambios.fecha_hora ? new Date(cambios.fecha_hora) : citacion.fecha_hora;
  const nuevoLugar = cambios.lugar ?? citacion.lugar;
  const reprogramada = nuevaFecha.getTime() !== citacion.fecha_hora.getTime() || nuevoLugar !== citacion.lugar;
  if (reprogramada && !esFechaFutura(nuevaFecha, new Date())) throw new ApiError(400, 'La nueva fecha y hora deben ser posteriores a este momento.');

  citacion.motivo = cambios.motivo ?? citacion.motivo;
  citacion.titulo = cambios.titulo ?? citacion.titulo;
  citacion.descripcion = cambios.descripcion ?? citacion.descripcion;
  citacion.fecha_hora = nuevaFecha;
  citacion.lugar = nuevoLugar;

  let destinatarios: CitacionDestinatarioDocument[] = [];
  await runTransaction(async (session) => {
    if (reprogramada) citacion.version += 1;
    await citacion.save({ session });
    if (!reprogramada) return;
    // Cambió cuándo o dónde: lo confirmado antes ya no vale y hay que volver a avisar.
    destinatarios = await CitacionDestinatario.find({ citacion_id: citacion._id }).session(session);
    await CitacionDestinatario.updateMany({ citacion_id: citacion._id }, { $set: { respuesta: 'PENDIENTE', respondida_en: null, canal_respuesta: null, version_respondida: null } }, { session });
    await encolarParaDestinatarios(destinatarios, 'CITACION_ACTUALIZADA', session);
  });

  if (reprogramada) {
    despertarCola();
    await avisarCitacion({ _id: citacion._id, titulo: citacion.titulo, fechaLegible: cuando(nuevaFecha) }, 'CITACION_REPROGRAMADA', destinatarios);
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_ACTUALIZADA', entidad: 'Citacion', entidad_id: citacion._id, detalle: reprogramada ? 'Cambió la fecha o el lugar; se pidió confirmar de nuevo.' : 'Cambió el título, el motivo o la descripción.', ip });
  return detalleCitacion(id, usuario);
}

export async function cancelarCitacion(id: string, motivo: string, usuario: UserDocument, ip?: string) {
  const citacion = await cargarVisible(id, usuario);
  if (citacion.estado !== 'PROGRAMADA') throw new ApiError(409, 'Solo se puede cancelar una citación programada.');

  let destinatarios: CitacionDestinatarioDocument[] = [];
  await runTransaction(async (session) => {
    citacion.estado = 'CANCELADA';
    citacion.cancelacion = { motivo, por: usuario._id as Types.ObjectId, fecha: new Date() };
    await citacion.save({ session });
    destinatarios = await CitacionDestinatario.find({ citacion_id: citacion._id }).session(session);
    // Solo se avisa por correo a quien ya recibió la invitación: a los demás no les llegó nada que cancelar.
    await encolarParaDestinatarios(destinatarios, 'CITACION_CANCELADA', session, true);
  });

  despertarCola();
  await avisarCitacion({ _id: citacion._id, titulo: citacion.titulo, fechaLegible: cuando(citacion.fecha_hora) }, 'CITACION_CANCELADA', destinatarios);
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_CANCELADA', entidad: 'Citacion', entidad_id: citacion._id, detalle: `${destinatarios.length} acudiente(s)`, ip });
  return detalleCitacion(id, usuario);
}

export async function marcarRealizada(id: string, usuario: UserDocument, ip?: string) {
  const citacion = await cargarVisible(id, usuario);
  if (citacion.estado !== 'PROGRAMADA') throw new ApiError(409, 'Solo una citación programada se marca como realizada.');
  if (citacion.fecha_hora.getTime() > Date.now()) throw new ApiError(409, 'La reunión aún no ha llegado: si no se hará, cancélala.');
  citacion.estado = 'REALIZADA';
  await citacion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_REALIZADA', entidad: 'Citacion', entidad_id: citacion._id, ip });
  return detalleCitacion(id, usuario);
}

/** Vuelve a encolar el correo de un acudiente (falló, o el servidor aún no tenía correo configurado cuando se convocó). */
export async function reenviarCorreo(id: string, destinatarioId: string, usuario: UserDocument, ip?: string) {
  const citacion = await cargarVisible(id, usuario);
  if (citacion.estado !== 'PROGRAMADA') throw new ApiError(409, 'Solo se reenvía el correo de una citación programada.');
  if (!correoConfigurado()) throw new ApiError(409, motivoCorreoNoConfigurado() ?? 'El correo no está configurado.');
  if (!Types.ObjectId.isValid(destinatarioId)) throw noEncontrada();
  const destinatario = await CitacionDestinatario.findOne({ _id: destinatarioId, citacion_id: citacion._id });
  if (!destinatario) throw noEncontrada();
  if (!destinatario.email) throw new ApiError(409, 'Este acudiente no tiene un correo registrado: agrégalo en el expediente del estudiante.');

  await runTransaction(async (session) => {
    await encolarParaDestinatarios([destinatario], citacion.version > 1 ? 'CITACION_ACTUALIZADA' : 'CITACION_NUEVA', session);
  });
  despertarCola();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_CORREO_REENVIADO', entidad: 'Citacion', entidad_id: citacion._id, ip });
  return detalleCitacion(id, usuario);
}
