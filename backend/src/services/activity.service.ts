import { ComponenteSiee } from '../constants/enums';
import Activity, { ActivityDocument } from '../models/activity.model';
import ActivitySubmission, { ActivitySubmissionDocument } from '../models/activitySubmission.model';
import DBABank from '../models/dbaBank.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';
import { assertPeriodNotLocked } from './periodLock.service';

export interface CreateActivityInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  componente_siee: ComponenteSiee;
  peso_en_componente: number;
  fecha_apertura: string | Date;
  fecha_entrega: string | Date;
  dba_id?: string | null;
}

/** Solo el docente titular de la TeacherAssignment puede crear actividades sobre ella. */
export async function createActivity(
  input: CreateActivityInput,
  requestingUser: UserDocument
): Promise<ActivityDocument> {
  const assignment = await TeacherAssignment.findById(input.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica (TeacherAssignment) no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular de esta asignacion puede crear actividades.');
  }

  if (input.dba_id) {
    const dba = await DBABank.findById(input.dba_id);
    if (!dba) throw new ApiError(404, 'dba_id no corresponde a un DBA existente.');

    const [group, subject] = await Promise.all([
      Group.findById(assignment.group_id),
      Subject.findById(assignment.subject_id),
    ]);
    if (
      group &&
      subject &&
      (String(dba.grade_id) !== String(group.grade_id) || String(dba.area_id) !== String(subject.area_id))
    ) {
      throw new ApiError(400, 'El dba_id no corresponde al grado/area de esta asignacion academica.');
    }
  }

  return Activity.create({ ...input, dba_id: input.dba_id ?? null });
}

export interface CreateSubmissionInput {
  texto_entrega?: string;
  archivo_url?: string;
}

/** El estudiante debe estar MATRICULADO en el grupo de la actividad. No se permite re-entregar una vez calificada. */
export async function createSubmission(
  activityId: string,
  input: CreateSubmissionInput,
  student: UserDocument
): Promise<ActivitySubmissionDocument> {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new ApiError(404, 'Actividad no encontrada.');

  const assignment = await TeacherAssignment.findById(activity.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');

  const enrollment = await Enrollment.findOne({
    student_id: student._id,
    group_id: assignment.group_id,
    estado: 'MATRICULADO',
  });
  if (!enrollment) {
    throw new ApiError(403, 'El estudiante no esta matriculado en el grupo de esta actividad.');
  }

  const existing = await ActivitySubmission.findOne({ activity_id: activityId, student_id: student._id });
  if (existing && existing.calificacion_numerica !== null) {
    throw new ApiError(409, 'La actividad ya fue calificada; no se puede modificar la entrega.');
  }

  return ActivitySubmission.findOneAndUpdate(
    { activity_id: activityId, student_id: student._id },
    {
      $set: {
        texto_entrega: input.texto_entrega ?? '',
        archivo_url: input.archivo_url ?? null,
        fecha_entrega: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

export interface GradeEntryInput {
  student_id: string;
  calificacion_numerica: number;
  retroalimentacion?: string;
}

/**
 * Califica a uno o varios estudiantes de una actividad ("por lote"). Solo el
 * docente titular puede calificar, siempre que el periodo no este CERRADO
 * (bloqueo extemporaneo) y todos los estudiantes esten matriculados en el grupo.
 * Es un upsert por (activity_id, student_id): no requiere que el estudiante
 * haya enviado una entrega previa (ej. actividades actitudinales de aula).
 */
export async function gradeActivity(
  activityId: string,
  entries: GradeEntryInput[],
  requestingUser: UserDocument
): Promise<ActivitySubmissionDocument[]> {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new ApiError(404, 'Actividad no encontrada.');

  const assignment = await TeacherAssignment.findById(activity.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular puede calificar esta actividad.');
  }

  await assertPeriodNotLocked(assignment.academic_year_id, assignment.group_id, activity.periodo_numero);

  const studentIds = entries.map((e) => e.student_id);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new ApiError(400, 'No se puede calificar dos veces al mismo estudiante en la misma solicitud.');
  }

  const enrollments = await Enrollment.find({
    student_id: { $in: studentIds },
    group_id: assignment.group_id,
    estado: 'MATRICULADO',
  });
  const enrolledSet = new Set(enrollments.map((e) => String(e.student_id)));
  const noMatriculados = studentIds.filter((id) => !enrolledSet.has(id));
  if (noMatriculados.length > 0) {
    throw new ApiError(400, `Los siguientes estudiantes no estan matriculados en el grupo: ${noMatriculados.join(', ')}.`);
  }

  return runTransaction(async (session) => {
    const results = await Promise.all(
      entries.map((entry) =>
        ActivitySubmission.findOneAndUpdate(
          { activity_id: activityId, student_id: entry.student_id },
          {
            $set: {
              calificacion_numerica: entry.calificacion_numerica,
              retroalimentacion: entry.retroalimentacion ?? '',
              fecha_calificacion: new Date(),
              docente_id: requestingUser._id,
            },
            $setOnInsert: {
              fecha_entrega: new Date(),
            },
          },
          { new: true, upsert: true, runValidators: true, session }
        )
      )
    );

    return results.filter((r): r is ActivitySubmissionDocument => r !== null);
  });
}
