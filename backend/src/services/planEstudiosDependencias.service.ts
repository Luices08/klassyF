import { Types } from 'mongoose';
import Activity from '../models/activity.model';
import Group from '../dominios/institucional/estructura/group.model';
import { StudyPlanDocument } from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { horasDeAsignaturaEnGrupo } from '../utils/horasPlanEstudios';

/**
 * Qué datos de otros módulos dependen del plan de estudios (M06). Con el año EN_CURSO el plan no se
 * congela entero: se bloquea solo lo que ya tiene algo calculado encima. Las horas semanales no entran
 * en el cálculo de notas (solo la malla y la ponderación), por eso pueden corregirse y propagarse.
 */

/** Un grado completo, o un solo grupo (distribución por grupos). */
export type AlcancePlan = { grade_id: string } | { group_id: string };

async function idsDeGrupos(academicYearId: string, alcance: AlcancePlan): Promise<Types.ObjectId[]> {
  const filtro = 'group_id' in alcance ? { _id: alcance.group_id } : { grade_id: alcance.grade_id };
  return Group.find({ academic_year_id: academicYearId, ...filtro }).distinct('_id');
}

/**
 * Quitar una asignatura del plan dejaría una asignación docente (M08) apuntando a una materia que el
 * grupo ya no cursa, con horas que ya no salen de ningún plan: se retira la asignación primero.
 */
export async function exigirSinAsignacionesActivas(
  academicYearId: string,
  alcance: AlcancePlan,
  subjectIds: string[]
): Promise<void> {
  if (subjectIds.length === 0) return;

  const asignacion = await TeacherAssignment.findOne({
    academic_year_id: academicYearId,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    group_id: { $in: await idsDeGrupos(academicYearId, alcance) },
    subject_id: { $in: subjectIds },
  })
    .populate('subject_id', 'nombre')
    .populate('group_id', 'nomenclatura');

  if (asignacion) {
    const materia = (asignacion.subject_id as unknown as { nombre?: string } | null)?.nombre ?? 'la asignatura';
    const grupo = (asignacion.group_id as unknown as { nomenclatura?: string } | null)?.nomenclatura ?? '';
    throw new ApiError(
      409,
      `"${materia}" ya tiene docente asignado${grupo ? ` en el grupo ${grupo}` : ''} (M08). ` +
        'Retira esa asignación antes de quitarla del plan de estudios.'
    );
  }
}

/** Las asignaturas cuyo cambio de malla o ponderación afecta el resultado de su área. */
export async function areasDeAsignaturas(subjectIds: string[]): Promise<string[]> {
  if (subjectIds.length === 0) return [];
  const areas = await Subject.find({ _id: { $in: subjectIds } }).distinct('area_id');
  return areas.map(String);
}

/**
 * Cambiar la composición o la ponderación de un área cuando ya hay actividades registradas en ella
 * recalcularía resultados que ya existen (el boletín lee el plan en vivo): se bloquea.
 */
export async function exigirAreasSinActividades(
  academicYearId: string,
  alcance: AlcancePlan,
  areaIds: string[]
): Promise<void> {
  if (areaIds.length === 0) return;

  const subjectsDelArea = await Subject.find({ area_id: { $in: areaIds } }).distinct('_id');
  const asignaciones = await TeacherAssignment.find({
    academic_year_id: academicYearId,
    tipo_asignacion: 'CLASE',
    group_id: { $in: await idsDeGrupos(academicYearId, alcance) },
    subject_id: { $in: subjectsDelArea },
  }).distinct('_id');

  if (asignaciones.length > 0 && (await Activity.exists({ teacher_assignment_id: { $in: asignaciones } }))) {
    throw new ApiError(
      409,
      'Ya hay actividades o notas registradas en el área de este cambio para ' +
        `${'group_id' in alcance ? 'el grupo' : 'el grado'}: modificar su composición o ponderación alteraría ` +
        'resultados ya calculados. Solo las horas semanales pueden corregirse con el año en curso.'
    );
  }
}

/**
 * Las asignaciones de clase guardan las horas que el plan fijó al crearlas. Cuando el plan cambia, se
 * ponen al día; es idempotente, así que si algo falla a medias se corrige guardando el plan de nuevo.
 */
export async function sincronizarHorasDeAsignaciones(plan: StudyPlanDocument, gradeIds: string[]): Promise<number> {
  let actualizadas = 0;

  for (const gradeId of gradeIds) {
    const grado = plan.grades.find((g) => String(g.grade_id) === gradeId);
    if (!grado) continue;

    const grupos = await idsDeGrupos(String(plan.academic_year_id), { grade_id: gradeId });
    const asignaciones = await TeacherAssignment.find({
      academic_year_id: plan.academic_year_id,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
      group_id: { $in: grupos },
    });

    const operaciones = [];
    for (const a of asignaciones) {
      const horas = horasDeAsignaturaEnGrupo(grado, String(a.group_id), String(a.subject_id));
      if (horas !== undefined && horas !== a.horas_semanales) {
        operaciones.push({ updateOne: { filter: { _id: a._id }, update: { $set: { horas_semanales: horas } } } });
      }
    }
    if (operaciones.length > 0) await TeacherAssignment.bulkWrite(operaciones);
    actualizadas += operaciones.length;
  }

  return actualizadas;
}

/** Con el año EN_CURSO todo cambio al plan debe quedar justificado; antes de activarlo no hace falta. */
export function exigirMotivoSiAnioEnCurso(anio: { year: number; estado: string }, motivo?: string): string | undefined {
  if (anio.estado !== 'EN_CURSO') return undefined;
  const limpio = motivo?.trim();
  if (!limpio) {
    throw new ApiError(
      400,
      `El año lectivo ${anio.year} ya está en curso: indica el motivo del cambio al plan de estudios.`
    );
  }
  return limpio;
}
