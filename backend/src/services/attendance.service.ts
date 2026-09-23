import { EstadoAsistencia } from '../constants/enums';
import Attendance, { AttendanceDocument } from '../models/attendance.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';

export interface AttendanceRegistroInput {
  student_id: string;
  estado: EstadoAsistencia;
  observacion?: string;
}

export interface RegisterAttendanceInput {
  group_id: string;
  subject_id: string;
  fecha: string | Date;
  periodo_numero: number;
  registros: AttendanceRegistroInput[];
}

/** Normaliza la fecha a medianoche UTC para que la unicidad {group,subject,fecha} sea por dia calendario. */
function normalizeFecha(fecha: string | Date): Date {
  const d = new Date(fecha);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Registra (o reemplaza) la planilla de asistencia de un grupo+asignatura+dia en
 * un solo lote. Solo el docente con una TeacherAssignment activa para esa
 * materia/grupo/año puede tomar asistencia; todos los estudiantes reportados
 * deben estar MATRICULADOS en el grupo.
 */
export async function registerAttendance(
  input: RegisterAttendanceInput,
  requestingUser: UserDocument
): Promise<AttendanceDocument> {
  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');

  const subject = await Subject.findById(input.subject_id);
  if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

  const assignment = await TeacherAssignment.findOne({
    docente_id: requestingUser._id,
    group_id: input.group_id,
    subject_id: input.subject_id,
    academic_year_id: group.academic_year_id,
  });
  if (!assignment) {
    throw new ApiError(403, 'No tiene una asignacion academica activa para esta materia y grupo.');
  }

  const studentIds = input.registros.map((r) => r.student_id);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new ApiError(400, 'No se puede registrar mas de un estado de asistencia para el mismo estudiante.');
  }

  const enrollments = await Enrollment.find({
    student_id: { $in: studentIds },
    group_id: input.group_id,
    estado: 'MATRICULADO',
  });
  const enrolledSet = new Set(enrollments.map((e) => String(e.student_id)));
  const noMatriculados = studentIds.filter((id) => !enrolledSet.has(id));
  if (noMatriculados.length > 0) {
    throw new ApiError(400, `Los siguientes estudiantes no estan matriculados en el grupo: ${noMatriculados.join(', ')}.`);
  }

  const fecha = normalizeFecha(input.fecha);

  const attendance = await Attendance.findOneAndUpdate(
    { group_id: input.group_id, subject_id: input.subject_id, fecha },
    {
      $set: {
        periodo_numero: input.periodo_numero,
        registros: input.registros.map((r) => ({
          student_id: r.student_id,
          estado: r.estado,
          observacion: r.observacion ?? '',
        })),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return attendance;
}
