import { describe, expect, it } from 'vitest';
import { conciliarCargaConPlan, horasDelPlanDeGrupo, jornadasSeTraslapan, resumirLista } from '../src/utils/horarioCoherencia';
import { AsignacionMotor, EspacioMotor, SesionMotor, construirEstructura, diagnosticarCapacidad } from '../src/utils/motorHorarios';

const oid = (n: number) => String(n).padStart(24, '0');
const G6 = oid(1);
const SEDE = oid(2);
const MANANA = oid(3);
const TARDE = oid(4);
const MATE = oid(10);
const ESPA = oid(11);
const ARTES = oid(12);

const entradaDeGrado = (extra: Record<string, unknown>) => ({
  grade_id: G6,
  sede_id: null,
  jornada_id: null,
  asignaturas: [],
  personalizaciones_grupo: [],
  jornadas_personalizadas: [],
  ...extra,
});
const plan = (...grades: Array<Record<string, unknown>>) => ({ grades }) as never;
const grupo = (id: string, jornada = MANANA) => ({ id, grade_id: G6, sede_id: SEDE, jornada_id: jornada });

describe('horasDelPlanDeGrupo', () => {
  it('usa el plan propio de la sede y jornada del grupo, no la base general', () => {
    const p = plan(
      entradaDeGrado({ asignaturas: [{ subject_id: MATE, intensidad_horaria_semanal: 5 }] }),
      entradaDeGrado({ sede_id: SEDE, jornada_id: TARDE, asignaturas: [{ subject_id: MATE, intensidad_horaria_semanal: 3 }] })
    );
    expect(horasDelPlanDeGrupo(p, grupo(oid(20), TARDE))?.get(MATE)).toBe(3);
    expect(horasDelPlanDeGrupo(p, grupo(oid(21), MANANA))?.get(MATE)).toBe(5);
  });

  it('suma lo agregado a la jornada o al grupo y respeta el ajuste de horas del grupo', () => {
    const g = oid(22);
    const p = plan(
      entradaDeGrado({
        asignaturas: [{ subject_id: MATE, intensidad_horaria_semanal: 5 }],
        jornadas_personalizadas: [{ jornada_id: MANANA, intensidades_personalizadas: [], asignaturas_agregadas: [{ subject_id: ESPA, intensidad_horaria_semanal: 2 }] }],
        personalizaciones_grupo: [
          { group_id: g, intensidades_personalizadas: [{ subject_id: MATE, intensidad_horaria_semanal: 4 }], asignaturas_agregadas: [{ subject_id: ARTES, intensidad_horaria_semanal: 1 }] },
        ],
      })
    );
    const horas = horasDelPlanDeGrupo(p, grupo(g));
    expect(Object.fromEntries(horas ?? [])).toEqual({ [MATE]: 4, [ESPA]: 2, [ARTES]: 1 });
  });

  it('un grado sin asignaturas o sin plan no dice nada', () => {
    expect(horasDelPlanDeGrupo(plan(entradaDeGrado({})), grupo(oid(23)))).toBeNull();
    expect(horasDelPlanDeGrupo(null, grupo(oid(23)))).toBeNull();
  });
});

