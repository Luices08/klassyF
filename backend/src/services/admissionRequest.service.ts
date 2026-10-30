import { ClientSession, Types } from 'mongoose';
import { EstadoDocumentoMatricula, EstadoMatricula, Jornada, Parentesco, TipoDocumento } from '../constants/enums';
import { generarChecklistDesdeCatalogo } from './requisitoDocumental.service';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest, { AdmissionRequestDocument, EstadoSolicitud } from '../models/admissionRequest.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { MENSAJE_NOMBRE_INCOMPLETO, resolverNombre } from '../utils/nombres';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { runTransaction } from '../utils/runTransaction';
import { avisarSolicitudAdmision } from './notificacionesEventos.service';
import { exigirOfertaDisponible } from './ofertaAdmision.service';
import { crearDesdeMatricula } from './solicitudApoyo.service';
import { registrarEvento } from './audit.service';
import { asegurarConfiguracion as asegurarFoliatura, asignarFolio } from './foliatura.service';
import { estudiantesSinPromocionResuelta } from './academicYear.service';
import { habilitarPortalDeAcudientesDe } from './guardian.service';

const SOLICITUDES_QUE_BLOQUEAN_NUEVA = ['PENDIENTE', 'ADMITIDO', 'MATRICULADO'] as const;

