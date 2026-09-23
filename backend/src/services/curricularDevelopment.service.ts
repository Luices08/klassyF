import CurricularDevelopment, { CurricularDevelopmentDocument } from '../models/curricularDevelopment.model';
import DBABank from '../models/dbaBank.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import { EstadoDesarrolloCurricular } from '../constants/enums';
import ApiError from '../utils/ApiError';

// Estados desde los que el docente puede crear/editar contenido: un borrador
// nuevo, o uno que la coordinacion devolvio con observaciones.
const ESTADOS_EDITABLES: EstadoDesarrolloCurricular[] = ['BORRADOR', 'DEVUELTO_OBSERVACIONES'];

export interface UpsertDraftInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  dba_seleccionados?: string[];
  competencias: string;
  ejes_tematicos?: string[];
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
}

export interface ReviewInput {
  decision: Extract<EstadoDesarrolloCurricular, 'APROBADO' | 'DEVUELTO_OBSERVACIONES'>;
  observacion?: string;
}

async function assertTeacherOwnsAssignment(
  teacherAssignmentId: string,
  requestingUser: UserDocument
): Promise<TeacherAssignmentDocument> {
  const assignment = await TeacherAssignment.findById(teacherAssignmentId);
  if (!assignment) {
    throw new ApiError(404, 'Asignacion academica (TeacherAssignment) no encontrada.');
  }
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular de esta asignacion puede crear o editar esta planeacion.');
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
  if (!group) throw new ApiError(404, 'Grupo de la asignacion academica no encontrado.');
  if (!subject) throw new ApiError(404, 'Asignatura de la asignacion academica no encontrada.');

  const dbas = await DBABank.find({ _id: { $in: dbaIds } });
  if (dbas.length !== new Set(dbaIds).size) {
    throw new ApiError(400, 'Uno o mas dba_seleccionados no existen en el banco de DBA.');
  }

  const inconsistente = dbas.some(
    (d) => String(d.grade_id) !== String(group.grade_id) || String(d.area_id) !== String(subject.area_id)
  );
  if (inconsistente) {
    throw new ApiError(
      400,
      'Uno o mas DBA seleccionados no corresponden al grado/area de esta asignacion academica.'
    );
  }
}

/**
 * Crea el borrador de desarrollo curricular para (teacher_assignment_id, periodo_numero)
 * si no existe, o lo edita si ya existe y su estado es editable (BORRADOR o
 * DEVUELTO_OBSERVACIONES). Solo el docente titular de la asignacion puede hacerlo.
 */
export async function upsertDraft(
  input: UpsertDraftInput,
  requestingUser: UserDocument
): Promise<CurricularDevelopmentDocument> {
  const assignment = await assertTeacherOwnsAssignment(input.teacher_assignment_id, requestingUser);
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
    ejes_tematicos: input.ejes_tematicos ?? [],
    metodologia_y_recursos: input.metodologia_y_recursos,
    criterios_evaluacion: input.criterios_evaluacion,
    dba_seleccionados: input.dba_seleccionados ?? [],
  };

  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
    return existing;
  }

  return CurricularDevelopment.create({
    teacher_assignment_id: input.teacher_assignment_id,
    periodo_numero: input.periodo_numero,
    estado: 'BORRADOR',
    ...fields,
  });
}

/**
 * El docente titular envia su borrador/devuelto a revision. Queda bloqueado
 * para edicion hasta que la coordinacion lo apruebe o lo devuelva.
 */
export async function submitForReview(id: string, requestingUser: UserDocument): Promise<CurricularDevelopmentDocument> {
  const doc = await CurricularDevelopment.findById(id);
  if (!doc) throw new ApiError(404, 'Desarrollo curricular no encontrado.');

  const assignment = await TeacherAssignment.findById(doc.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular puede enviar esta planeacion a revision.');
  }

  if (!ESTADOS_EDITABLES.includes(doc.estado)) {
    throw new ApiError(409, `No se puede enviar a revision un desarrollo curricular en estado ${doc.estado}.`);
  }

  doc.estado = 'ENVIADO_REVISION';
  await doc.save();
  return doc;
}

/**
 * Coordinador/Admin/Superadmin aprueban o devuelven con observaciones un
 * desarrollo que este en ENVIADO_REVISION. Cada decision queda registrada en
 * historial_revisiones para trazabilidad.
 */
export async function reviewDevelopment(
  id: string,
  input: ReviewInput,
  reviewer: UserDocument
): Promise<CurricularDevelopmentDocument> {
  const doc = await CurricularDevelopment.findById(id);
  if (!doc) throw new ApiError(404, 'Desarrollo curricular no encontrado.');

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
  return doc;
}
