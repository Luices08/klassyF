import { Types } from 'mongoose';
import { MAX_CARACTERES_COMENTARIO } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import ActivitySubmission from '../models/activitySubmission.model';
import ComentarioActividad from '../models/comentarioActividad.model';
import Enrollment from '../models/enrollment.model';
import PeriodLock from '../models/periodLock.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { AnalisisActividad, analizarEntregas } from '../utils/entregasActividad';
import { exigirAccesoALaActividad } from './actividadPermisos.service';
import { listarEntregas } from './actividadEntrega.service';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { exigirPeriodoAbierto } from './activity.service';
import { registrarEvento } from './audit.service';

// --- Acceso especial por estudiante ---

export interface OtorgarAccesoInput {
  student_id: string;
  fecha_limite: string | Date;
  motivo: string;
}

/**
 * El docente titular le da a UN estudiante con una excusa válida un plazo personal para entregar pasada la fecha de la
 * actividad. Esa entrega no cuenta como tardía y se puede dar aunque la actividad no admita entregas tardías o esté cerrada.
 * No abre un periodo cerrado ni cambia una nota ya puesta, y el motivo queda guardado.
 */
export async function otorgarAccesoEspecial(activityId: string, input: OtorgarAccesoInput, docente: UserDocument, ip?: string | null) {
  const { actividad, asignacion, esTitular } = await exigirAccesoALaActividad(activityId, docente);
  if (!esTitular) throw new ApiError(403, 'Solo el docente titular puede dar un acceso especial.');
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  exigirPeriodoAbierto(anio, actividad.periodo_numero);
  if (await PeriodLock.exists({ academic_year_id: anio._id, group_id: asignacion.group_id, periodo_numero: actividad.periodo_numero, estado: 'CERRADO' })) {
    throw new ApiError(409, `El periodo ${actividad.periodo_numero} está cerrado para este grupo.`);
  }
  if (!(actividad.requiere_entrega ?? true)) throw new ApiError(409, 'Esta actividad no recibe entregas digitales: no hay nada que extender.');

  const motivo = input.motivo.trim();
  if (motivo.length < 5) throw new ApiError(400, 'Cuenta brevemente el motivo (al menos 5 caracteres).');
  const limite = new Date(input.fecha_limite);
  if (limite <= new Date()) throw new ApiError(400, 'El plazo personal debe ser una fecha futura.');
  if (limite <= actividad.fecha_entrega) throw new ApiError(400, 'El plazo personal debe ser posterior a la fecha límite de la actividad.');

  const matriculado = await Enrollment.exists({ student_id: input.student_id, group_id: asignacion.group_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  if (!matriculado) throw new ApiError(400, 'El estudiante no está matriculado en el grupo de esta actividad.');

  const estudiante = await User.findById(input.student_id).select('nombre apellido');
  const entrega = await ActivitySubmission.findOne({ activity_id: actividad._id, student_id: input.student_id }).select('calificacion_numerica').lean();
  if (typeof entrega?.calificacion_numerica === 'number') {
    throw new ApiError(409, 'El estudiante ya tiene nota en esta actividad: un plazo adicional no cambiaría nada.');
  }

  const existente = actividad.accesos_especiales.find((a) => String(a.student_id) === input.student_id);
  if (existente) {
    existente.fecha_limite = limite;
    existente.motivo = motivo;
    existente.otorgado_por = docente._id;
    existente.fecha = new Date();
  } else {
    actividad.accesos_especiales.push({ student_id: new Types.ObjectId(input.student_id), fecha_limite: limite, motivo, otorgado_por: docente._id, fecha: new Date() });
  }
  await actividad.save();

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ACCESO_ESPECIAL_OTORGADO',
    entidad: 'Activity',
    entidad_id: actividad._id,
    // El motivo es información personal del estudiante: queda en la actividad, no en la bitácora.
    detalle: `Acceso especial a ${estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : input.student_id} hasta ${limite.toISOString()}.`,
    ip,
  });
  return { student_id: input.student_id, fecha_limite: limite, motivo };
}

export async function revocarAccesoEspecial(activityId: string, estudianteId: string, docente: UserDocument, ip?: string | null): Promise<void> {
  const { actividad, asignacion, esTitular } = await exigirAccesoALaActividad(activityId, docente);
  if (!esTitular) throw new ApiError(403, 'Solo el docente titular puede quitar un acceso especial.');
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  if (!actividad.accesos_especiales.some((a) => String(a.student_id) === estudianteId)) throw new ApiError(404, 'Ese estudiante no tiene un acceso especial en esta actividad.');

  actividad.set(
    'accesos_especiales',
    actividad.accesos_especiales.filter((a) => String(a.student_id) !== estudianteId)
  );
  await actividad.save();
  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ACCESO_ESPECIAL_REVOCADO',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: `Estudiante ${estudianteId}.`,
    ip,
  });
}

