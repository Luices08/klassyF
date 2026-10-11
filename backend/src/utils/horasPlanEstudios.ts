import type { IGradoPlan, IPersonalizacionGrupo, IPersonalizacionJornada } from '../models/studyPlan.model';

/**
 * Calcula la capacidad semanal en periodos de clase de una JornadaOperativa
 * a partir de sus franjas de tipo CLASE y sus días hábiles.
 */
export function capacidadPeriodosSemanaJornada(jornada?: {
  dias_habiles?: number[];
  franjas?: Array<{ tipo: string }>;
} | null): number {
  if (!jornada) return 0;
  const franjasClase = (jornada.franjas ?? []).filter((f) => f.tipo === 'CLASE').length;
  const dias = (jornada.dias_habiles ?? []).length;
  return franjasClase * dias;
}

/**
 * Horas semanales configuradas para una jornada específica en un grado:
 * la base del grado combinada con los ajustes propios de la jornada.
 */
export function horasSemanalesDeJornada(
  grado: IGradoPlan,
  personalizacion?: Pick<IPersonalizacionJornada, 'intensidades_personalizadas' | 'asignaturas_agregadas'>
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
 * Horas semanales de un grupo: la base del grado, con la posible personalización
 * de su jornada y las intensidades y asignaturas exclusivas del propio grupo.
 */
export function horasSemanalesDelGrupo(
  grado: IGradoPlan,
  personalizacion?: Pick<IPersonalizacionGrupo, 'intensidades_personalizadas' | 'asignaturas_agregadas'>,
  personalizacionJornada?: Pick<IPersonalizacionJornada, 'intensidades_personalizadas' | 'asignaturas_agregadas'>
): number {
  const overridesJornada = new Map(
    (personalizacionJornada?.intensidades_personalizadas ?? []).map((i) => [String(i.subject_id), i.intensidad_horaria_semanal])
  );
  const overridesGrupo = new Map(
    (personalizacion?.intensidades_personalizadas ?? []).map((i) => [String(i.subject_id), i.intensidad_horaria_semanal])
  );

  const base = grado.asignaturas.reduce((suma, a) => {
    const subId = String(a.subject_id);
    const hora = overridesGrupo.get(subId) ?? overridesJornada.get(subId) ?? a.intensidad_horaria_semanal;
    return suma + hora;
  }, 0);

  const agregadasJornadaMap = new Map(
    (personalizacionJornada?.asignaturas_agregadas ?? []).map((a) => [String(a.subject_id), a.intensidad_horaria_semanal])
  );
  const agregadasGrupoMap = new Map(
    (personalizacion?.asignaturas_agregadas ?? []).map((a) => [String(a.subject_id), a.intensidad_horaria_semanal])
  );

  const todasAgregadasIds = new Set([...agregadasJornadaMap.keys(), ...agregadasGrupoMap.keys()]);
  let sumaAgregadas = 0;
  for (const id of todasAgregadasIds) {
    sumaAgregadas += agregadasGrupoMap.get(id) ?? agregadasJornadaMap.get(id) ?? 0;
  }

  return base + sumaAgregadas;
}

/**
 * Horas semanales de una asignatura en un grupo:
 * 1. Override específico del grupo.
 * 2. Asignatura agregada al grupo.
 * 3. Override de la jornada del grupo.
 * 4. Asignatura agregada a la jornada.
 * 5. Configuración General del grado base.
 * Undefined si el plan no incluye esa asignatura para el grupo.
 */
export function horasDeAsignaturaEnGrupo(
  grado: IGradoPlan,
  groupId: string,
  subjectId: string,
  jornadaId?: string
): number | undefined {
  const personalizacion = grado.personalizaciones_grupo.find((p) => String(p.group_id) === groupId);
  const personalizacionJornada = jornadaId
    ? grado.jornadas_personalizadas?.find((j) => String(j.jornada_id) === jornadaId)
    : undefined;
  const porId = (a: { subject_id: unknown }) => String(a.subject_id) === subjectId;

  return (
    personalizacion?.intensidades_personalizadas.find(porId)?.intensidad_horaria_semanal ??
    personalizacion?.asignaturas_agregadas.find(porId)?.intensidad_horaria_semanal ??
    personalizacionJornada?.intensidades_personalizadas.find(porId)?.intensidad_horaria_semanal ??
    personalizacionJornada?.asignaturas_agregadas.find(porId)?.intensidad_horaria_semanal ??
    grado.asignaturas.find(porId)?.intensidad_horaria_semanal
  );
}
