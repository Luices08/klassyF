import { Types } from 'mongoose';
import { Rol } from '../constants/enums';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import User from '../models/user.model';

/** Usuarios activos que tienen alguno de esos roles; `sedeId` limita a quienes atienden esa sede (ADMIN y COORDINADOR ven todas). */
export async function usuariosConRol(roles: Rol[], sedeId?: Types.ObjectId | string): Promise<Types.ObjectId[]> {
  const filtro: Record<string, unknown> = { roles: { $in: roles }, estado: ESTADO_ACTIVO };
  if (sedeId) {
    filtro.$or = [{ roles: { $in: ['ADMIN', 'COORDINADOR'] satisfies Rol[] } }, { sedes_ids: new Types.ObjectId(String(sedeId)) }];
  }
  return (await User.find(filtro).select('_id').lean()).map((u) => u._id as Types.ObjectId);
}

/** Cuentas de portal (M27) de los acudientes activos de un estudiante. Un acudiente sin portal habilitado no tiene dónde recibir el aviso. */
export async function acudientesConPortalDe(estudiantes: Array<Types.ObjectId | string>): Promise<Types.ObjectId[]> {
  if (estudiantes.length === 0) return [];
  const vinculos = await StudentGuardian.find({ student_id: { $in: estudiantes } }).select('guardian_id').lean();
  const acudientes = await Guardian.find({ _id: { $in: vinculos.map((v) => v.guardian_id) }, estado: ESTADO_ACTIVO, user_id: { $ne: null } })
    .select('user_id')
    .lean();
  return acudientes.map((a) => a.user_id as Types.ObjectId);
}
