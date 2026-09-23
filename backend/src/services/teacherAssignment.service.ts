import AcademicYear from '../models/academicYear.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { ROLES } from '../constants/roles';
import ApiError from '../utils/ApiError';

export interface CreateTeacherAssignmentInput {
  docente_id: string;
  group_id: string;
  subject_id: string;
  academic_year_id: string;
  horas_semanales: number;
}

export async function createTeacherAssignment(
  input: CreateTeacherAssignmentInput
): Promise<TeacherAssignmentDocument> {
  const docente = await User.findOne({ _id: input.docente_id, rol: ROLES.DOCENTE });
  if (!docente) {
    throw new ApiError(404, 'El usuario no existe o no tiene rol DOCENTE.');
  }
  if (docente.estado !== 'activo') {
    throw new ApiError(409, 'El docente se encuentra inactivo.');
  }

  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');

  const subject = await Subject.findById(input.subject_id);
  if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

  const academicYear = await AcademicYear.findById(input.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  // El indice unico compuesto {docente_id, group_id, subject_id, academic_year_id}
  // del modelo protege contra duplicados a nivel de base de datos; el middleware
  // centralizado de errores traduce el 11000 resultante a un 409 legible.
  return TeacherAssignment.create(input);
}