describe('conciliarCargaConPlan', () => {
  const asignacion = (id: string, subject: string, horas: number, group = oid(30)): AsignacionMotor => ({
    id,
    docente_id: oid(99),
    group_id: group,
    grade_id: G6,
    subject_id: subject,
    horas_semanales: horas,
  });
  const g = oid(30);

  it('programa con las horas del plan cuando la copia de Carga académica quedó atrás', () => {
    const r = conciliarCargaConPlan([asignacion('a1', MATE, 5)], [g], new Map([[g, new Map([[MATE, 3]])]]));
    expect(r.asignaciones[0]?.horas_semanales).toBe(3);
    expect(r.horas_corregidas).toEqual([{ asignacion_id: 'a1', group_id: g, subject_id: MATE, antes: 5, ahora: 3 }]);
  });

  it('no programa una asignatura que el plan del grupo ya no tiene y señala las que faltan por docente', () => {
    const r = conciliarCargaConPlan([asignacion('a1', ARTES, 2)], [g], new Map([[g, new Map([[MATE, 4]])]]));
    expect(r.asignaciones).toHaveLength(0);
    expect(r.fuera_del_plan.map((x) => x.asignacion_id)).toEqual(['a1']);
    expect(r.sin_docente).toEqual([{ group_id: g, subject_id: MATE, horas: 4 }]);
  });

  it('un grupo sin plan conserva las horas de su asignación y se reporta', () => {
    const r = conciliarCargaConPlan([asignacion('a1', MATE, 5)], [g], new Map([[g, null]]));
    expect(r.asignaciones[0]?.horas_semanales).toBe(5);
    expect(r.grupos_sin_plan).toEqual([g]);
    expect(r.sin_docente).toEqual([]);
  });
});

describe('jornadasSeTraslapan', () => {
  const mananaA = { hora_inicio: '06:30', hora_fin: '12:30', dias_habiles: [1, 2, 3, 4, 5] };
  it('detecta horas que se pisan en días comunes', () => {
    expect(jornadasSeTraslapan(mananaA, { hora_inicio: '07:00', hora_fin: '13:00', dias_habiles: [1, 2, 3, 4, 5] })).toBe(true);
  });
  it('mañana y tarde seguidas no se cruzan, ni dos jornadas de días distintos', () => {
    expect(jornadasSeTraslapan(mananaA, { hora_inicio: '12:30', hora_fin: '18:00', dias_habiles: [1, 2, 3, 4, 5] })).toBe(false);
    expect(jornadasSeTraslapan(mananaA, { hora_inicio: '07:00', hora_fin: '17:00', dias_habiles: [6] })).toBe(false);
  });
});

describe('resumirLista', () => {
  it('recorta las listas largas', () => {
    expect(resumirLista(['a', 'b', 'c'], 2)).toBe('a; b y 1 más');
    expect(resumirLista(['a', 'b'], 2)).toBe('a; b');
  });
});

describe('diagnosticarCapacidad: espacios', () => {
  const franjas = ['06:30', '07:30', '08:30'].map((hora_inicio, i) => ({ nombre: String(i + 1), tipo: 'CLASE' as const, hora_inicio, hora_fin: '09:30' }));
  const estructura = construirEstructura([1, 2], franjas); // 6 periodos por semana
  const sesion = (id: string, duracion: number, espacios: string[]): SesionMotor => ({
    id,
    asignacion_id: id,
    reunion_variable_id: null,
    group_id: id,
    grade_id: G6,
    subject_id: MATE,
    docente_ids: [id],
    duracion,
    indice: 0,
    espacios_permitidos: espacios,
    fija: null,
  });

  it('avisa si las clases que piden el mismo laboratorio no caben en su semana', () => {
    const avisos = diagnosticarCapacidad([sesion('a', 4, ['lab']), sesion('b', 4, ['lab'])], [], estructura, [{ id: 'lab', admite_grupos_simultaneos: false }]);
    expect(avisos.map((a) => a.codigo)).toContain('ESPACIOS_INSUFICIENTES');
  });

  it('no avisa con espacios suficientes o si el espacio admite grupos simultáneos', () => {
    const lab: EspacioMotor = { id: 'lab', admite_grupos_simultaneos: false };
    expect(diagnosticarCapacidad([sesion('a', 3, ['lab']), sesion('b', 3, ['lab'])], [], estructura, [lab]).map((a) => a.codigo)).not.toContain('ESPACIOS_INSUFICIENTES');
    expect(
      diagnosticarCapacidad([sesion('a', 4, ['lab']), sesion('b', 4, ['lab'])], [], estructura, [{ id: 'lab', admite_grupos_simultaneos: true }]).map((a) => a.codigo)
    ).not.toContain('ESPACIOS_INSUFICIENTES');
  });
});
