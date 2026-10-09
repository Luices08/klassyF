import { Types } from 'mongoose';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import ApiError from '../utils/ApiError';

/**
 * Una planilla con notas CERRADAS o DEFINITIVAS es la fuente oficial del boletín (M17): ni se califican actividades ni se
 * programan, mueven o eliminan actividades de esa clase y periodo hasta reabrirla (con motivo, y quedando auditado).
 */
export async function exigirPlanillaAbierta(
  teacherAssignmentId: Types.ObjectId | string,
  periodoNumero: number,
  accion = 'modificar las notas'
): Promise<void> {
  const cerrada = await CalificacionAsignatura.exists({
    teacher_assignment_id: teacherAssignmentId,
    periodo_numero: periodoNumero,
    estado: { $in: ESTADOS_NOTA_CERRADOS },
  });
  if (cerrada) {
    throw new ApiError(409, `La planilla de notas del periodo ${periodoNumero} está cerrada: reábrela (con motivo) para ${accion}.`);
  }
}
