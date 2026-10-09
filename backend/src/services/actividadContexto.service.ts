import { Types } from 'mongoose';
import TeacherAssignment from '../models/teacherAssignment.model';

/** Lugar de una actividad en la jerarquía de M06/M08: nunca se copia a la actividad, se lee por la asignación académica. */
export interface ContextoAsignacion {
  _id: string;
  academic_year_id: string;
  docente: { _id: string; nombre: string; apellido: string } | null;
  grupo: { _id: string; nomenclatura: string } | null;
  grado: { _id: string; nombre: string; numero: number } | null;
  asignatura: { _id: string; nombre: string } | null;
  area: { _id: string; nombre: string } | null;
}

interface AsignacionPoblada {
  _id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  docente_id: { _id: Types.ObjectId; nombre: string; apellido: string } | null;
  group_id: {
    _id: Types.ObjectId;
    nomenclatura: string;
    grade_id: { _id: Types.ObjectId; nombre: string; numero: number } | null;
  } | null;
  subject_id: {
    _id: Types.ObjectId;
    nombre: string;
    area_id: { _id: Types.ObjectId; nombre: string } | null;
  } | null;
}

export async function contextosDeAsignaciones(ids: ReadonlyArray<Types.ObjectId | string>): Promise<Map<string, ContextoAsignacion>> {
  if (ids.length === 0) return new Map();

  const asignaciones = (await TeacherAssignment.find({ _id: { $in: ids } })
    .populate('docente_id', 'nombre apellido')
    .populate({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre numero' } })
    .populate({ path: 'subject_id', select: 'nombre area_id', populate: { path: 'area_id', select: 'nombre' } })
    .lean()) as unknown as AsignacionPoblada[];

  return new Map(
    asignaciones.map((a) => [
      String(a._id),
      {
        _id: String(a._id),
        academic_year_id: String(a.academic_year_id),
        docente: a.docente_id ? { _id: String(a.docente_id._id), nombre: a.docente_id.nombre, apellido: a.docente_id.apellido } : null,
        grupo: a.group_id ? { _id: String(a.group_id._id), nomenclatura: a.group_id.nomenclatura } : null,
        grado: a.group_id?.grade_id
          ? { _id: String(a.group_id.grade_id._id), nombre: a.group_id.grade_id.nombre, numero: a.group_id.grade_id.numero }
          : null,
        asignatura: a.subject_id ? { _id: String(a.subject_id._id), nombre: a.subject_id.nombre } : null,
        area: a.subject_id?.area_id ? { _id: String(a.subject_id.area_id._id), nombre: a.subject_id.area_id.nombre } : null,
      },
    ])
  );
}
