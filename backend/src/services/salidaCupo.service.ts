import { ClientSession, Types } from 'mongoose';
import { EstadoPazYSalvoSalida, PoliticaCupoSalida } from '../constants/salidas';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Institution from '../models/institution.model';
import { cupoDebeLiberarse } from '../utils/salidas';

/** La política de la institución sobre cuándo se libera el cupo de quien sale (por defecto, de inmediato). */
export async function politicaDeCupo(session?: ClientSession): Promise<PoliticaCupoSalida> {
  const institucion = await Institution.findOne().select('politica_cupo_salida').session(session ?? null).lean();
  return institucion?.politica_cupo_salida ?? 'INMEDIATA';
}

/**
 * Libera el cupo del grupo una sola vez por salida, si la política lo permite en este momento. La marca `cupo_liberado` se cambia con un filtro
 * condicional: dos aprobaciones simultáneas no descuentan dos veces. Devuelve si este llamado fue el que lo liberó.
 */
export async function liberarCupoDeSalida(
  enrollmentId: Types.ObjectId,
  groupId: Types.ObjectId,
  politica: PoliticaCupoSalida,
  estadoPazYSalvo: EstadoPazYSalvoSalida,
  session: ClientSession
): Promise<boolean> {
  if (!cupoDebeLiberarse(politica, estadoPazYSalvo, false)) return false;
  const marcada = await Enrollment.updateOne(
    { _id: enrollmentId, 'salida.cupo_liberado': false },
    { $set: { 'salida.cupo_liberado': true, 'salida.fecha_cupo_liberado': new Date() } },
    { session }
  );
  if (marcada.modifiedCount !== 1) return false;
  await Group.findOneAndUpdate({ _id: groupId, cupos_ocupados: { $gt: 0 } }, { $inc: { cupos_ocupados: -1 } }, { session });
  return true;
}
