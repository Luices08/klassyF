import { Types } from 'mongoose';
import { EstadoPeriodo } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Group from '../models/group.model';
import PeriodLock, { PeriodLockDocument } from '../models/periodLock.model';
import ApiError from '../utils/ApiError';

export interface SetPeriodLockInput {
  academic_year_id: string;
  periodo_numero: number;
  group_id: string;
  estado: EstadoPeriodo;
}

/**
 * Abre o cierra formalmente un periodo para un grupo especifico. Upsert: si no
 * existia PeriodLock para esa combinacion, se crea; si existia, se actualiza.
 */
export async function setPeriodLock(input: SetPeriodLockInput): Promise<PeriodLockDocument> {
  const academicYear = await AcademicYear.findById(input.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(group.academic_year_id) !== String(input.academic_year_id)) {
    throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
  }

  const lock = await PeriodLock.findOneAndUpdate(
    {
      academic_year_id: input.academic_year_id,
      periodo_numero: input.periodo_numero,
      group_id: input.group_id,
    },
    { $set: { estado: input.estado } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return lock;
}

/**
 * Bloqueo extemporaneo: toda mutacion de nota debe pasar por aqui. La ausencia
 * de un PeriodLock para la combinacion (año, grupo, periodo) se interpreta como
 * ABIERTO por defecto (no es necesario pre-crear un registro para cada grupo).
 */
export async function assertPeriodNotLocked(
  academicYearId: Types.ObjectId | string,
  groupId: Types.ObjectId | string,
  periodoNumero: number
): Promise<void> {
  const lock = await PeriodLock.findOne({
    academic_year_id: academicYearId,
    group_id: groupId,
    periodo_numero: periodoNumero,
  });

  if (lock && lock.estado === 'CERRADO') {
    throw new ApiError(
      409,
      `El periodo ${periodoNumero} para este grupo se encuentra CERRADO; no se pueden modificar notas.`
    );
  }
}
