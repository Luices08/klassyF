import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS, Rol } from '../constants/enums';
import { MAX_SOLICITUDES_LISTADAS } from '../constants/recuperacionClave';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import SolicitudRecuperacionClave, { SolicitudRecuperacionClaveDocument } from '../models/solicitudRecuperacionClave.model';
import StudentGuardian from '../models/studentGuardian.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { generarPasswordTemporal } from '../utils/generarPasswordTemporal';
import { puedeAtenderSolicitudClave, rolesQueAtiendenA } from '../utils/permisosRecuperacionClave';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { avisarSolicitudClave } from './notificacionesEventos.service';

const NO_EXISTE = 'La solicitud no existe o no está a tu alcance.';

/**
 * Sedes desde las que se atiende la solicitud de esta cuenta: las suyas si es personal, la de la matrícula más reciente si es estudiante y
 * las de sus hijos si es acudiente. Una cuenta sin ninguna queda para coordinación y ADMIN.
 */
async function sedesDeAtencion(user: Pick<UserDocument, '_id' | 'roles' | 'sedes_ids'>): Promise<Types.ObjectId[]> {
  const estudiantes: Types.ObjectId[] = [];
  if (user.roles.includes('ESTUDIANTE')) estudiantes.push(user._id);
  if (user.roles.includes('ACUDIENTE')) {
    const acudientes = await Guardian.find({ user_id: user._id }).select('_id').lean();
    const vinculos = await StudentGuardian.find({ guardian_id: { $in: acudientes.map((a) => a._id) } }).select('student_id').lean();
    estudiantes.push(...vinculos.map((v) => v.student_id));
  }

  const sedes = new Map<string, Types.ObjectId>(user.sedes_ids.map((sede) => [String(sede), sede]));
  if (estudiantes.length > 0) {
    const matriculas = await Enrollment.find({ student_id: { $in: estudiantes }, estado: { $ne: 'ANULADO' } })
      .sort({ createdAt: -1 })
      .select('student_id group_id')
      .lean();
    const grupoPorEstudiante = new Map<string, Types.ObjectId>();
    for (const m of matriculas) if (!grupoPorEstudiante.has(String(m.student_id))) grupoPorEstudiante.set(String(m.student_id), m.group_id);
    const grupos = await Group.find({ _id: { $in: [...grupoPorEstudiante.values()] } }).select('sede_id').lean();
    for (const g of grupos) sedes.set(String(g.sede_id), g.sede_id);
  }
  return [...sedes.values()];
}

/** Pedir restablecer la clave. La respuesta nunca dice si el documento existe: quien llama no puede averiguar quién tiene cuenta. */
export async function solicitarRecuperacion(entrada: { numero_documento: string; nota?: string }, ip?: string | null): Promise<void> {
  const user = await User.findOne({ numero_documento: entrada.numero_documento });
  if (!user || user.estado !== 'activo') return;

  const yaPendiente = await SolicitudRecuperacionClave.exists({ user_id: user._id, estado: 'PENDIENTE' });
  if (yaPendiente) return;

  const sedes = await sedesDeAtencion(user);
  let solicitud: SolicitudRecuperacionClaveDocument;
  try {
    solicitud = await SolicitudRecuperacionClave.create({ user_id: user._id, nota: entrada.nota || null, sedes_ids: sedes });
  } catch (err) {
    // Dos pedidos a la vez: el índice único deja pasar uno solo.
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }

  await registrarEvento({ usuario_id: user._id, accion: 'PASSWORD_SOLICITADA', entidad: 'SolicitudRecuperacionClave', entidad_id: solicitud._id, ip });
  await avisarSolicitudClave(rolesQueAtiendenA(user.roles, sedes.length > 0), sedes);
}

export type VistaSolicitudClave = Awaited<ReturnType<typeof listarSolicitudes>>[number];

type Operador = Pick<UserDocument, '_id' | 'rol' | 'sedes_ids'>;
type UsuarioDeSolicitud = Pick<UserDocument, '_id' | 'nombre' | 'apellido' | 'numero_documento' | 'roles'>;

const CAMPOS_USUARIO = 'nombre apellido numero_documento roles';

/** «Grado Grupo» de la matrícula más reciente de cada estudiante, para que la secretaría reconozca a quién atiende. */
async function gruposDeEstudiantes(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const matriculas = await Enrollment.find({ student_id: { $in: ids }, estado: { $in: ESTADOS_MATRICULA_VIVOS } })
    .sort({ createdAt: -1 })
    .select('student_id group_id')
    .lean();
  const grupos = await Group.find({ _id: { $in: matriculas.map((m) => m.group_id) } }).select('grade_id nomenclatura').lean();
  const grados = await Grade.find({ _id: { $in: grupos.map((g) => g.grade_id) } }).select('nombre').lean();
  const nombreDeGrado = new Map(grados.map((g) => [String(g._id), g.nombre]));
  const nombreDeGrupo = new Map(grupos.map((g) => [String(g._id), `${nombreDeGrado.get(String(g.grade_id)) ?? ''} ${g.nomenclatura}`.trim()]));

  const porEstudiante = new Map<string, string>();
  for (const m of matriculas) if (!porEstudiante.has(String(m.student_id))) porEstudiante.set(String(m.student_id), nombreDeGrupo.get(String(m.group_id)) ?? '');
  return porEstudiante;
}

