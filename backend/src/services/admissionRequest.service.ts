import { ClientSession, Types } from 'mongoose';
import { Jornada, TipoDocumento } from '../constants/enums';
import { DIAS_PLAZO_LEGALIZACION, DOCUMENTOS_REQUERIDOS_POR_NIVEL } from '../constants/matriculaChecklist';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest, { AdmissionRequestDocument } from '../models/admissionRequest.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { runTransaction } from '../utils/runTransaction';
import { buscarMatriculaDePreinscripcion, construirDetalle, PreinscripcionDetalle } from './preinscripcionPublica.service';
import { crearDesdeMatricula } from './solicitudApoyo.service';

// Incluye APROBADA para que un aspirante ya admitido no pueda radicar una segunda solicitud
// paralela (terminaria chocando con el numero_documento unico del User al aprobarla de nuevo).
const SOLICITUDES_QUE_BLOQUEAN_NUEVA = ['PENDIENTE', 'EN_REVISION', 'APROBADA'] as const;

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
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

/** Solicitud publica (M04): sin autenticar, no crea cuentas ni consume cupos todavia. */
export async function crearSolicitud(input: CrearSolicitudInput): Promise<AdmissionRequestDocument> {
  const grado = await Grade.findOne({ _id: input.grado_deseado_id, estado: ESTADO_ACTIVO });
  if (!grado) throw new ApiError(400, 'El grado seleccionado no existe o no esta activo.');

  const yaTieneAbierta = await AdmissionRequest.findOne({
    numero_documento: input.numero_documento,
    estado: { $in: SOLICITUDES_QUE_BLOQUEAN_NUEVA },
  });
  if (yaTieneAbierta) {
    throw new ApiError(
      409,
      yaTieneAbierta.estado === 'APROBADA'
        ? 'Este documento ya tiene una solicitud aprobada. Consulta el estado de tu preinscripción.'
        : 'Ya existe una solicitud en trámite para este documento.'
    );
  }

  return AdmissionRequest.create({ ...input, estado: 'PENDIENTE' });
}

export interface EstadoSolicitudPublico {
  estado: string;
  fecha_solicitud: Date;
  motivo_rechazo: string | null;
  /** Solo con la solicitud APROBADA: grado asignado, plazo, documentos y si aun puede subirlos. */
  preinscripcion: PreinscripcionDetalle | null;
}