export interface CrearSolicitudInput {
  primer_nombre?: string;
  segundo_nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  nombre_aspirante?: string;
  apellido_aspirante?: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string | Date;
  grado_deseado_id: string;
  sede_deseada_id?: string;
  jornada_deseada?: Jornada;
  academic_year_id?: string;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_tipo_documento?: TipoDocumento;
  acudiente_numero_documento?: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones?: string;
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

export interface OrigenDeSolicitud {
  origen?: 'PUBLICA' | 'SECRETARIA';
  registrada_por?: Types.ObjectId | string | null;
}

/** Obtiene el año lectivo en curso o el más reciente para admisiones. */
export async function anioDeLaAdmision(): Promise<Types.ObjectId | null> {
  const enCurso = await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('_id');
  if (enCurso) return enCurso._id;
  const planificacion = await AcademicYear.findOne({ estado: 'PLANIFICACION' }).sort({ year: -1 }).select('_id');
  return planificacion?._id ?? null;
}

/**
 * Las solicitudes de un año posterior solo se aceptan cuando ya se sabe quién continúa: mientras el año anterior tenga estudiantes sin resultado final
 * de promoción (M19), cada cupo que se entrega a un aspirante nuevo se lo quita a un antiguo que todavía puede seguir.
 */
async function exigirPromocionResuelta(anioDestino: { _id: Types.ObjectId; year: number }): Promise<void> {
  const anterior = await AcademicYear.findOne({ year: { $lt: anioDestino.year } }).sort({ year: -1, createdAt: -1 });
  if (!anterior || anterior.estado === 'CERRADO') return;
  const sinResolver = await estudiantesSinPromocionResuelta(anterior);
  if (sinResolver > 0) {
    throw new ApiError(
      409,
      `Aún no se puede aceptar: ${sinResolver} estudiante(s) de ${anterior.year} no tienen resultado final de promoción. Cierra los grupos y resuelve las recuperaciones antes de admitir o matricular aspirantes de ${anioDestino.year}.`
    );
  }
}

/** Solicitud pública (M04): sin autenticar, no crea cuentas ni consume cupos todavía. */
export async function crearSolicitud(input: CrearSolicitudInput, origen: OrigenDeSolicitud = {}): Promise<AdmissionRequestDocument> {
  const nombre = resolverNombre({ ...input, nombre: input.nombre_aspirante, apellido: input.apellido_aspirante });
  if (!nombre) throw new ApiError(400, MENSAJE_NOMBRE_INCOMPLETO);

  const grado = await Grade.findOne({ _id: input.grado_deseado_id, estado: ESTADO_ACTIVO });
  if (!grado) throw new ApiError(400, 'El grado seleccionado no existe o no está activo.');

  let anioId: Types.ObjectId | null = null;
  if (input.academic_year_id) {
    const anioExiste = await AcademicYear.findById(input.academic_year_id);
    if (!anioExiste || anioExiste.estado === 'CERRADO') {
      throw new ApiError(400, 'El año lectivo seleccionado no existe o se encuentra cerrado.');
    }
    anioId = anioExiste._id;
  } else {
    anioId = await anioDeLaAdmision();
  }

  // Se comprueba contra la oferta del año al que apunta la solicitud, no contra la del año en curso.
  await exigirOfertaDisponible({ grado_id: String(grado._id), sede_id: input.sede_deseada_id ?? null, jornada: input.jornada_deseada ?? null }, anioId ? String(anioId) : undefined);

  const yaTieneAbierta = await AdmissionRequest.findOne({
    numero_documento: input.numero_documento,
    ...(anioId ? { academic_year_id: anioId } : {}),
    estado: { $in: SOLICITUDES_QUE_BLOQUEAN_NUEVA },
  });

  if (yaTieneAbierta) {
    if (yaTieneAbierta.estado === 'MATRICULADO') {
      throw new ApiError(409, 'Este documento ya cuenta con matrícula formalizada para este año escolar.');
    }
    if (yaTieneAbierta.estado === 'ADMITIDO') {
      throw new ApiError(409, 'Este aspirante ya ha sido admitido. Consulta el estado de tu solicitud para formalizar.');
    }
    throw new ApiError(409, 'Ya existe una solicitud en trámite para este documento en el año lectivo seleccionado.');
  }

  const solicitud = await AdmissionRequest.create({
    ...input,
    ...nombre.partes,
    nombre_aspirante: nombre.nombre,
    apellido_aspirante: nombre.apellido,
    estado: 'PENDIENTE',
    origen: origen.origen ?? 'PUBLICA',
    registrada_por: origen.registrada_por ?? null,
    academic_year_id: anioId,
  });

  if ((origen.origen ?? 'PUBLICA') === 'PUBLICA') await avisarSolicitudAdmision();
  return solicitud;
}

export interface RegistrarInscripcionInput extends CrearSolicitudInput {
  acudiente_tipo_documento: TipoDocumento;
  acudiente_numero_documento: string;
  acudiente_parentesco?: Parentesco;
}

/**
 * Inscripción en el mostrador (M04): secretaría o administración radican la misma solicitud que la familia radica por el sitio público.
 */
export async function registrarInscripcion(input: RegistrarInscripcionInput, usuario: { id: Types.ObjectId | string }): Promise<AdmissionRequestDocument> {
  if (await User.exists({ numero_documento: input.numero_documento })) {
    throw new ApiError(409, 'Ya hay una persona registrada con ese documento. Si es un estudiante del colegio, matricúlalo desde «Nueva matrícula»; no se inscribe de nuevo.');
  }
  const solicitud = await crearSolicitud(input, { origen: 'SECRETARIA', registrada_por: usuario.id });
  await registrarEvento({
    usuario_id: usuario.id,
    accion: 'INSCRIPCION_REGISTRADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Inscripción en el mostrador: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`,
  });
  return solicitud;
}

export interface EstadoSolicitudPublico {
  estado: EstadoSolicitud;
  fecha_solicitud: Date;
  motivo_rechazo: string | null;
  academic_year: {
    id: string;
    year: number;
    es_anio_siguiente: boolean;
  } | null;
  grado: { id: string; nombre: string } | null;
  matricula: {
    folio_matricula: string | null;
    numero_libro: number | null;
    numero_folio: number | null;
    estado: string;
    grupo_nombre: string | null;
  } | null;
  documentos: Array<{ tipo_documento: string; fecha_carga: Date; nombre_original?: string | null }>;
}

/** Consulta pública de estado (M04): exige documento + fecha de nacimiento para evitar enumeración trivial. */
export async function consultarEstado(
  numeroDocumento: string,
  fechaNacimiento: string
): Promise<EstadoSolicitudPublico | null> {
  const solicitud = await AdmissionRequest.findOne({
    numero_documento: numeroDocumento,
    fecha_nacimiento: new Date(fechaNacimiento),
  }).sort({ createdAt: -1 });

  if (!solicitud) return null;

  const [anio, anioActual, grado, enrollment] = await Promise.all([
    solicitud.academic_year_id ? AcademicYear.findById(solicitud.academic_year_id).select('year estado') : null,
    AcademicYear.findOne({ estado: 'EN_CURSO' }).select('year'),
    solicitud.grado_deseado_id ? Grade.findById(solicitud.grado_deseado_id).select('nombre') : null,
    solicitud.enrollment_id ? Enrollment.findById(solicitud.enrollment_id).populate<{ group_id: { nomenclatura: string } }>('group_id', 'nomenclatura') : null,
  ]);

  const esSiguiente = Boolean(anio && anioActual && anio.year > anioActual.year) || anio?.estado === 'PLANIFICACION';

  return {
    estado: solicitud.estado,
    fecha_solicitud: solicitud.createdAt,
    motivo_rechazo: solicitud.motivo_rechazo,
    academic_year: anio ? { id: String(anio._id), year: anio.year, es_anio_siguiente: esSiguiente } : null,
    grado: grado ? { id: String(grado._id), nombre: grado.nombre } : null,
    matricula: enrollment ? {
      folio_matricula: enrollment.folio_matricula ?? null,
      numero_libro: enrollment.numero_libro ?? null,
      numero_folio: enrollment.numero_folio ?? null,
      estado: enrollment.estado,
      grupo_nombre: enrollment.group_id?.nomenclatura ?? null,
    } : null,
    documentos: (solicitud.documentos || []).map((d) => ({
      tipo_documento: d.tipo_documento,
      nombre_original: d.nombre_original ?? null,
      fecha_carga: d.fecha_carga,
    })),
  };
}

export interface ListarSolicitudesFilter {
  estado?: string;
  academic_year_id?: string;
  grade_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarSolicitudes(filter: ListarSolicitudesFilter) {
  const query: Record<string, unknown> = {};
  if (filter.estado) query.estado = filter.estado;
  if (filter.academic_year_id) query.academic_year_id = new Types.ObjectId(filter.academic_year_id);
  if (filter.grade_id) query.grado_deseado_id = new Types.ObjectId(filter.grade_id);
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
      .populate('sede_deseada_id', 'nombre')
      .populate('academic_year_id', 'year estado'),
    AdmissionRequest.countDocuments(query),
  ]);

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function obtenerSolicitud(id: string): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id)
    .populate('grado_deseado_id', 'nombre nivel numero')
    .populate('sede_deseada_id', 'nombre')
    .populate('academic_year_id', 'year estado');
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  return solicitud;
}

