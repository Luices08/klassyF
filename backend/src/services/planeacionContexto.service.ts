import { Types } from 'mongoose';
import { TIPO_DE_JORNADA, TipoJornada } from '../constants/planeacion';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';

/**
 * Lo que M07 lee de la carga docente (M08): quién dicta qué en cada grado. El plan de aula es por grado y no por grupo, así que
 * las clases se agrupan por (docente, asignatura, grado). Aquí solo se lee: M07 no crea ni cambia asignaciones.
 */

export interface ClaseAgrupada {
  docente_id: string;
  subject_id: string;
  grade_id: string;
  /** Nomenclatura de los grupos de ese grado que el docente dicta, ordenadas. */
  grupos: string[];
  /** La asignación más antigua del conjunto: cuándo empezó a dictar esa asignatura en ese grado. */
  asignado_desde: Date;
  /** Dónde se dicta: la jornada (diurna o nocturna) y la sede de cada grupo, sin repetir. Decide qué líder de área aplica. */
  ubicaciones: Array<{ jornada: TipoJornada; sede_id: string }>;
}

export const claveDeClase = (docenteId: string | Types.ObjectId, subjectId: string | Types.ObjectId, gradeId: string | Types.ObjectId): string =>
  `${String(docenteId)}|${String(subjectId)}|${String(gradeId)}`;

export interface FiltroClases {
  academic_year_id: string | Types.ObjectId;
  docente_id?: string | Types.ObjectId;
  subject_ids?: Array<string | Types.ObjectId>;
}

/** Las clases activas del año (asignaciones CLASE de M08) agrupadas por (docente, asignatura, grado). */
export async function clasesActivasAgrupadas(filtro: FiltroClases): Promise<ClaseAgrupada[]> {
  const asignaciones = await TeacherAssignment.find({
    academic_year_id: filtro.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    ...(filtro.docente_id ? { docente_id: filtro.docente_id } : {}),
    ...(filtro.subject_ids ? { subject_id: { $in: filtro.subject_ids } } : {}),
  })
    .select('docente_id group_id subject_id createdAt')
    .lean();

  const grupos = await Group.find({ _id: { $in: asignaciones.map((a) => a.group_id).filter(Boolean) } })
    .select('grade_id nomenclatura sede_id jornada_id')
    .lean();
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));
  const jornadas = await JornadaOperativa.find({ _id: { $in: [...new Set(grupos.map((g) => String(g.jornada_id)))] } })
    .select('nombre')
    .lean();
  const tipoDeJornada = new Map(jornadas.map((j) => [String(j._id), TIPO_DE_JORNADA[j.nombre]]));

  const agrupadas = new Map<string, ClaseAgrupada>();
  for (const a of asignaciones) {
    const grupo = a.group_id ? grupoPorId.get(String(a.group_id)) : undefined;
    if (!grupo || !a.subject_id) continue;

    const ubicacion = { jornada: tipoDeJornada.get(String(grupo.jornada_id)) ?? 'DIURNA', sede_id: String(grupo.sede_id) };
    const clave = claveDeClase(a.docente_id, a.subject_id, grupo.grade_id);
    const previa = agrupadas.get(clave);
    if (previa) {
      previa.grupos.push(grupo.nomenclatura);
      if (a.createdAt < previa.asignado_desde) previa.asignado_desde = a.createdAt;
      if (!previa.ubicaciones.some((u) => u.jornada === ubicacion.jornada && u.sede_id === ubicacion.sede_id)) previa.ubicaciones.push(ubicacion);
    } else {
      agrupadas.set(clave, {
        docente_id: String(a.docente_id),
        subject_id: String(a.subject_id),
        grade_id: String(grupo.grade_id),
        grupos: [grupo.nomenclatura],
        asignado_desde: a.createdAt,
        ubicaciones: [ubicacion],
      });
    }
  }
  return [...agrupadas.values()].map((c) => ({ ...c, grupos: [...c.grupos].sort((x, y) => x.localeCompare(y, 'es')) }));
}

/** Las áreas en las que un docente dicta alguna asignatura en el año. */
export async function areasDondeImparte(docenteId: string | Types.ObjectId, anioId: string | Types.ObjectId): Promise<Set<string>> {
  const clases = await clasesActivasAgrupadas({ academic_year_id: anioId, docente_id: docenteId });
  if (clases.length === 0) return new Set();
  const asignaturas = await Subject.find({ _id: { $in: [...new Set(clases.map((c) => c.subject_id))] } }).select('area_id').lean();
  return new Set(asignaturas.map((s) => String(s.area_id)));
}

/**
 * Las claves (docente, asignatura, grado) que hoy tienen una clase activa. Un plan cuya clave no está aquí quedó archivado:
 * su dueño ya no dicta esa asignatura en ese grado.
 */
export async function clavesConClaseActiva(anioId: string | Types.ObjectId, subjectIds: Array<string | Types.ObjectId>): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();
  const clases = await clasesActivasAgrupadas({ academic_year_id: anioId, subject_ids: subjectIds });
  return new Set(clases.map((c) => claveDeClase(c.docente_id, c.subject_id, c.grade_id)));
}
