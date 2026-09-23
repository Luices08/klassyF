import AcademicYear from '../models/academicYear.model';
import Grade from '../models/grade.model';
import Subject from '../models/subject.model';
import StudyPlanAssignment, { StudyPlanAssignmentDocument } from '../models/studyPlanAssignment.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';

export interface StudyPlanItemInput {
  subject_id: string;
  porcentaje_en_area: number;
}

export interface SetStudyPlanInput {
  grade_id: string;
  academic_year_id: string;
  asignaciones: StudyPlanItemInput[];
}

/**
 * Reemplaza por completo la malla (StudyPlanAssignment) de un grado+año lectivo
 * con el conjunto de asignaciones recibido, agrupando por area (via subject.area_id)
 * y validando que la suma de porcentaje_en_area de cada area sea exactamente 100.
 *
 * Es un "set" idempotente (no un "append"): la solicitud debe incluir TODAS las
 * asignaturas de cada area que se quiera dejar configurada, ya que las asignaciones
 * previas de ese grado+año se eliminan y se reemplazan atomicamente.
 */
export async function setStudyPlan({
  grade_id,
  academic_year_id,
  asignaciones,
}: SetStudyPlanInput): Promise<StudyPlanAssignmentDocument[]> {
  const grade = await Grade.findById(grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');

  const academicYear = await AcademicYear.findById(academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  const subjectIds = asignaciones.map((a) => a.subject_id);
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new ApiError(400, 'No se puede asignar la misma asignatura mas de una vez en la malla.');
  }

  const subjects = await Subject.find({ _id: { $in: subjectIds } });
  if (subjects.length !== subjectIds.length) {
    throw new ApiError(400, 'Una o mas asignaturas (subject_id) no existen.');
  }

  const areaBySubjectId = new Map(subjects.map((s) => [String(s._id), String(s.area_id)]));

  const sumaPorArea = new Map<string, number>();
  for (const item of asignaciones) {
    const areaId = areaBySubjectId.get(item.subject_id) as string;
    sumaPorArea.set(areaId, (sumaPorArea.get(areaId) ?? 0) + item.porcentaje_en_area);
  }

  const areasDesbalanceadas = [...sumaPorArea.entries()].filter(
    ([, total]) => Math.round(total * 100) / 100 !== 100
  );
  if (areasDesbalanceadas.length > 0) {
    const detalle = areasDesbalanceadas.map(([areaId, total]) => `area ${areaId}: ${total}%`).join(', ');
    throw new ApiError(
      400,
      `La suma de porcentaje_en_area debe ser exactamente 100 por cada area. Areas desbalanceadas -> ${detalle}.`
    );
  }

  return runTransaction(async (session) => {
    await StudyPlanAssignment.deleteMany({ grade_id, academic_year_id }, { session });

    // El validador Joi exige asignaciones.min(1), asi que siempre hay al menos un item aqui.
    const docs = await StudyPlanAssignment.create(
      asignaciones.map((a) => ({
        grade_id,
        subject_id: a.subject_id,
        academic_year_id,
        porcentaje_en_area: a.porcentaje_en_area,
      })),
      { session, ordered: true }
    );

    return docs;
  });
}
