import { Types } from 'mongoose';
import { CanalRespuesta, NOMBRES_MOTIVO_CITACION, RespuestaAsistencia } from '../constants/citaciones';
import Citacion, { CitacionDocument } from '../models/citacion.model';
import CitacionDestinatario, { CitacionDestinatarioDocument } from '../models/citacionDestinatario.model';
import Institution from '../models/institution.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { descripcionViajaPorCorreo, evaluarRespuesta } from '../utils/citaciones';
import { nombreDeRolParaCorreo } from '../utils/correoCitacion';
import { registrarEvento } from './audit.service';
import { avisarCitacionRespondida } from './notificacionesEventos.service';
import { exigirAcudienteDe } from './portalAcudiente.service';

/**
 * Cómo responde la familia a una citación: desde el botón del correo (sin iniciar sesión, con el token del enlace) o desde el portal del
 * acudiente (M27). Las dos entradas pasan por `registrarRespuesta`, así que las reglas son las mismas.
 */

const noEncontrada = () => new ApiError(404, 'La citación no existe o el enlace no es válido.');

async function registrarRespuesta(
  destinatario: CitacionDestinatarioDocument,
  citacion: CitacionDocument,
  respuesta: Exclude<RespuestaAsistencia, 'PENDIENTE'>,
  canal: CanalRespuesta,
  usuarioId: Types.ObjectId | null
): Promise<void> {
  const estado = evaluarRespuesta(citacion, new Date());
  if (!estado.puede) throw new ApiError(409, estado.motivo ?? 'La citación ya no admite respuestas.');

  const cambio = destinatario.respuesta !== respuesta;
  destinatario.respuesta = respuesta;
  destinatario.respondida_en = new Date();
  destinatario.canal_respuesta = canal;
  destinatario.version_respondida = citacion.version;
  await destinatario.save();

  if (cambio) {
    await registrarEvento({ usuario_id: usuarioId, accion: 'CITACION_RESPUESTA', entidad: 'Citacion', entidad_id: citacion._id, detalle: `${respuesta} por ${canal}` });
    await avisarCitacionRespondida(citacion);
  }
}

// --- Enlace del correo (público) ---

async function cargarPorToken(token: string): Promise<{ destinatario: CitacionDestinatarioDocument; citacion: CitacionDocument }> {
  // El token tiene forma fija: cualquier otra cosa ni se consulta.
  if (!/^[0-9a-f]{32}$/.test(token)) throw noEncontrada();
  const destinatario = await CitacionDestinatario.findOne({ token });
  const citacion = destinatario ? await Citacion.findById(destinatario.citacion_id) : null;
  if (!destinatario || !citacion) throw noEncontrada();
  return { destinatario, citacion };
}

async function vistaPublica(destinatario: CitacionDestinatarioDocument, citacion: CitacionDocument) {
  const [estudiante, convocante, institucion] = await Promise.all([
    User.findById(destinatario.student_id).select('nombre').lean(),
    User.findById(citacion.convocante_id).select('nombre apellido').lean(),
    Institution.findOne().select('nombre').lean(),
  ]);
  const estado = evaluarRespuesta(citacion, new Date());
  return {
    institucion: institucion?.nombre ?? '',
    titulo: citacion.titulo,
    motivo: NOMBRES_MOTIVO_CITACION[citacion.motivo],
    // La descripción de una citación particular puede hablar de un menor: solo se ve con sesión (portal), no con el enlace del correo.
    descripcion: descripcionViajaPorCorreo(citacion.tipo) ? citacion.descripcion : '',
    fecha_hora: citacion.fecha_hora,
    lugar: citacion.lugar,
    convocante: convocante ? `${convocante.nombre} ${convocante.apellido}` : '',
    convocante_cargo: nombreDeRolParaCorreo(citacion.convocante_rol),
    estudiante: estudiante?.nombre ?? '',
    estado: citacion.estado,
    respuesta: destinatario.respuesta,
    puede_responder: estado.puede,
    motivo_no_responder: estado.motivo,
  };
}

export async function consultarPorToken(token: string) {
  const { destinatario, citacion } = await cargarPorToken(token);
  return vistaPublica(destinatario, citacion);
}

export async function responderPorToken(token: string, respuesta: Exclude<RespuestaAsistencia, 'PENDIENTE'>) {
  const { destinatario, citacion } = await cargarPorToken(token);
  await registrarRespuesta(destinatario, citacion, respuesta, 'CORREO', null);
  return vistaPublica(destinatario, citacion);
}

// --- Portal del acudiente (M27) ---

export async function citacionesDeHijo(usuario: UserDocument, studentId: string) {
  const { guardian } = await exigirAcudienteDe(usuario, studentId);
  const destinatarios = await CitacionDestinatario.find({ guardian_id: guardian._id, student_id: studentId }).lean();
  const citaciones = await Citacion.find({ _id: { $in: destinatarios.map((d) => d.citacion_id) } }).sort({ fecha_hora: -1 }).limit(50).lean();
  const convocantes = new Map((await User.find({ _id: { $in: citaciones.map((c) => c.convocante_id) } }).select('nombre apellido').lean()).map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  const propia = new Map(destinatarios.map((d) => [String(d.citacion_id), d]));
  const ahora = new Date();

  return citaciones.map((c) => {
    const d = propia.get(String(c._id));
    const estado = evaluarRespuesta(c, ahora);
    return {
      destinatario_id: String(d?._id),
      titulo: c.titulo,
      motivo: NOMBRES_MOTIVO_CITACION[c.motivo],
      // Con sesión sí se ve la descripción completa: la familia está autenticada y es la destinataria.
      descripcion: c.descripcion,
      fecha_hora: c.fecha_hora,
      lugar: c.lugar,
      convocante: convocantes.get(String(c.convocante_id)) ?? '',
      convocante_cargo: nombreDeRolParaCorreo(c.convocante_rol),
      estado: c.estado,
      motivo_cancelacion: c.cancelacion?.motivo ?? null,
      respuesta: d?.respuesta ?? 'PENDIENTE',
      puede_responder: estado.puede,
      motivo_no_responder: estado.motivo,
    };
  });
}

export async function responderDesdePortal(usuario: UserDocument, studentId: string, destinatarioId: string, respuesta: Exclude<RespuestaAsistencia, 'PENDIENTE'>) {
  const { guardian } = await exigirAcudienteDe(usuario, studentId);
  const destinatario = Types.ObjectId.isValid(destinatarioId) ? await CitacionDestinatario.findOne({ _id: destinatarioId, guardian_id: guardian._id, student_id: studentId }) : null;
  const citacion = destinatario ? await Citacion.findById(destinatario.citacion_id) : null;
  if (!destinatario || !citacion) throw new ApiError(404, 'Citación no encontrada.');
  await registrarRespuesta(destinatario, citacion, respuesta, 'PORTAL', usuario._id as Types.ObjectId);
  return citacionesDeHijo(usuario, studentId);
}
