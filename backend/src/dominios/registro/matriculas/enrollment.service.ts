import { Types } from 'mongoose';
import { DOCUMENTOS_REQUERIDOS_POR_NIVEL } from './matriculaChecklist.constants';
import {
  ESTADOS_MATRICULA_CON_FOLIO,
  EstadoDocumentoMatricula,
  EstadoMatricula,
  Rol,
  TipoDocumentoMatricula,
  TipoIngreso,
} from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import AcademicYear from '../../institucional/calendario/academicYear.model';
import Enrollment, { EnrollmentDocument } from './enrollment.model';
import Grade from '../../institucional/estructura/grade.model';
import Group from '../../institucional/estructura/group.model';
import User from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { runTransaction } from '../../../utils/runTransaction';
import { registrarEvento } from '../../../services/audit.service';
import { generateFolioMatricula } from './folio.service';
import { crearDesdeMatricula } from '../../bienestar';

const ESTADOS_QUE_LIBERAN_CUPO: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];
const ESTADOS_TERMINALES: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];

export interface CreateEnrollmentInput {
  student_id: string | Types.ObjectId;
  group_id: string | Types.ObjectId;
  academic_year_id: string | Types.ObjectId;
  tipo_ingreso: TipoIngreso;
  numero_libro?: number;
  estado_inicial?: 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO';
  fecha_limite_compromiso?: string | Date;
  forzar_sobrecupo?: boolean;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos (M16): se transcribe, sin valorar ni rotular. */
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

/**
 * Crea una matricula ya formalizada (MATRICULADO_*): reserva el cupo
 * (respetando max_capacity salvo override de ADMIN), genera el folio
 * reglamentario (libro/folio) e inicializa el checklist documental segun el
 * nivel del grado del grupo. Las preinscripciones (M04) no pasan por aqui.
 */
export async function createEnrollment(
  input: CreateEnrollmentInput,
  actor: { id: string | Types.ObjectId; rol: Rol }
): Promise<EnrollmentDocument> {
  const { student_id, group_id, academic_year_id, tipo_ingreso } = input;
  const numeroLibro = input.numero_libro ?? 1;
  const estadoInicial = input.estado_inicial ?? 'MATRICULADO_CONDICIONAL';

  if (estadoInicial === 'MATRICULADO_CONDICIONAL' && !input.fecha_limite_compromiso) {
    throw new ApiError(400, 'fecha_limite_compromiso es obligatoria para una matrícula condicional.');
  }

  const puedeForzar = Boolean(input.forzar_sobrecupo) && actor.rol === ROLES.ADMIN;

  return runTransaction(async (session) => {
    const student = await User.findOne({ _id: student_id, rol: ROLES.ESTUDIANTE }).session(session);
    if (!student) {
      throw new ApiError(404, 'El estudiante no existe o el usuario no tiene rol ESTUDIANTE.');
    }
    if (student.estado !== 'activo') {
      throw new ApiError(409, 'El estudiante se encuentra inactivo.');
    }

    const academicYear = await AcademicYear.findById(academic_year_id).session(session);
    if (!academicYear) {
      throw new ApiError(404, 'Año lectivo no encontrado.');
    }

    const group = await Group.findById(group_id).session(session);
    if (!group) throw new ApiError(404, 'Grupo no encontrado.');
    if (String(group.academic_year_id) !== String(academic_year_id)) {
      throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
    }

    const grade = await Grade.findById(group.grade_id).session(session);
    if (!grade) throw new ApiError(404, 'Grado no encontrado.');

    // Check-and-reserve atomico: solo actualiza si el grupo sigue activo y aun hay cupo
    // disponible (salvo que un ADMIN autorice explicitamente la excepcion de sobrecupo — eso
    // nunca extiende a un grupo CLOSED, que es una decision operativa distinta a el aforo).
    const filtroReserva: Record<string, unknown> = { _id: group_id, academic_year_id, estado: 'ACTIVE' };
    if (!puedeForzar) filtroReserva.$expr = { $lt: ['$cupos_ocupados', '$max_capacity'] };

    const updatedGroup = await Group.findOneAndUpdate(filtroReserva, { $inc: { cupos_ocupados: 1 } }, { new: true, session });
    if (!updatedGroup) {
      throw new ApiError(409, 'El grupo seleccionado no está activo o no tiene cupos disponibles.');
    }

    const { numero_folio, folio_matricula } = await generateFolioMatricula(academicYear.year, numeroLibro, session);

    const checklist = (DOCUMENTOS_REQUERIDOS_POR_NIVEL[grade.nivel] ?? []).map((tipo_documento) => ({
      tipo_documento,
      estado: 'PENDIENTE' as EstadoDocumentoMatricula,
      archivo_path: null,
      comentario: null,
      fecha_carga: null,
      revisado_por: null,
    }));

    const [enrollment] = await Enrollment.create(
      [
        {
          student_id,
          group_id,
          academic_year_id,
          folio_matricula,
          numero_libro: numeroLibro,
          numero_folio,
          tipo_ingreso,
          estado: estadoInicial,
          fecha_matricula: new Date(),
          fecha_limite_compromiso: estadoInicial === 'MATRICULADO_CONDICIONAL' ? input.fecha_limite_compromiso : null,
          checklist,
        },
      ],
      { session }
    );
    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matricula.');

    // Cambio mínimo de M16: en la misma transacción queda la solicitud en la bandeja de orientación.
    if (input.apoyo_declarado) {
      await crearDesdeMatricula(
        {
          student_id,
          academic_year_id,
          group_id,
          origen: 'MATRICULA',
          motivo_declarado: input.apoyo_declarado.motivo_declarado,
          aporta_soporte: Boolean(input.apoyo_declarado.aporta_soporte),
          observacion: input.apoyo_declarado.observacion,
          solicitada_por: actor.id,
        },
        session
      );
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_CREADA',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Folio ${folio_matricula}, tipo_ingreso ${tipo_ingreso}, estado ${estadoInicial}`,
    });
    if (puedeForzar) {
      await registrarEvento({
        usuario_id: actor.id,
        accion: 'MATRICULA_SOBRECUPO_AUTORIZADO',
        entidad: 'Enrollment',
        entidad_id: enrollment._id,
        detalle: `Grupo ${group._id} excede max_capacity ${group.max_capacity}`,
      });
    }

    return enrollment;
  });
}