async function emailUnicoParaEstudiante(emailAcudiente: string, numeroDocumento: string, session: ClientSession): Promise<string> {
  const yaExiste = await User.exists({ email: emailAcudiente }).session(session);
  if (!yaExiste) return emailAcudiente;
  const [local, dominio] = emailAcudiente.split('@');
  return `${local}+${numeroDocumento}@${dominio}`;
}

/** Cambia la solicitud del año lectivo siguiente a ADMITIDO (para formalizar en ventanilla en enero). */
export async function admitirSolicitud(id: string, revisorId: string | Types.ObjectId): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  if (solicitud.estado === 'MATRICULADO') throw new ApiError(400, 'Esta solicitud ya tiene matrícula formalizada.');
  if (solicitud.estado === 'RECHAZADA') throw new ApiError(400, 'Esta solicitud fue rechazada.');
  const anioSolicitud = solicitud.academic_year_id ? await AcademicYear.findById(solicitud.academic_year_id).select('year') : null;
  if (anioSolicitud) await exigirPromocionResuelta(anioSolicitud);

  solicitud.estado = 'ADMITIDO';
  solicitud.revisado_por = new Types.ObjectId(revisorId);
  solicitud.fecha_revision = new Date();
  await solicitud.save();

  await registrarEvento({
    usuario_id: revisorId,
    accion: 'ADMISION_ADMITIDA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Aspirante admitido para el año lectivo: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`,
  });

  return solicitud;
}

export interface AprobarYMatricularInput {
  group_id: string;
  academic_year_id: string;
  trae_todos: 'SI' | 'NO';
  fecha_limite_compromiso?: string | Date;
}

/**
 * Formalización directa de matrícula (M04):
 * Para solicitudes del año en curso o admitidas del año siguiente.
 * Asigna salón definitivo, genera Libro y Folio reglamentario, crea Enrollment en
 * MATRICULADO_DEFINITIVO (si trae todos los documentos) o MATRICULADO_CONDICIONAL (si adeuda documentos),
 * y marca la solicitud como MATRICULADO.
 */
