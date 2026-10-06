import AcademicYear from '../../institucional/calendario/academicYear.model';
import CurricularDevelopment, { CurricularDevelopmentDocument } from './curricularDevelopment.model';
import { Dba } from '../referentes/referenteCurricular.model';
import Group from '../../institucional/estructura/group.model';
import Subject from '../plan-estudios/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../carga-docente/teacherAssignment.model';
import { UserDocument } from '../../../models/user.model';
import { EstadoDesarrolloCurricular } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import { asegurarAnioNoCerrado } from '../../institucional';
import { registrarEvento } from '../../../services/audit.service';
import ApiError from '../../../utils/ApiError';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';

interface ContextoActor {
  ip?: string | null;
}

// Estados desde los que el docente puede crear/editar contenido: un borrador
// nuevo, o uno que la coordinación devolvió con observaciones.
const ESTADOS_EDITABLES: EstadoDesarrolloCurricular[] = ['BORRADOR', 'DEVUELTO_OBSERVACIONES'];

export interface UpsertDraftInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  dba_seleccionados?: string[];
  competencias: string;
  contenidos_tematicos?: string[];
  ejes_tematicos?: string[];
  actividades_propuestas?: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas?: number;
}

export interface ReviewInput {
  decision: Extract<EstadoDesarrolloCurricular, 'APROBADO' | 'DEVUELTO_OBSERVACIONES'>;
  observacion?: string;
}

export interface ListDevelopmentsQuery {
  academic_year_id?: string;
  estado?: string;
  periodo_numero?: number;
  teacher_assignment_id?: string;
  docente_id?: string;
}

async function assertTeacherOwnsAssignment(
  teacherAssignmentId: string,
  requestingUser: UserDocument
): Promise<TeacherAssignmentDocument> {
  const assignment = await TeacherAssignment.findById(teacherAssignmentId);
  if (!assignment) {
    throw new ApiError(404, 'Asignación académica (TeacherAssignment) no encontrada.');
  }
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular de esta asignación puede crear o editar esta planeación.');
  }
  if (assignment.tipo_asignacion !== 'CLASE') {
    throw new ApiError(400, 'El desarrollo curricular solo aplica a asignaciones de tipo CLASE.');
  }
  if (assignment.estado !== 'activo') {
    throw new ApiError(400, 'Esta asignación académica ya no está activa.');
  }
  return assignment;
}

async function validateDbaSeleccionados(
  dbaIds: string[] | undefined,
  assignment: TeacherAssignmentDocument
): Promise<void> {
  if (!dbaIds || dbaIds.length === 0) return;

  const [group, subject] = await Promise.all([
    Group.findById(assignment.group_id),
    Subject.findById(assignment.subject_id),
  ]);
  if (!group) throw new ApiError(404, 'Grupo de la asignación académica no encontrado.');
  if (!subject) throw new ApiError(404, 'Asignatura de la asignación académica no encontrada.');

  // Solo DBA vigentes (estado activo): uno Histórico ya no se ofrece para seleccion (ver
  // referenteCurricular.model.ts), aunque siga existiendo por trazabilidad de planeaciones viejas.
  const dbas = await Dba.find({ _id: { $in: dbaIds }, estado: ESTADO_ACTIVO });
  if (dbas.length !== new Set(dbaIds).size) {
    throw new ApiError(400, 'Uno o más dba_seleccionados no existen en el banco de DBA o ya no están vigentes.');
  }

  const inconsistente = dbas.some(
    (d) => String(d.grade_id) !== String(group.grade_id) || String(d.area_id) !== String(subject.area_id)
  );
  if (inconsistente) {
    throw new ApiError(
      400,
      'Uno o más DBA seleccionados no corresponden al grado/área de esta asignación académica.'
    );
  }
}

/**
 * Crea o edita el borrador de desarrollo curricular para (teacher_assignment_id, periodo_numero).
 * Solo el docente titular puede guardar mientras esté en BORRADOR o DEVUELTO_OBSERVACIONES.
 */