export interface FormalizacionOpciones {
  /** Libro del Libro de Matricula en el que se asienta el folio (por defecto 1). Solo aplica al formalizar. */
  numero_libro?: number;
  /** Obligatoria al formalizar como MATRICULADO_CONDICIONAL. */
  fecha_limite_compromiso?: string | Date;
}

/**
 * Cambia el estado de una matricula (formalizacion, retiro, anulacion).
 * Exige motivo para RETIRADO y ANULADO; libera el cupo del grupo en ambos casos.
 *
 * El folio del Libro de Matricula se asigna aqui, en la transicion
 * PREINSCRITO -> MATRICULADO_*, y no antes: un aspirante que desiste no debe
 * consumir un numero oficial (dejaria un hueco en el consecutivo). Va en la
 * misma transaccion que el cambio de estado, asi que si este falla el
 * consecutivo hace rollback.
 */
export async function updateEnrollmentStatus(
  enrollmentId: string | Types.ObjectId,
  nuevoEstado: EstadoMatricula,
  motivo: string | undefined,
  actor: { id: string | Types.ObjectId },
  opciones: FormalizacionOpciones = {}
): Promise<EnrollmentDocument> {
  if ((nuevoEstado === 'RETIRADO' || nuevoEstado === 'ANULADO') && !motivo) {
    throw new ApiError(400, `Debes indicar un motivo para pasar la matrícula a ${nuevoEstado}.`);
  }

  return runTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      throw new ApiError(404, 'Matricula no encontrada.');
    }

    const estadoAnterior = enrollment.estado;

    if (estadoAnterior === nuevoEstado) {
      throw new ApiError(400, `La matricula ya se encuentra en estado ${nuevoEstado}.`);
    }
    if (ESTADOS_TERMINALES.includes(estadoAnterior)) {
      throw new ApiError(409, `No se puede modificar una matricula que ya esta en estado ${estadoAnterior}.`);
    }

    // Una matricula con folio ya es un asiento del Libro: no vuelve a preinscrita.
    if (nuevoEstado === 'PREINSCRITO' && enrollment.folio_matricula) {
      throw new ApiError(409, 'Una matrícula con folio asignado no puede volver a PREINSCRITO.');
    }

    let detalleFolio = '';
    if (!enrollment.folio_matricula && ESTADOS_MATRICULA_CON_FOLIO.includes(nuevoEstado)) {
      if (nuevoEstado === 'MATRICULADO_CONDICIONAL' && !opciones.fecha_limite_compromiso) {
        throw new ApiError(400, 'fecha_limite_compromiso es obligatoria para una matrícula condicional.');
      }

      const academicYear = await AcademicYear.findById(enrollment.academic_year_id).session(session);
      if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

      const numeroLibro = opciones.numero_libro ?? 1;
      const { numero_folio, folio_matricula } = await generateFolioMatricula(academicYear.year, numeroLibro, session);
      enrollment.folio_matricula = folio_matricula;
      enrollment.numero_libro = numeroLibro;
      enrollment.numero_folio = numero_folio;
      // La fecha de matricula es la de la formalizacion, no la de la preinscripcion.
      enrollment.fecha_matricula = new Date();
      detalleFolio = ` — folio ${folio_matricula}`;
    }

    enrollment.estado = nuevoEstado;
    if (motivo) enrollment.motivo_retiro = motivo;
    if (nuevoEstado === 'MATRICULADO_CONDICIONAL' && opciones.fecha_limite_compromiso) {
      enrollment.fecha_limite_compromiso = new Date(opciones.fecha_limite_compromiso);
    }
    if (nuevoEstado === 'MATRICULADO_DEFINITIVO') enrollment.fecha_limite_compromiso = null;
    await enrollment.save({ session });

    if (ESTADOS_QUE_LIBERAN_CUPO.includes(nuevoEstado)) {
      await Group.findOneAndUpdate(
        { _id: enrollment.group_id, cupos_ocupados: { $gt: 0 } },
        { $inc: { cupos_ocupados: -1 } },
        { session }
      );
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_ESTADO_CAMBIADO',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `${estadoAnterior} -> ${nuevoEstado}${detalleFolio}${motivo ? ` — motivo: ${motivo}` : ''}`,
    });

    return enrollment;
  });
}

