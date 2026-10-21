import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';

const ids = (lista: Array<Types.ObjectId | string>): string[] => lista.map(String);

/** Lo que el módulo de noticias necesita saber de dónde está cada quien (año de trabajo, grupos, grados y sedes). Lo comparten quien lee y quien avisa. */

/** El año sobre el que se trabaja: la vigencia activa o, si no hay, el más reciente sin cerrar. Las noticias por grupo se resuelven contra sus grupos. */
export async function anioDeTrabajo() {
  return (await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('_id')) ?? (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1, createdAt: -1 }).select('_id'));
}


/** Los grupos de un conjunto de estudiantes en el año de trabajo, con su grado y su sede. */
export async function ubicacionDeEstudiantes(estudiantesIds: Array<Types.ObjectId | string>, anioId: Types.ObjectId) {
  if (estudiantesIds.length === 0) return { grupos: [] as string[], grados: [] as string[], sedes: [] as string[] };
  const matriculas = await Enrollment.find({ student_id: { $in: estudiantesIds }, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).select('group_id').lean();
  return ubicacionDeGrupos(matriculas.map((m) => m.group_id));
}


export async function ubicacionDeGrupos(gruposIds: Array<Types.ObjectId | string>) {
  const grupos = await Group.find({ _id: { $in: gruposIds } }).select('grade_id sede_id').lean();
  return {
    grupos: ids(grupos.map((g) => g._id)),
    grados: [...new Set(ids(grupos.map((g) => g.grade_id)))],
    sedes: [...new Set(ids(grupos.map((g) => g.sede_id)))],
  };
}


/** Los grupos donde el docente dicta clase o dirige (carga de M08 y director de grupo de M01), en el año de trabajo. */
export async function gruposDelDocente(docenteId: Types.ObjectId, anioId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const [asignaciones, dirigidos] = await Promise.all([
    TeacherAssignment.find({ docente_id: docenteId, academic_year_id: anioId, estado: ESTADO_ACTIVO, tipo_asignacion: { $in: ['CLASE', 'DIRECCION_GRUPO'] }, group_id: { $ne: null } }).select('group_id').lean(),
    Group.find({ director_grupo_id: docenteId, academic_year_id: anioId }).select('_id').lean(),
  ]);
  const todos = new Map<string, Types.ObjectId>();
  for (const a of asignaciones) if (a.group_id) todos.set(String(a.group_id), a.group_id);
  for (const g of dirigidos) todos.set(String(g._id), g._id);
  return [...todos.values()];
}

