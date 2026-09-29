import { Types } from 'mongoose';
import { Jornada, TipoDocumento } from '../constants/enums';
import { DOCUMENTOS_REQUERIDOS_POR_NIVEL } from '../constants/matriculaChecklist';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest, { AdmissionRequestDocument } from '../models/admissionRequest.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import StudentProfile from '../models/studentProfile.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { generarPasswordTemporal } from '../utils/generarPasswordTemporal';
import { runTransaction } from '../utils/runTransaction';

const SOLICITUDES_ABIERTAS = ['PENDIENTE', 'EN_REVISION'] as const;

export interface CrearSolicitudInput {
  nombre_aspirante: string;
  apellido_aspirante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string | Date;
  grado_deseado_id: string;
  sede_deseada_id?: string;
  jornada_deseada?: Jornada;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones?: string;
}

/** Solicitud publica (M04): sin autenticar, no crea cuentas ni consume cupos todavia. */
export async function crearSolicitud(input: CrearSolicitudInput): Promise<AdmissionRequestDocument> {
  const grado = await Grade.findOne({ _id: input.grado_deseado_id, estado: 'activo' });
  if (!grado) throw new ApiError(400, 'El grado seleccionado no existe o no esta activo.');

  const yaTieneAbierta = await AdmissionRequest.findOne({
    numero_documento: input.numero_documento,
    estado: { $in: SOLICITUDES_ABIERTAS },
  });
  if (yaTieneAbierta) {
    throw new ApiError(409, 'Ya existe una solicitud en trámite para este documento.');
  }

  return AdmissionRequest.create({ ...input, estado: 'PENDIENTE' });
}

/** Consulta publica de estado (M04): exige documento + fecha de nacimiento para evitar enumeracion trivial. */
export async function consultarEstado(
  numeroDocumento: string,
  fechaNacimiento: string
): Promise<{ estado: string; fecha_solicitud: Date; motivo_rechazo: string | null } | null> {
  const solicitud = await AdmissionRequest.findOne({
    numero_documento: numeroDocumento,
    fecha_nacimiento: new Date(fechaNacimiento),
  }).sort({ createdAt: -1 });

  if (!solicitud) return null;
  return { estado: solicitud.estado, fecha_solicitud: solicitud.createdAt, motivo_rechazo: solicitud.motivo_rechazo };
}

export interface ListarSolicitudesFilter {
  estado?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarSolicitudes(filter: ListarSolicitudesFilter) {
  const query: Record<string, unknown> = {};
  if (filter.estado) query.estado = filter.estado;
  if (filter.search) {
    const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ nombre_aspirante: regex }, { apellido_aspirante: regex }, { numero_documento: regex }];
  }

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

  const [data, total] = await Promise.all([
    AdmissionRequest.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('grado_deseado_id', 'nombre nivel numero')
      .populate('sede_deseada_id', 'nombre'),
    AdmissionRequest.countDocuments(query),
  ]);

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function obtenerSolicitud(id: string): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id)
    .populate('grado_deseado_id', 'nombre nivel numero')
    .populate('sede_deseada_id', 'nombre');
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  return solicitud;
}

export interface AprobarSolicitudInput {
  group_id: string;
  academic_year_id: string;
}

/**
 * Aprueba la solicitud: recien aqui se crea la cuenta de estudiante (con
 * contraseña temporal) y la matricula en estado PREINSCRITO. Reserva el cupo
 * de forma atomica igual que enrollment.service.ts (no se reutiliza esa
 * funcion porque alli el estado queda fijo en MATRICULADO). NO asigna folio:
 * eso ocurre al formalizar la matricula (enrollment.service#updateEnrollmentStatus),
 * para que un aspirante que desiste no deje huecos en el Libro de Matricula.
 */
export async function aprobarSolicitud(
  id: string,
  { group_id, academic_year_id }: AprobarSolicitudInput,
  revisorId: string | Types.ObjectId
): Promise<AdmissionRequestDocument> {
  return runTransaction(async (session) => {
    const solicitud = await AdmissionRequest.findById(id).session(session);
    if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
    if (solicitud.estado === 'APROBADA') throw new ApiError(400, 'Esta solicitud ya fue aprobada.');
    if (solicitud.estado === 'RECHAZADA') throw new ApiError(400, 'Esta solicitud ya fue rechazada.');

    const academicYear = await AcademicYear.findById(academic_year_id).session(session);
    if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

    const updatedGroup = await Group.findOneAndUpdate(
      { _id: group_id, academic_year_id, $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] } },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );
    if (!updatedGroup) {
      throw new ApiError(409, 'Sin cupos disponibles en el grupo seleccionado.');
    }

    const grade = await Grade.findById(updatedGroup.grade_id).session(session);
    if (!grade) throw new ApiError(404, 'Grado no encontrado.');

    const student = new User({
      nombre: solicitud.nombre_aspirante,
      apellido: solicitud.apellido_aspirante,
      tipo_documento: solicitud.tipo_documento,
      numero_documento: solicitud.numero_documento,
      email: solicitud.acudiente_email,
      rol: ROLES.ESTUDIANTE,
      debe_cambiar_password: true,
    });
    student.password = generarPasswordTemporal();
    await student.save({ session });

    await StudentProfile.create(
      [{ user_id: student._id, fecha_nacimiento: solicitud.fecha_nacimiento, estado: 'ACTIVO' }],
      { session }
    );

    const checklist = (DOCUMENTOS_REQUERIDOS_POR_NIVEL[grade.nivel] ?? []).map((tipo_documento) => ({
      tipo_documento,
      estado: 'PENDIENTE' as const,
      archivo_path: null,
      comentario: null,
      fecha_carga: null,
      revisado_por: null,
    }));

    const [enrollment] = await Enrollment.create(
      [
        {
          student_id: student._id,
          group_id,
          academic_year_id,
          tipo_ingreso: 'NUEVO',
          estado: 'PREINSCRITO',
          fecha_matricula: new Date(),
          checklist,
        },
      ],
      { session }
    );
    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matricula.');

    solicitud.estado = 'APROBADA';
    solicitud.revisado_por = new Types.ObjectId(revisorId);
    solicitud.fecha_revision = new Date();
    solicitud.student_user_id = student._id;
    solicitud.enrollment_id = enrollment._id;
    await solicitud.save({ session });

    return solicitud;
  });
}

export async function rechazarSolicitud(
  id: string,
  motivo: string,
  revisorId: string | Types.ObjectId
): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  if (solicitud.estado === 'APROBADA') throw new ApiError(400, 'Esta solicitud ya fue aprobada.');

  solicitud.estado = 'RECHAZADA';
  solicitud.motivo_rechazo = motivo;
  solicitud.revisado_por = new Types.ObjectId(revisorId);
  solicitud.fecha_revision = new Date();
  await solicitud.save();

  return solicitud;
}
