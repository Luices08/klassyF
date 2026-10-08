import { describe, expect, it } from 'vitest';
import { exigirMotivoSiAnioEnCurso } from '../src/services/planEstudiosDependencias.service';

describe('exigirMotivoSiAnioEnCurso', () => {
  it('antes de activar el año no se pide motivo', () => {
    expect(exigirMotivoSiAnioEnCurso({ year: 2027, estado: 'PLANIFICACION' })).toBeUndefined();
  });

  it('con el año en curso exige un motivo y lo devuelve sin espacios sobrantes', () => {
    expect(() => exigirMotivoSiAnioEnCurso({ year: 2027, estado: 'EN_CURSO' })).toThrow(/motivo/);
    expect(() => exigirMotivoSiAnioEnCurso({ year: 2027, estado: 'EN_CURSO' }, '   ')).toThrow(/motivo/);
    expect(exigirMotivoSiAnioEnCurso({ year: 2027, estado: 'EN_CURSO' }, '  Error de digitación  ')).toBe(
      'Error de digitación'
    );
  });
});