/** Reasignacion/cambio de grupo (M04-D): conserva el historial de notas/asistencia, que viven en otras colecciones por group_id+fecha. */
export async function cambiarGrupo(
  enrollmentId: string | Types.ObjectId,
  nuevoGroupId: string | Types.ObjectId,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  return runTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');
    if (ESTADOS_TERMINALES.includes(enrollment.estado)) {
      throw new ApiError(409, `No se puede cambiar de grupo una matricula en estado ${enrollment.estado}.`);
    }
    if (String(enrollment.group_id) === String(nuevoGroupId)) {
      throw new ApiError(400, 'El estudiante ya pertenece a ese grupo.');
    }

    const nuevoGrupo = await Group.findOneAndUpdate(
      {
        _id: nuevoGroupId,
        academic_year_id: enrollment.academic_year_id,
        estado: 'ACTIVE',
        $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] },
      },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );
    if (!nuevoGrupo) {
      throw new ApiError(
        409,
        'El grupo destino no está activo, no tiene cupos disponibles o no pertenece al mismo año lectivo.'
      );
    }

    const grupoAnteriorId = enrollment.group_id;
    await Group.findOneAndUpdate(
      { _id: grupoAnteriorId, cupos_ocupados: { $gt: 0 } },
      { $inc: { cupos_ocupados: -1 } },
      { session }
    );

    enrollment.group_id = nuevoGrupo._id;
    await enrollment.save({ session });

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_GRUPO_CAMBIADO',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Grupo ${grupoAnteriorId} -> ${nuevoGrupo._id}`,
    });

    return enrollment;
  });
}

export interface ListarEnrollmentsFilter {
  academic_year_id?: string;
  group_id?: string;
  estado?: EstadoMatricula;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarEnrollments(filter: ListarEnrollmentsFilter) {
  const query: Record<string, unknown> = {};
  if (filter.academic_year_id) query.academic_year_id = filter.academic_year_id;
  if (filter.group_id) query.group_id = filter.group_id;
  if (filter.estado) query.estado = filter.estado;

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

  let studentIds: Types.ObjectId[] | undefined;
  if (filter.search) {
    const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const estudiantes = await User.find({ $or: [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }] }).select('_id');
    studentIds = estudiantes.map((e) => e._id);
    query.student_id = { $in: studentIds };
  }

  const [data, total] = await Promise.all([
    Enrollment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('student_id', 'nombre apellido numero_documento tipo_documento')
      .populate('group_id', 'nomenclatura'),
    Enrollment.countDocuments(query),
  ]);

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function obtenerEnrollment(id: string): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(id)
    .populate('student_id', 'nombre apellido numero_documento tipo_documento email')
    .populate('group_id', 'nomenclatura grade_id')
    .populate('checklist.revisado_por', 'nombre apellido');
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');
  return enrollment;
}

export async function cargarDocumento(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  archivoPath: string,
  // null = el acudiente subio el documento desde el sitio publico, sin sesion.
  actor: { id: string | Types.ObjectId | null }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');

  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese tipo de documento no aplica para el nivel de esta matrícula.');

  item.archivo_path = archivoPath;
  item.estado = 'CARGADO';
  item.fecha_carga = new Date();
  item.comentario = null;
  item.revisado_por = null;
  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_CARGADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: tipoDocumento,
  });

  return enrollment;
}

export interface RevisarDocumentoInput {
  estado: Extract<EstadoDocumentoMatricula, 'APROBADO' | 'RECHAZADO'>;
  comentario?: string;
}

export async function revisarDocumento(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  input: RevisarDocumentoInput,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');

  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese tipo de documento no aplica para el nivel de esta matrícula.');
  if (!item.archivo_path) throw new ApiError(400, 'Este documento todavía no ha sido cargado.');

  item.estado = input.estado;
  item.comentario = input.comentario ?? null;
  item.revisado_por = new Types.ObjectId(actor.id);

  const todoAprobado = enrollment.checklist.every((c) => c.estado === 'APROBADO');
  let transicion = '';
  if (todoAprobado && enrollment.estado === 'MATRICULADO_CONDICIONAL') {
    enrollment.estado = 'MATRICULADO_DEFINITIVO';
    enrollment.fecha_limite_compromiso = null;
    transicion = ' — checklist completo: matrícula pasa a MATRICULADO_DEFINITIVO';
  }

  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_REVISADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: `${tipoDocumento}: ${input.estado}${transicion}`,
  });

  return enrollment;
}
