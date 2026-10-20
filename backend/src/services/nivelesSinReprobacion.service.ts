import { Types } from 'mongoose';
import { NIVELES_SIN_REPROBACION } from '../constants/promocion';
import Grade from '../models/grade.model';
import Group from '../models/group.model';

/** Los grados donde nadie reprueba (Preescolar, Decreto 2247/1997): se leen del catálogo por su nivel, nunca por número de grado. */
export async function idsDeGradosSinReprobacion(): Promise<string[]> {
  const grados = await Grade.find({ nivel: { $in: NIVELES_SIN_REPROBACION } }).select('_id').lean();
  return grados.map((g) => String(g._id));
}

/** ¿El grupo es de un grado sin reprobación? M18 y M20 no tratan a sus estudiantes como recuperables ni en riesgo de perder el año. */
export async function esGrupoSinReprobacion(groupId: string | Types.ObjectId): Promise<boolean> {
  const grupo = await Group.findById(groupId).select('grade_id').lean();
  if (!grupo) return false;
  return (await idsDeGradosSinReprobacion()).includes(String(grupo.grade_id));
}
