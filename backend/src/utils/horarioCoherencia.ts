import { IGradoPlan } from '../models/studyPlan.model';
import { AsignacionMotor } from './motorHorarios';
import { horasDeAsignaturaEnGrupo, obtenerGradoPlanEfectivo } from './horasPlanEstudios';

/**
 * Coherencia de M09 con los demás módulos: las horas de una clase las fija el plan de estudios (M06) que rige en la sede y
 * jornada de su grupo, y la asignación docente (M08) solo guarda una copia que se pone al día cuando se guarda el plan.
 * Si esa copia quedó atrás (grupo creado o movido de jornada después, plan cambiado por otra vía), M09 programaría
 * horas que el plan ya no pide. Todo esto es puro y se prueba sin base de datos.
 */

export interface GrupoDelPlan {
  id: string;
  grade_id: string;
  sede_id: string;
  jornada_id: string;
}

/**
 * Asignaturas y horas semanales que el plan de estudios le da a UN grupo (base del grado, con lo de su jornada y lo propio
 * del grupo). `null` = el plan no tiene nada aplicable a ese grupo: no se infiere ninguna hora.
 */
export function horasDelPlanDeGrupo(
  plan: { grades?: IGradoPlan[] } | null | undefined,
  grupo: GrupoDelPlan
): Map<string, number> | null {
  const grado =
    obtenerGradoPlanEfectivo(plan, grupo.grade_id, grupo.sede_id, grupo.jornada_id) ??
    plan?.grades?.find((g) => String(g.grade_id) === grupo.grade_id);
  if (!grado) return null;

  const personalizacionGrupo = grado.personalizaciones_grupo.find((p) => String(p.group_id) === grupo.id);
  const personalizacionJornada = grado.jornadas_personalizadas?.find((j) => String(j.jornada_id) === grupo.jornada_id);
  const ids = new Set<string>([
    ...grado.asignaturas.map((a) => String(a.subject_id)),
    ...(personalizacionJornada?.asignaturas_agregadas ?? []).map((a) => String(a.subject_id)),
    ...(personalizacionGrupo?.asignaturas_agregadas ?? []).map((a) => String(a.subject_id)),
  ]);

  const horas = new Map<string, number>();
  for (const subjectId of ids) {
    const h = horasDeAsignaturaEnGrupo(grado, grupo.id, subjectId, grupo.jornada_id);
    if (h !== undefined) horas.set(subjectId, h);
  }
  return horas.size > 0 ? horas : null;
}

export interface CargaConciliada {
  /** La carga que sí se programa, con las horas del plan. */
  asignaciones: AsignacionMotor[];
  horas_corregidas: Array<{ asignacion_id: string; group_id: string; subject_id: string; antes: number; ahora: number }>;
  /** Tienen docente, pero la asignatura ya no está en el plan del grupo: no se programan. */
  fuera_del_plan: Array<{ asignacion_id: string; group_id: string; subject_id: string }>;
  /** Están en el plan del grupo y nadie las dicta todavía. */
  sin_docente: Array<{ group_id: string; subject_id: string; horas: number }>;
  /** Grupos para los que el plan no dice nada: se programa con las horas de la asignación. */
  grupos_sin_plan: string[];
}

export function conciliarCargaConPlan(
  asignaciones: readonly AsignacionMotor[],
  grupoIds: Iterable<string>,
  planes: ReadonlyMap<string, Map<string, number> | null>
): CargaConciliada {
  const resultado: CargaConciliada = { asignaciones: [], horas_corregidas: [], fuera_del_plan: [], sin_docente: [], grupos_sin_plan: [] };
  const dictadas = new Set<string>();

  for (const a of asignaciones) {
    dictadas.add(`${a.group_id}|${a.subject_id}`);
    const plan = planes.get(a.group_id);
    if (!plan) {
      resultado.asignaciones.push(a);
      continue;
    }
    const horas = plan.get(a.subject_id);
    if (horas === undefined) {
      resultado.fuera_del_plan.push({ asignacion_id: a.id, group_id: a.group_id, subject_id: a.subject_id });
      continue;
    }
    if (horas !== a.horas_semanales) {
      resultado.horas_corregidas.push({ asignacion_id: a.id, group_id: a.group_id, subject_id: a.subject_id, antes: a.horas_semanales, ahora: horas });
    }
    resultado.asignaciones.push(horas === a.horas_semanales ? a : { ...a, horas_semanales: horas });
  }

  for (const grupoId of grupoIds) {
    const plan = planes.get(grupoId);
    if (!plan) {
      resultado.grupos_sin_plan.push(grupoId);
      continue;
    }
    for (const [subjectId, horas] of plan) {
      if (!dictadas.has(`${grupoId}|${subjectId}`)) resultado.sin_docente.push({ group_id: grupoId, subject_id: subjectId, horas });
    }
  }
  return resultado;
}

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export interface VentanaDeJornada {
  hora_inicio: string;
  hora_fin: string;
  dias_habiles: readonly number[];
}

/**
 * Dos jornadas se cruzan si comparten algún día y sus horas se pisan. Un docente con clase en ambas (p. ej. mañana en una
 * sede y mañana en otra) no puede estar en los dos lugares: el motor de una jornada no lo ve, así que se avisa.
 */
export function jornadasSeTraslapan(a: VentanaDeJornada, b: VentanaDeJornada): boolean {
  if (!a.dias_habiles.some((d) => b.dias_habiles.includes(d))) return false;
  return aMinutos(a.hora_inicio) < aMinutos(b.hora_fin) && aMinutos(b.hora_inicio) < aMinutos(a.hora_fin);
}

/** "A; B; C y 4 más": listas largas de un aviso sin volverlo ilegible. */
export function resumirLista(items: readonly string[], maximo = 8): string {
  if (items.length <= maximo) return items.join('; ');
  return `${items.slice(0, maximo).join('; ')} y ${items.length - maximo} más`;
}