export async function aprobarYMatricular(
  id: string,
  input: AprobarYMatricularInput,
  revisorId: string | Types.ObjectId
): Promise<AdmissionRequestDocument> {
  if (input.trae_todos === 'NO' && !input.fecha_limite_compromiso) {
    throw new ApiError(400, 'La fecha límite del acta de compromiso es obligatoria cuando el acudiente no trae todos los documentos.');
  }
  // La configuración de foliatura se crea antes de abrir la transacción (ver `asegurarConfiguracion`): dentro de ella, la primera matrícula falla.
  await asegurarFoliatura();
  const matriculada = await runTransaction(async (session) => {
    const solicitud = await AdmissionRequest.findById(id).session(session);
    if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
    if (solicitud.estado === 'MATRICULADO') throw new ApiError(400, 'Esta solicitud ya fue matriculada.');
    if (solicitud.estado === 'RECHAZADA') throw new ApiError(400, 'Esta solicitud fue rechazada.');

    const academicYear = await AcademicYear.findById(input.academic_year_id).session(session);
    if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');
    if (academicYear.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo seleccionado ya está cerrado.');
    await exigirPromocionResuelta(academicYear);

    const updatedGroup = await Group.findOneAndUpdate(
      { _id: input.group_id, academic_year_id: input.academic_year_id, estado: 'ACTIVE', $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] } },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );
    if (!updatedGroup) {
      throw new ApiError(409, 'El grupo seleccionado no está activo o no tiene cupos disponibles.');
    }

    const grade = await Grade.findById(updatedGroup.grade_id).session(session);
    if (!grade) throw new ApiError(404, 'Grado no encontrado.');

    // Crear o recuperar usuario de estudiante
    let student = await User.findOne({ numero_documento: solicitud.numero_documento }).session(session);
    if (!student) {
      student = new User({
        nombre: solicitud.nombre_aspirante,
        apellido: solicitud.apellido_aspirante,
        tipo_documento: solicitud.tipo_documento,
        numero_documento: solicitud.numero_documento,
        email: await emailUnicoParaEstudiante(solicitud.acudiente_email, solicitud.numero_documento, session),
        roles: [ROLES.ESTUDIANTE],
        debe_cambiar_password: true,
      });
      student.password = solicitud.numero_documento;
      await student.save({ session });

      await StudentProfile.create(
        [
          {
            user_id: student._id,
            primer_nombre: solicitud.primer_nombre,
            segundo_nombre: solicitud.segundo_nombre,
            primer_apellido: solicitud.primer_apellido,
            segundo_apellido: solicitud.segundo_apellido,
            fecha_nacimiento: solicitud.fecha_nacimiento,
            estado: 'ACTIVO',
          },
        ],
        { session }
      );
    }

    // Acudiente
    const documentoReal = solicitud.acudiente_numero_documento?.trim() || null;
    const docAcudiente = documentoReal ?? `TEL-${solicitud.acudiente_telefono.trim()}`;
    const parentescoAcudiente: Parentesco = solicitud.acudiente_parentesco ?? 'TUTOR_LEGAL';

    let guardian = await Guardian.findOne({
      $or: [
        ...(documentoReal ? [{ numero_documento: documentoReal }] : []),
        { numero_documento: `TEL-${solicitud.acudiente_telefono.trim()}` },
        { email: solicitud.acudiente_email.trim().toLowerCase() },
      ],
    }).session(session);

    if (!guardian) {
      guardian = new Guardian({
        tipo_documento: solicitud.acudiente_tipo_documento ?? 'CC',
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
            parentesco: parentescoAcudiente,
            es_principal: true,
            autorizado_retiro: true,
          },
        ],
        { session }
      );
    }

    const itemsGenerados = await generarChecklistDesdeCatalogo({
      nivel: grade.nivel,
      numeroGrado: grade.numero,
      tipoIngreso: 'NUEVO',
      parentescoAcudiente,
    });

    const recibidos = new Map(solicitud.documentos.map((d) => [d.tipo_documento, d]));
    const checklist = itemsGenerados.map((item) => {
      const recibido = recibidos.get(item.tipo_documento);
      return {
        tipo_documento: item.tipo_documento,
        nombre_personalizado: item.nombre_personalizado ?? null,
        indicacion: item.indicacion ?? null,
        categoria: item.categoria ?? null,
        obligatorio: item.obligatorio,
        estado: (recibido ? 'CARGADO' : input.trae_todos === 'SI' ? 'APROBADO' : 'PENDIENTE') as EstadoDocumentoMatricula,
        archivo_path: recibido?.archivo_path ?? null,
        comentario: null,
        fecha_carga: recibido?.fecha_carga ?? null,
        // Sin archivo y marcado como entregado: el original se vio en el mostrador («verificado en físico»).
        fecha_verificacion_fisica: !recibido && input.trae_todos === 'SI' ? new Date() : null,
        revisado_por: recibido || input.trae_todos === 'SI' ? new Types.ObjectId(revisorId) : null,
        cargado_por_tipo: recibido ? ('PERSONAL' as const) : null,
        cargado_por: recibido?.cargado_por ?? null,
      };
    });

    // Asignar Folio y Libro correlativo inmutable
    const { numero_libro, numero_folio, folio_matricula } = await asignarFolio(academicYear.year, session);

    const estadoMatricula: EstadoMatricula = input.trae_todos === 'SI' ? 'MATRICULADO_DEFINITIVO' : 'MATRICULADO_CONDICIONAL';

    const [enrollment] = await Enrollment.create(
      [
        {
          student_id: student._id,
          group_id: input.group_id,
          academic_year_id: input.academic_year_id,
          tipo_ingreso: 'NUEVO',
          estado: estadoMatricula,
          fecha_matricula: new Date(),
          numero_libro,
          numero_folio,
          folio_matricula,
          fecha_limite_compromiso: input.trae_todos === 'NO' && input.fecha_limite_compromiso ? new Date(input.fecha_limite_compromiso) : null,
          checklist,
        },
      ],
      { session }
    );

    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matrícula.');

    if (solicitud.apoyo_declarado) {
      await crearDesdeMatricula(
        {
          student_id: student._id,
          academic_year_id: input.academic_year_id,
          group_id: input.group_id,
          origen: 'PREINSCRIPCION',
          motivo_declarado: solicitud.apoyo_declarado.motivo_declarado,
          aporta_soporte: solicitud.apoyo_declarado.aporta_soporte,
          observacion: solicitud.apoyo_declarado.observacion,
          solicitada_por: new Types.ObjectId(revisorId),
        },
        session
      );
    }

    solicitud.estado = 'MATRICULADO';
    solicitud.revisado_por = new Types.ObjectId(revisorId);
    solicitud.fecha_revision = new Date();
    solicitud.student_user_id = student._id;
    solicitud.enrollment_id = enrollment._id;
    await solicitud.save({ session });

    await registrarEvento({
      usuario_id: revisorId,
      accion: 'ADMISION_MATRICULADA',
      entidad: 'AdmissionRequest',
      entidad_id: solicitud._id,
      detalle: `Matrícula formalizada: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante} en grupo ${updatedGroup.nomenclatura} (${folio_matricula})`,
    });

    await registrarEvento({
      usuario_id: revisorId,
      accion: 'MATRICULA_CREADA',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Matrícula ${estadoMatricula} creada desde admisión (${folio_matricula})`,
    });

    return solicitud;
  });

  // La matrícula ya está confirmada (condicional o definitiva): se abre la cuenta del portal del acudiente. Si no se puede, la matrícula no se afecta.
  if (matriculada.student_user_id) {
    try {
      const r = await habilitarPortalDeAcudientesDe(matriculada.student_user_id, { usuarioId: revisorId });
      for (const o of r.omitidos) console.warn(`[matrícula] No se abrió el portal de ${o.acudiente}: ${o.motivo}`);
    } catch (err) {
      console.error('[matrícula] No se pudo habilitar el portal del acudiente:', err);
    }
  }
  return matriculada;
}

export async function rechazarSolicitud(
  id: string,
  motivo: string,
  revisorId: string | Types.ObjectId
): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  if (solicitud.estado === 'MATRICULADO') throw new ApiError(400, 'Esta solicitud ya cuenta con matrícula formalizada.');

  solicitud.estado = 'RECHAZADA';
  solicitud.motivo_rechazo = motivo;
  solicitud.revisado_por = new Types.ObjectId(revisorId);
  solicitud.fecha_revision = new Date();
  await solicitud.save();

  await registrarEvento({
    usuario_id: revisorId,
    accion: 'ADMISION_RECHAZADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud rechazada: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}. Motivo: ${motivo}`,
  });

  return solicitud;
}