/** Lo que cada persona de la bandeja ve: solo solicitudes que su rol y sus sedes le permiten atender. */
export async function listarSolicitudes(operador: Operador, vista: 'PENDIENTES' | 'ATENDIDAS') {
  const filtro = vista === 'PENDIENTES' ? { estado: 'PENDIENTE' } : { estado: { $in: ['ATENDIDA', 'RECHAZADA'] } };
  const solicitudes = await SolicitudRecuperacionClave.find(filtro)
    .sort(vista === 'PENDIENTES' ? { createdAt: -1 } : { atendida_en: -1 })
    .limit(MAX_SOLICITUDES_LISTADAS)
    .populate<{ user_id: UsuarioDeSolicitud | null }>('user_id', CAMPOS_USUARIO)
    .populate<{ atendida_por: Pick<UserDocument, 'nombre' | 'apellido'> | null }>('atendida_por', 'nombre apellido')
    .lean();

  const visibles = solicitudes.filter(
    (s): s is typeof s & { user_id: UsuarioDeSolicitud } => s.user_id !== null && puedeAtenderSolicitudClave(operador, { roles: s.user_id.roles, sedes_ids: s.sedes_ids })
  );
  const grupos = await gruposDeEstudiantes(visibles.filter((s) => s.user_id.roles.includes('ESTUDIANTE')).map((s) => s.user_id._id));

  return visibles.map((s) => ({
    _id: s._id,
    estado: s.estado,
    nota: s.nota,
    createdAt: s.createdAt,
    atendida_en: s.atendida_en,
    atendida_por: s.atendida_por ? `${s.atendida_por.nombre} ${s.atendida_por.apellido}` : null,
    motivo_rechazo: s.motivo_rechazo,
    usuario: {
      _id: s.user_id._id,
      nombre: s.user_id.nombre,
      apellido: s.user_id.apellido,
      numero_documento: s.user_id.numero_documento,
      roles: s.user_id.roles as Rol[],
      grupo: grupos.get(String(s.user_id._id)) || null,
    },
  }));
}

/** Carga la solicitud solo si quien pregunta puede atenderla: «no existe» y «no es tuya» responden igual. */
async function cargarAtendible(id: string, operador: Operador) {
  const solicitud = await SolicitudRecuperacionClave.findById(id);
  const user = solicitud ? await User.findById(solicitud.user_id) : null;
  if (!solicitud || !user || !puedeAtenderSolicitudClave(operador, { roles: user.roles, sedes_ids: solicitud.sedes_ids })) throw new ApiError(404, NO_EXISTE);
  if (String(user._id) === String(operador._id)) throw new ApiError(400, 'Para cambiar tu propia contraseña, usa la opción en Mi cuenta.');
  if (solicitud.estado !== 'PENDIENTE') throw new ApiError(409, 'Esta solicitud ya fue atendida.');
  return { solicitud, user };
}

/**
 * Aprobar = restablecer la clave: se genera una temporal aleatoria que se muestra una sola vez a quien atiende, la cuenta queda obligada a
 * cambiarla al entrar, se levanta cualquier bloqueo y se cierran las sesiones abiertas. Reclamar la solicitud y cambiar la clave van en
 * la misma transacción: dos personas que aprueben a la vez no se pisan la clave.
 */
export async function aprobarSolicitud(id: string, operador: Operador, ip?: string | null): Promise<{ password_temporal: string }> {
  const { solicitud, user } = await cargarAtendible(id, operador);
  if (user.estado !== 'activo') throw new ApiError(409, 'La cuenta está inactiva: actívala en Usuarios antes de restablecer su clave.');

  const passwordTemporal = generarPasswordTemporal();
  await runTransaction(async (session) => {
    const reclamada = await SolicitudRecuperacionClave.findOneAndUpdate(
      { _id: solicitud._id, estado: 'PENDIENTE' },
      { $set: { estado: 'ATENDIDA', atendida_por: operador._id, atendida_en: new Date() } },
      { session }
    );
    if (!reclamada) throw new ApiError(409, 'Esta solicitud ya fue atendida.');

    const cuenta = await User.findById(user._id).session(session);
    if (!cuenta) throw new ApiError(404, NO_EXISTE);
    cuenta.password = passwordTemporal;
    cuenta.debe_cambiar_password = true;
    cuenta.intentos_fallidos = 0;
    cuenta.bloqueado_hasta = null;
    cuenta.version_sesion += 1;
    await cuenta.save({ session });
  });

  await registrarEvento({ usuario_id: operador._id, accion: 'PASSWORD_SOLICITUD_APROBADA', entidad: 'SolicitudRecuperacionClave', entidad_id: solicitud._id, ip });
  return { password_temporal: passwordTemporal };
}

/** Descartar una solicitud (p. ej. nadie reconoce a quien pide). No cambia nada en la cuenta; quien necesite la clave puede volver a pedirla. */
export async function rechazarSolicitud(id: string, motivo: string | undefined, operador: Operador, ip?: string | null): Promise<void> {
  const { solicitud } = await cargarAtendible(id, operador);
  const actualizada = await SolicitudRecuperacionClave.findOneAndUpdate(
    { _id: solicitud._id, estado: 'PENDIENTE' },
    { $set: { estado: 'RECHAZADA', atendida_por: operador._id, atendida_en: new Date(), motivo_rechazo: motivo || null } }
  );
  if (!actualizada) throw new ApiError(409, 'Esta solicitud ya fue atendida.');
  await registrarEvento({ usuario_id: operador._id, accion: 'PASSWORD_SOLICITUD_RECHAZADA', entidad: 'SolicitudRecuperacionClave', entidad_id: solicitud._id, ip });
}
