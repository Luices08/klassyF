import { describe, expect, it } from 'vitest';
import type { IGradoPlan } from '../src/models/studyPlan.model';
import { capacidadPeriodosSemanaJornada, horasDeAsignaturaEnGrupo, horasSemanalesDelGrupo } from '../src/utils/horasPlanEstudios';

const asignatura = (subject_id: string, intensidad_horaria_semanal: number) => ({ subject_id, intensidad_horaria_semanal });
const grado = (...asignaturas: ReturnType<typeof asignatura>[]) =>
  ({ asignaturas, evaluaciones_area: [], personalizaciones_grupo: [] }) as unknown as IGradoPlan;
const personalizacion = (
  intensidades_personalizadas: Array<ReturnType<typeof asignatura> & { observacion: string }>,
  asignaturas_agregadas: Array<ReturnType<typeof asignatura> & { observacion: string }> = []
) => ({ intensidades_personalizadas, asignaturas_agregadas }) as never;

describe('horasSemanalesDelGrupo', () => {
  const base = grado(asignatura('mat', 5), asignatura('len', 4), asignatura('cie', 3));

  it('un grupo sin personalización hereda las horas del grado', () => {
    expect(horasSemanalesDelGrupo(base)).toBe(12);
  });

  it('una intensidad personalizada reemplaza la del grado, no se suma', () => {
    expect(horasSemanalesDelGrupo(base, personalizacion([{ ...asignatura('mat', 7), observacion: 'x' }]))).toBe(14);
  });

  it('una asignatura agregada al grupo se suma a las del grado', () => {
    expect(
      horasSemanalesDelGrupo(base, personalizacion([], [{ ...asignatura('inf', 2), observacion: 'x' }]))
    ).toBe(14);
  });
});

describe('horasDeAsignaturaEnGrupo', () => {
  const base = {
    ...grado(asignatura('mat', 5), asignatura('len', 4)),
    personalizaciones_grupo: [
      {
        group_id: 'g1',
        intensidades_personalizadas: [{ ...asignatura('mat', 7), observacion: 'x' }],
        asignaturas_agregadas: [{ ...asignatura('inf', 2), observacion: 'x' }],
        evaluaciones_area_personalizadas: [],
      },
    ],
  } as unknown as IGradoPlan;

  it('prioriza la intensidad personalizada del grupo sobre la del grado', () => {
    expect(horasDeAsignaturaEnGrupo(base, 'g1', 'mat')).toBe(7);
  });

  it('un grupo sin personalización usa las horas del grado', () => {
    expect(horasDeAsignaturaEnGrupo(base, 'g2', 'mat')).toBe(5);
  });

  it('una asignatura agregada solo existe para su grupo', () => {
    expect(horasDeAsignaturaEnGrupo(base, 'g1', 'inf')).toBe(2);
    expect(horasDeAsignaturaEnGrupo(base, 'g2', 'inf')).toBeUndefined();
  });

  it('devuelve undefined si el plan ya no incluye la asignatura', () => {
    expect(horasDeAsignaturaEnGrupo(base, 'g1', 'quim')).toBeUndefined();
  });

  it('prioriza la personalización del grupo sobre la de la jornada y el grado', () => {
    const conJornada = {
      ...base,
      jornadas_personalizadas: [
        {
          jornada_id: 'j1',
          intensidades_personalizadas: [{ ...asignatura('mat', 6), observacion: 'jornada' }],
          asignaturas_agregadas: [{ ...asignatura('rob', 3), observacion: 'jornada' }],
          evaluaciones_area_personalizadas: [],
        },
      ],
    } as unknown as IGradoPlan;

    // Grupo con personalización específica: gana el grupo (7h)
    expect(horasDeAsignaturaEnGrupo(conJornada, 'g1', 'mat', 'j1')).toBe(7);
    // Grupo sin personalización específica pero en jornada j1: toma la jornada (6h)
    expect(horasDeAsignaturaEnGrupo(conJornada, 'g2', 'mat', 'j1')).toBe(6);
    // Grupo en otra jornada: toma la base del grado (5h)
    expect(horasDeAsignaturaEnGrupo(conJornada, 'g3', 'mat', 'j2')).toBe(5);
    // Materia agregada a la jornada existe para grupos de esa jornada
    expect(horasDeAsignaturaEnGrupo(conJornada, 'g2', 'rob', 'j1')).toBe(3);
    expect(horasDeAsignaturaEnGrupo(conJornada, 'g3', 'rob', 'j2')).toBeUndefined();
  });
});

describe('capacidadPeriodosSemanaJornada', () => {
  it('calcula periodos semanales de clase: franjas de tipo CLASE por dias habiles', () => {
    const jornadaManana = {
      dias_habiles: [1, 2, 3, 4, 5],
      franjas: [
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'DESCANSO' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
      ],
    };
    // 6 clases * 5 días = 30
    expect(capacidadPeriodosSemanaJornada(jornadaManana)).toBe(30);
  });

  it('calcula jornada única con 7 clases al día', () => {
    const jornadaUnica = {
      dias_habiles: [1, 2, 3, 4, 5],
      franjas: [
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'DESCANSO' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
        { tipo: 'DESCANSO' },
        { tipo: 'CLASE' },
        { tipo: 'CLASE' },
      ],
    };
    // 7 clases * 5 días = 35
    expect(capacidadPeriodosSemanaJornada(jornadaUnica)).toBe(35);
  });

  it('calcula jornada sabatina (1 día hábil)', () => {
    const sabatina = {
      dias_habiles: [6],
      franjas: [{ tipo: 'CLASE' }, { tipo: 'CLASE' }, { tipo: 'CLASE' }, { tipo: 'CLASE' }, { tipo: 'CLASE' }, { tipo: 'CLASE' }],
    };
    expect(capacidadPeriodosSemanaJornada(sabatina)).toBe(6);
  });

  it('devuelve 0 si la jornada no tiene franjas o es nula', () => {
    expect(capacidadPeriodosSemanaJornada(null)).toBe(0);
    expect(capacidadPeriodosSemanaJornada({ dias_habiles: [1, 2, 3, 4, 5], franjas: [] })).toBe(0);
  });
});