export async function upsertDraft(
  input: UpsertDraftInput,
  requestingUser: UserDocument,
  { ip }: ContextoActor = {}
): Promise<CurricularDevelopmentDocument> {
  const assignment = await assertTeacherOwnsAssignment(input.teacher_assignment_id, requestingUser);
  // Un año CERRADO es historico de solo lectura, igual que en M01/M04/M05/M08/M10.
  await asegurarAnioNoCerrado(String(assignment.academic_year_id));

  const academicYear = await AcademicYear.findById(assignment.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  if (!academicYear.periodos.some((p) => p.numero === input.periodo_numero)) {
    throw new ApiError(400, `El año lectivo ${academicYear.year} no tiene periodo ${input.periodo_numero}.`);
  }

  await validateDbaSeleccionados(input.dba_seleccionados, assignment);

  const existing = await CurricularDevelopment.findOne({
    teacher_assignment_id: input.teacher_assignment_id,
    periodo_numero: input.periodo_numero,
  });

  if (existing && !ESTADOS_EDITABLES.includes(existing.estado)) {
    throw new ApiError(409, `No se puede editar un desarrollo curricular en estado ${existing.estado}.`);
  }

  const fields = {
    competencias: input.competencias,
    contenidos_tematicos: input.contenidos_tematicos ?? [],
    ejes_tematicos: input.ejes_tematicos ?? [],
    actividades_propuestas: input.actividades_propuestas ?? '',
    metodologia_y_recursos: input.metodologia_y_recursos,
    criterios_evaluacion: input.criterios_evaluacion,
    semanas_estimadas: input.semanas_estimadas ?? 10,
    dba_seleccionados: input.dba_seleccionados ?? [],
  };

  let doc: CurricularDevelopmentDocument;
  if (existing) {
    Object.assign(existing, fields);
    doc = await existing.save();
  } else {
    doc = await CurricularDevelopment.create({
      teacher_assignment_id: input.teacher_assignment_id,
      periodo_numero: input.periodo_numero,
      estado: 'BORRADOR',
      version: 1,
      ...fields,
    });
  }

  await registrarEvento({
    usuario_id: requestingUser._id,
    accion: 'DESARROLLO_CURRICULAR_GUARDADO',
    entidad: 'CurricularDevelopment',
    entidad_id: doc._id,
    detalle: `Asignación ${input.teacher_assignment_id}, periodo ${input.periodo_numero}.`,
    ip,
  });
  return doc;
}

/**
 * El docente titular envía su borrador a revisión.
 * Conserva una copia snapshot en historial_versiones para trazabilidad (RN-CUR-04).
 */
export async function submitForReview(
  id: string,
  requestingUser: UserDocument,
  { ip }: ContextoActor = {}
): Promise<CurricularDevelopmentDocument> {
  const doc = await CurricularDevelopment.findById(id);
  if (!doc) throw new ApiError(404, 'Desarrollo curricular no encontrado.');

  const assignment = await TeacherAssignment.findById(doc.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignación académica asociada no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular puede enviar esta planeación a revisión.');
  }
  await asegurarAnioNoCerrado(String(assignment.academic_year_id));

  if (!ESTADOS_EDITABLES.includes(doc.estado)) {
    throw new ApiError(409, `No se puede enviar a revisión un desarrollo curricular en estado ${doc.estado}.`);
  }

  // Guardar snapshot de versión histórica antes de la transición (RN-CUR-04): todo el contenido
  // editable, no solo una parte — si no, un cambio entre versiones en los campos que faltaban
  // (metodologia_y_recursos, ejes_tematicos, semanas_estimadas) no quedaba trazado.
  doc.historial_versiones.push({
    version: doc.version,
    fecha: new Date(),
    modificado_por: requestingUser._id,
    dba_seleccionados: doc.dba_seleccionados,
    competencias: doc.competencias,
    contenidos_tematicos: doc.contenidos_tematicos,
    ejes_tematicos: doc.ejes_tematicos,
    actividades_propuestas: doc.actividades_propuestas,
    metodologia_y_recursos: doc.metodologia_y_recursos,
    criterios_evaluacion: doc.criterios_evaluacion,
    semanas_estimadas: doc.semanas_estimadas,
    estado: doc.estado,
  });

  doc.version += 1;
  doc.estado = 'ENVIADO_REVISION';
  await doc.save();

  await registrarEvento({
    usuario_id: requestingUser._id,
    accion: 'DESARROLLO_CURRICULAR_ENVIADO_REVISION',
    entidad: 'CurricularDevelopment',
    entidad_id: doc._id,
    detalle: `Periodo ${doc.periodo_numero}, versión ${doc.version}.`,
    ip,
  });
  return doc;
}

/**
 * Coordinación o Administración revisan la planeación.
 * Emiten concepto: APROBADO o DEVUELTO_OBSERVACIONES.
 */
export async function reviewDevelopment(
  id: string,
  input: ReviewInput,
  reviewer: UserDocument,
  { ip }: ContextoActor = {}
): Promise<CurricularDevelopmentDocument> {
  const doc = await CurricularDevelopment.findById(id);
  if (!doc) throw new ApiError(404, 'Desarrollo curricular no encontrado.');

  const assignment = await TeacherAssignment.findById(doc.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignación académica asociada no encontrada.');
  await asegurarAnioNoCerrado(String(assignment.academic_year_id));

  if (doc.estado !== 'ENVIADO_REVISION') {
    throw new ApiError(
      409,
      `Solo se pueden revisar desarrollos en estado ENVIADO_REVISION (estado actual: ${doc.estado}).`
    );
  }

  doc.estado = input.decision;
  doc.historial_revisiones.push({
    observacion: input.observacion ?? '',
    coordinador_id: reviewer._id,
    fecha: new Date(),
    estado_resultante: input.decision,
  });

  await doc.save();

  await registrarEvento({
    usuario_id: reviewer._id,
    accion: 'DESARROLLO_CURRICULAR_REVISADO',
    entidad: 'CurricularDevelopment',
    entidad_id: doc._id,
    detalle: `Periodo ${doc.periodo_numero} → ${input.decision}.`,
    ip,
  });
  return doc;
}

export interface ReabrirInput {
  motivo: string;
}

/**
 * Reabre una planeación APROBADO para que el docente pueda corregirla (vuelve a
 * DEVUELTO_OBSERVACIONES). Solo ADMIN, con motivo obligatorio — mismo patrón que reabrir un
 * periodo CERRADO en M05 (academicYear.service.ts): una aprobación es una decisión formal, no se
 * deshace sin dejar constancia de por qué.
 */
export async function reabrirDevelopment(
  id: string,
  input: ReabrirInput,
  actor: UserDocument,
  { ip }: ContextoActor = {}
): Promise<CurricularDevelopmentDocument> {
  const doc = await CurricularDevelopment.findById(id);
  if (!doc) throw new ApiError(404, 'Desarrollo curricular no encontrado.');

  const assignment = await TeacherAssignment.findById(doc.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignación académica asociada no encontrada.');
  await asegurarAnioNoCerrado(String(assignment.academic_year_id));

  if (doc.estado !== 'APROBADO') {
    throw new ApiError(409, `Solo se puede reabrir una planeación en estado APROBADO (estado actual: ${doc.estado}).`);
  }

  doc.estado = 'DEVUELTO_OBSERVACIONES';
  doc.historial_revisiones.push({
    observacion: input.motivo,
    coordinador_id: actor._id,
    fecha: new Date(),
    estado_resultante: 'DEVUELTO_OBSERVACIONES',
  });
  await doc.save();

  await registrarEvento({
    usuario_id: actor._id,
    accion: 'DESARROLLO_CURRICULAR_REABIERTO',
    entidad: 'CurricularDevelopment',
    entidad_id: doc._id,
    detalle: `Periodo ${doc.periodo_numero}. Motivo: ${input.motivo}`,
    ip,
  });
  return doc;
}

/**
 * Consulta un desarrollo curricular por asignación y periodo. Un DOCENTE solo puede consultar
 * sus propias asignaciones (mismo filtro que listDevelopments); ADMIN/COORDINADOR sin restricción.
 */
export async function getDevelopmentByAssignmentAndPeriod(
  teacherAssignmentId: string,
  periodoNumero: number,
  requestingUser: UserDocument
): Promise<CurricularDevelopmentDocument | null> {
  if (requestingUser.rol === ROLES.DOCENTE) {
    const assignment = await TeacherAssignment.findById(teacherAssignmentId).select('docente_id');
    if (!assignment || String(assignment.docente_id) !== String(requestingUser._id)) {
      throw new ApiError(403, 'Solo puedes consultar la planeación de tus propias asignaciones académicas.');
    }
  }

  return CurricularDevelopment.findOne({
    teacher_assignment_id: teacherAssignmentId,
    periodo_numero: periodoNumero,
  })
    .populate('dba_seleccionados')
    .populate('historial_revisiones.coordinador_id', 'nombre apellido email')
    .populate('historial_versiones.modificado_por', 'nombre apellido');
}

/**
 * Listado de desarrollos curriculares para la bandeja de coordinación o seguimiento docente.
 */
export async function listDevelopments(
  query: ListDevelopmentsQuery,
  requestingUser: UserDocument
) {
  const filter: Record<string, unknown> = {};

  if (query.estado) filter.estado = query.estado;
  if (query.periodo_numero) filter.periodo_numero = query.periodo_numero;

  // El alcance por asignacion se arma con TODOS los filtros relevantes a la vez (nunca se
  // pisan entre si): un DOCENTE siempre queda acotado a las suyas, y si ademas manda
  // teacher_assignment_id, se exige que esa asignacion sea realmente suya (si no, no hay
  // resultados — no se ignora su propio filtro ni se le muestra la de otro docente).
  const assignmentFilter: Record<string, unknown> = {};
  if (requestingUser.rol === ROLES.DOCENTE) {
    assignmentFilter.docente_id = requestingUser._id;
  } else {
    if (query.academic_year_id) assignmentFilter.academic_year_id = query.academic_year_id;
    if (query.docente_id) assignmentFilter.docente_id = query.docente_id;
  }

  if (Object.keys(assignmentFilter).length > 0) {
    const asignaciones = await TeacherAssignment.find(assignmentFilter).select('_id');
    const assignmentIds = asignaciones.map((a) => String(a._id));

    if (query.teacher_assignment_id) {
      if (!assignmentIds.includes(query.teacher_assignment_id)) return [];
      filter.teacher_assignment_id = query.teacher_assignment_id;
    } else {
      filter.teacher_assignment_id = { $in: assignmentIds };
    }
  } else if (query.teacher_assignment_id) {
    filter.teacher_assignment_id = query.teacher_assignment_id;
  }

  return CurricularDevelopment.find(filter)
    .populate({
      path: 'teacher_assignment_id',
      select: 'docente_id group_id subject_id academic_year_id horas_semanales',
      populate: [
        { path: 'docente_id', select: 'nombre apellido email numero_documento' },
        {
          path: 'group_id',
          select: 'nomenclatura grade_id sede_id jornada_id',
          populate: [
            { path: 'grade_id', select: 'nombre numero' },
            { path: 'sede_id', select: 'nombre' },
          ],
        },
        {
          path: 'subject_id',
          select: 'nombre abreviatura area_id',
          populate: { path: 'area_id', select: 'nombre codigo' },
        },
      ],
    })
    .populate('dba_seleccionados')
    .sort({ updatedAt: -1 });
}