// --- Comentarios públicos ---

interface AutorPoblado {
  _id: Types.ObjectId;
  nombre: string;
  apellido: string;
}

function vistaComentario(c: { _id: Types.ObjectId; autor_id: AutorPoblado | Types.ObjectId | null; autor_rol: string; texto: string; createdAt: Date }, usuario: UserDocument, esTitular: boolean, gestion: boolean) {
  const autor = c.autor_id && 'nombre' in c.autor_id ? c.autor_id : null;
  const esAutor = String(autor?._id ?? c.autor_id) === String(usuario._id);
  return {
    _id: String(c._id),
    autor: autor ? { nombre: autor.nombre, apellido: autor.apellido } : null,
    autor_rol: c.autor_rol,
    texto: c.texto,
    fecha: c.createdAt,
    es_mio: esAutor,
    puede_eliminar: esAutor || esTitular || gestion,
  };
}

/** Los comentarios de una actividad los ve quien ve la actividad: son una conversación abierta entre el docente y su grupo. */
export async function listarComentarios(activityId: string, usuario: UserDocument) {
  const { actividad, esTitular } = await exigirAccesoALaActividad(activityId, usuario);
  const gestion = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  const comentarios = await ComentarioActividad.find({ activity_id: actividad._id })
    .sort({ createdAt: 1 })
    .limit(300)
    .populate<{ autor_id: AutorPoblado | null }>('autor_id', 'nombre apellido')
    .lean();
  return comentarios.map((c) => vistaComentario(c, usuario, esTitular, gestion));
}

export async function crearComentario(activityId: string, texto: string, usuario: UserDocument) {
  const { actividad, asignacion, esTitular } = await exigirAccesoALaActividad(activityId, usuario);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const limpio = texto.trim();
  if (!limpio) throw new ApiError(400, 'Escribe tu comentario.');
  if (limpio.length > MAX_CARACTERES_COMENTARIO) throw new ApiError(400, `El comentario admite hasta ${MAX_CARACTERES_COMENTARIO} caracteres.`);

  const creado = await ComentarioActividad.create({ activity_id: actividad._id, autor_id: usuario._id, autor_rol: usuario.rol, texto: limpio });
  const gestion = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  return vistaComentario(
    { _id: creado._id, autor_id: { _id: usuario._id, nombre: usuario.nombre, apellido: usuario.apellido }, autor_rol: creado.autor_rol, texto: creado.texto, createdAt: creado.createdAt },
    usuario,
    esTitular,
    gestion
  );
}

export async function eliminarComentario(activityId: string, comentarioId: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const { actividad, asignacion, esTitular } = await exigirAccesoALaActividad(activityId, usuario);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const comentario = await ComentarioActividad.findOne({ _id: comentarioId, activity_id: actividad._id });
  if (!comentario) throw new ApiError(404, 'Comentario no encontrado.');
  const esAutor = String(comentario.autor_id) === String(usuario._id);
  const gestion = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  if (!esAutor && !esTitular && !gestion) throw new ApiError(403, 'Solo puedes eliminar tus propios comentarios.');

  await comentario.deleteOne();
  // Moderar el comentario de otra persona queda en la bitácora (sin su texto).
  if (!esAutor) {
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'ACTIVIDAD_COMENTARIO_ELIMINADO',
      entidad: 'Activity',
      entidad_id: actividad._id,
      detalle: `Comentario de ${String(comentario.autor_id)}.`,
      ip,
    });
  }
}

// --- Análisis estadístico ---

/** Cómo va la actividad: entregas, calificaciones y distribución por nivel de la escala del colegio. Solo para quien gestiona. */
export async function analisisDeActividad(activityId: string, usuario: UserDocument): Promise<AnalisisActividad> {
  const { actividad, asignacion } = await exigirAccesoALaActividad(activityId, usuario);
  if (usuario.rol === ROLES.ESTUDIANTE) throw new ApiError(403, 'No tienes acceso a este análisis.');

  const [filas, anio] = await Promise.all([listarEntregas(String(actividad._id), usuario), AcademicYear.findById(asignacion.academic_year_id).select('escala_evaluacion')]);
  return analizarEntregas(
    filas.map((f) => ({
      entrego: (f.entrega?.intentos.length ?? 0) > 0,
      estado: f.estado,
      nota: f.entrega?.calificacion_numerica ?? null,
      con_retraso: f.entrega?.intentos.some((i) => i.con_retraso) ?? false,
      intentos: f.entrega?.intentos.length ?? 0,
    })),
    anio?.escala_evaluacion ?? null
  );
}