/** Consulta publica de estado (M04): exige documento + fecha de nacimiento para evitar enumeracion trivial. */
export async function consultarEstado(
  numeroDocumento: string,
  fechaNacimiento: string
): Promise<EstadoSolicitudPublico | null> {
  const solicitud = await AdmissionRequest.findOne({
    numero_documento: numeroDocumento,
    fecha_nacimiento: new Date(fechaNacimiento),
  }).sort({ createdAt: -1 });

  if (!solicitud) return null;

  const matricula =
    solicitud.estado === 'APROBADA' ? await buscarMatriculaDePreinscripcion(numeroDocumento, fechaNacimiento) : null;
  return {
    estado: solicitud.estado,
    fecha_solicitud: solicitud.createdAt,
    motivo_rechazo: solicitud.motivo_rechazo,
    preinscripcion: matricula ? construirDetalle(matricula.enrollment) : null,
  };
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

// Fecha de calendario (medianoche UTC, como el resto de fechas del sistema) N dias despues de hoy en Colombia (UTC-5).
function plazoLegalizacionPorDefecto(): Date {
  const hoyColombia = Date.now() - 5 * 3_600_000;
  return new Date(new Date(hoyColombia + DIAS_PLAZO_LEGALIZACION * 86_400_000).toISOString().slice(0, 10));
}

/**
 * El correo del User de un estudiante nuevo es el de su acudiente (el aspirante normalmente no
 * tiene uno propio), pero User.email es unico — y es comun que un mismo acudiente tenga mas de
 * un hijo admitido. Si el correo ya esta en uso, se desambigua con un alias "+numero_documento"
 * (lo soportan todos los proveedores de correo usuales) que sigue entregando al mismo buzon.
 */
async function emailUnicoParaEstudiante(emailAcudiente: string, numeroDocumento: string, session: ClientSession): Promise<string> {
  const yaExiste = await User.exists({ email: emailAcudiente }).session(session);
  if (!yaExiste) return emailAcudiente;

  const [local, dominio] = emailAcudiente.split('@');
  return `${local}+${numeroDocumento}@${dominio}`;
}

export interface AprobarSolicitudInput {
  group_id: string;
  academic_year_id: string;
  /** Plazo para legalizar la matricula; por defecto DIAS_PLAZO_LEGALIZACION dias desde la aprobacion. */
  fecha_limite_legalizacion?: string | Date;
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
  { group_id, academic_year_id, fecha_limite_legalizacion }: AprobarSolicitudInput,
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
      { _id: group_id, academic_year_id, estado: 'ACTIVE', $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] } },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );
    if (!updatedGroup) {
      throw new ApiError(409, 'El grupo seleccionado no está activo o no tiene cupos disponibles.');
    }

    const grade = await Grade.findById(updatedGroup.grade_id).session(session);
    if (!grade) throw new ApiError(404, 'Grado no encontrado.');

    const student = new User({
      nombre: solicitud.nombre_aspirante,
      apellido: solicitud.apellido_aspirante,
      tipo_documento: solicitud.tipo_documento,
      numero_documento: solicitud.numero_documento,
      // El aspirante normalmente no tiene correo propio: se usa el del acudiente. Si ya
      // esta en uso (otro hijo del mismo acudiente ya admitido — caso comun, no un borde
      // raro), se desambigua con un alias "+numero_documento" que sigue llegando al mismo
      // buzon (email.unique en el modelo no distingue "es el mismo acudiente").
      email: await emailUnicoParaEstudiante(solicitud.acudiente_email, solicitud.numero_documento, session),
      rol: ROLES.ESTUDIANTE,
      debe_cambiar_password: true,
    });
    student.password = solicitud.numero_documento;
    await student.save({ session });

    await StudentProfile.create(
      [{ user_id: student._id, fecha_nacimiento: solicitud.fecha_nacimiento, estado: 'ACTIVO' }],
      { session }
    );

    // Guardar o vincular datos del acudiente suministrados en la preinscripción (M03)
    const docAcudiente = `TEL-${solicitud.acudiente_telefono.trim()}`;
    let guardian = await Guardian.findOne({
      $or: [
        { numero_documento: docAcudiente },
        { email: solicitud.acudiente_email.trim().toLowerCase() },
      ],
    }).session(session);

    if (!guardian) {
      guardian = new Guardian({
        tipo_documento: 'CC',
        numero_documento: docAcudiente,
        nombre: solicitud.acudiente_nombre.trim(),
        apellido: solicitud.acudiente_apellido.trim(),
        telefono_principal: solicitud.acudiente_telefono.trim(),
        email: solicitud.acudiente_email.trim().toLowerCase(),
        estado: 'activo',
      });
      await guardian.save({ session });
    }

    const vinculoExistente = await StudentGuardian.findOne({
      student_id: student._id,
      guardian_id: guardian._id,
    }).session(session);

    if (!vinculoExistente) {
      await StudentGuardian.create(
        [
          {
            student_id: student._id,
            guardian_id: guardian._id,
            parentesco: 'TUTOR',
            es_principal: true,
            autorizado_retiro: true,
          },
        ],
        { session }
      );
    }

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
          fecha_limite_legalizacion: fecha_limite_legalizacion
            ? new Date(fecha_limite_legalizacion)
            : plazoLegalizacionPorDefecto(),
          checklist,
        },
      ],
      { session }
    );
    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matricula.');

    // Cambio mínimo de M16: lo que la familia declaró pasa a orientación, en la misma transacción de la aprobación.
    if (solicitud.apoyo_declarado) {
      await crearDesdeMatricula(
        {
          student_id: student._id,
          academic_year_id,
          group_id,
          origen: 'PREINSCRIPCION',
          motivo_declarado: solicitud.apoyo_declarado.motivo_declarado,
          aporta_soporte: solicitud.apoyo_declarado.aporta_soporte,
          observacion: solicitud.apoyo_declarado.observacion,
          solicitada_por: new Types.ObjectId(revisorId),
        },
        session
      );
    }

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
