import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { EstadoMatricula } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import Group from '../models/group.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';
import { generateFolio } from './folio.service';

const ESTADOS_QUE_LIBERAN_CUPO: EstadoMatricula[] = ['RETIRADO', 'TRASLADADO'];
const ESTADOS_TERMINALES: EstadoMatricula[] = ['RETIRADO', 'TRASLADADO'];

export interface CreateEnrollmentInput {
  student_id: string | Types.ObjectId;
  group_id: string | Types.ObjectId;
  academic_year_id: string | Types.ObjectId;
}

/**
 * Ejecuta la matricula de un estudiante en un grupo de forma segura ante
 * condiciones de carrera:
 *  1. Transaccion atomica de MongoDB (session.startTransaction(), con
 *     reintento ante TransientTransactionError - ver utils/runTransaction).
 *  2. Verificacion Y reserva del cupo en una unica operacion atomica
 *     (findOneAndUpdate con $expr: cupos_ocupados < cupo_maximo), lo que
 *     impide que dos matriculas concurrentes sobrepasen el cupo_maximo
 *     incluso si llegan en el mismo instante.
 *  3. Si no hay cupo disponible, se hace rollback y se lanza 409 Conflict.
 */
export async function createEnrollment({
  student_id,
  group_id,
  academic_year_id,
}: CreateEnrollmentInput): Promise<EnrollmentDocument> {
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

    // Check-and-reserve atomico: solo actualiza si aun hay cupo disponible.
    const updatedGroup = await Group.findOneAndUpdate(
      {
        _id: group_id,
        academic_year_id,
        $expr: { $lt: ['$cupos_ocupados', '$cupo_maximo'] },
      },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );

    if (!updatedGroup) {
      const group = await Group.findById(group_id).session(session);
      if (!group) throw new ApiError(404, 'Grupo no encontrado.');
      if (String(group.academic_year_id) !== String(academic_year_id)) {
        throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
      }
      throw new ApiError(409, 'Sin cupos disponibles en el grupo seleccionado.');
    }

    const folio_matricula = await generateFolio(academicYear.year, session);

    const [enrollment] = await Enrollment.create(
      [
        {
          student_id,
          group_id,
          academic_year_id,
          folio_matricula,
          estado: 'MATRICULADO',
          fecha_matricula: new Date(),
        },
      ],
      { session }
    );
    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matricula.');

    return enrollment;
  });
}

/**
 * Cambia el estado de una matricula (retiro/traslado/etc). Si el nuevo estado
 * libera el cupo (RETIRADO o TRASLADADO), decrementa cupos_ocupados de forma
 * atomica dentro de la misma transaccion.
 */
export async function updateEnrollmentStatus(
  enrollmentId: string | Types.ObjectId,
  nuevoEstado: EstadoMatricula
): Promise<EnrollmentDocument> {
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

    enrollment.estado = nuevoEstado;
    await enrollment.save({ session });

    if (ESTADOS_QUE_LIBERAN_CUPO.includes(nuevoEstado)) {
      await Group.findOneAndUpdate(
        { _id: enrollment.group_id, cupos_ocupados: { $gt: 0 } },
        { $inc: { cupos_ocupados: -1 } },
        { session }
      );
    }

    return enrollment;
  });
}
