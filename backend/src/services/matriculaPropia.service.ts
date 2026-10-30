import { Types } from 'mongoose';
import Enrollment from '../models/enrollment.model';
import { UserDocument } from '../models/user.model';
import { matriculaVigente } from '../utils/portalAcudiente';

/** La matrícula del propio estudiante tal como la muestra su inicio: solo lee (M04), sin documentos ni datos de otros. */
export interface MatriculaPropia {
  estado: string;
  anio: number;
  grado: string;
  grupo: string;
  sede: string;
  jornada: string;
}

interface GrupoConDetalle {
  nomenclatura: string;
  grade_id?: { nombre: string } | null;
  sede_id?: { nombre: string } | null;
  jornada_id?: { nombre: string } | null;
}

/** La matrícula vigente del estudiante (la misma regla del portal del acudiente), o `null` si aún no tiene ninguna. */
export async function miMatricula(usuario: UserDocument): Promise<MatriculaPropia | null> {
  const matriculas = await Enrollment.find({ student_id: usuario._id })
    .sort({ createdAt: -1 })
    .populate({
      path: 'group_id',
      populate: [
        { path: 'grade_id', select: 'nombre' },
        { path: 'sede_id', select: 'nombre' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    })
    .populate<{ academic_year_id: { _id: Types.ObjectId; year: number } }>('academic_year_id', 'year');

  const vigente = matriculaVigente(matriculas);
  const grupo = vigente ? (vigente.group_id as unknown as GrupoConDetalle | null) : null;
  if (!vigente || !grupo) return null;
  return {
    estado: vigente.estado,
    anio: vigente.academic_year_id.year,
    grado: grupo.grade_id?.nombre ?? '—',
    grupo: grupo.nomenclatura,
    sede: grupo.sede_id?.nombre ?? '—',
    jornada: grupo.jornada_id?.nombre ?? '—',
  };
}
