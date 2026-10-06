import { describe, expect, it } from 'vitest';
import type { IGradoPlan } from '../src/dominios/curricular/plan-estudios/studyPlan.model';
import { horasDeAsignaturaEnGrupo, horasSemanalesDelGrupo } from '../src/dominios/curricular/plan-estudios/horasPlanEstudios';

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
});
