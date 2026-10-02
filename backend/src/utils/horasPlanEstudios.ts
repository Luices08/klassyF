import type { IGradoPlan, IPersonalizacionGrupo } from '../models/studyPlan.model';

/** Horas semanales de un grupo: la base del grado, con sus intensidades personalizadas y asignaturas agregadas. */
export function horasSemanalesDelGrupo(
  grado: IGradoPlan,
  personalizacion?: Pick<IPersonalizacionGrupo, 'intensidades_personalizadas' | 'asignaturas_agregadas'>
): number {
  const overrides = new Map(
    (personalizacion?.intensidades_personalizadas ?? []).map((i) => [String(i.subject_id), i.intensidad_horaria_semanal])
  );
  const base = grado.asignaturas.reduce(
    (suma, a) => suma + (overrides.get(String(a.subject_id)) ?? a.intensidad_horaria_semanal),
    0
  );
  const agregadas = (personalizacion?.asignaturas_agregadas ?? []).reduce(
    (suma, a) => suma + a.intensidad_horaria_semanal,
    0
  );
  return base + agregadas;
}

/**
 * Horas semanales de una asignatura en un grupo: la intensidad personalizada del grupo, si la hay; si no,
 * la de la asignatura agregada solo a ese grupo; si no, la de la Configuración General del grado.
 * Undefined si el plan ya no incluye esa asignatura para el grupo.
 */
export function horasDeAsignaturaEnGrupo(grado: IGradoPlan, groupId: string, subjectId: string): number | undefined {
  const personalizacion = grado.personalizaciones_grupo.find((p) => String(p.group_id) === groupId);
  const porId = (a: { subject_id: unknown }) => String(a.subject_id) === subjectId;

  return (
    personalizacion?.intensidades_personalizadas.find(porId)?.intensidad_horaria_semanal ??
    personalizacion?.asignaturas_agregadas.find(porId)?.intensidad_horaria_semanal ??
    grado.asignaturas.find(porId)?.intensidad_horaria_semanal
  );
}
