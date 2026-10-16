import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Activity, { ActivityDocument } from '../models/activity.model';
import Enrollment from '../models/enrollment.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { asignacionDelDocente } from './activity.service';

export interface AccesoALaActividad {
  actividad: ActivityDocument;
  asignacion: TeacherAssignmentDocument;
  /** El docente titular (puede cambiarla) frente a coordinación o administración (solo consultan). */
  esTitular: boolean;
}

/**
 * Quién puede ver una actividad y todo lo que cuelga de ella (adjuntos, comentarios, entregas): el docente titular, coordinación y
 * administración, y los estudiantes matriculados en su grupo una vez publicada. «No existe», «no es tu grupo» y «aún no se publica»
 * responden igual para el estudiante: no se revela lo que no ve.
 */
export async function exigirAccesoALaActividad(actividadId: string, usuario: UserDocument): Promise<AccesoALaActividad> {
  const actividad = await Activity.findById(actividadId);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');

  if (usuario.rol === ROLES.DOCENTE) {
    const asignacion = await asignacionDelDocente(actividad.teacher_assignment_id, usuario);
    return { actividad, asignacion, esTitular: true };
  }

  const asignacion = await TeacherAssignment.findById(actividad.teacher_assignment_id);
  if (!asignacion) throw new ApiError(404, 'Actividad no encontrada.');

  if (usuario.rol === ROLES.ESTUDIANTE) {
    const matriculado =
      actividad.fecha_apertura <= new Date() &&
      (await Enrollment.exists({ student_id: usuario._id, group_id: asignacion.group_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }));
    if (!matriculado) throw new ApiError(404, 'Actividad no encontrada.');
    return { actividad, asignacion, esTitular: false };
  }

  if (usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR) return { actividad, asignacion, esTitular: false };
  throw new ApiError(403, 'No tienes acceso a esta actividad.');
}
