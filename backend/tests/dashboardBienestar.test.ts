import { describe, expect, it } from 'vitest';
import { contarPorClave, diasDesde, filtroDeSedes, resumirSeguimientoDeAjustes, sedesPermitidas } from '../src/utils/dashboardBienestar';

describe('sedesPermitidas', () => {
  it('sin sede pedida deja el alcance del rol', () => {
    expect(sedesPermitidas('TODAS')).toBe('TODAS');
    expect(sedesPermitidas(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('rectoría puede elegir cualquier sede', () => {
    expect(sedesPermitidas('TODAS', 'x')).toEqual(['x']);
  });

  it('un rol con sedes solo elige entre las suyas; una ajena no se abre', () => {
    expect(sedesPermitidas(['a', 'b'], 'b')).toEqual(['b']);
    expect(sedesPermitidas(['a', 'b'], 'x')).toEqual([]);
  });
});

describe('filtroDeSedes', () => {
  it('todas las sedes no filtra; una lista filtra; una lista vacía no coincide con nada', () => {
    expect(filtroDeSedes('TODAS')).toEqual({});
    expect(filtroDeSedes(['a'])).toEqual({ sede_id: { $in: ['a'] } });
    expect(filtroDeSedes([])).toEqual({ sede_id: { $in: [] } });
  });
});

describe('diasDesde', () => {
  const ahora = new Date('2026-10-20T12:00:00Z');

  it('cuenta días completos y no devuelve negativos', () => {
    expect(diasDesde(new Date('2026-10-17T13:00:00Z'), ahora)).toBe(2);
    expect(diasDesde(new Date('2026-10-20T08:00:00Z'), ahora)).toBe(0);
    expect(diasDesde(new Date('2026-10-25T00:00:00Z'), ahora)).toBe(0);
  });

  it('sin fecha no hay nada pendiente', () => {
    expect(diasDesde(null, ahora)).toBeNull();
    expect(diasDesde(undefined, ahora)).toBeNull();
  });
});

describe('contarPorClave', () => {
  it('parte de ceros para que estén todas las claves y ignora las desconocidas', () => {
    expect(contarPorClave(['I', 'II', 'III'] as const, ['II', 'II', 'I'])).toEqual({ I: 1, II: 2, III: 0 });
    expect(contarPorClave(['A', 'B'] as const, [])).toEqual({ A: 0, B: 0 });
    expect(contarPorClave(['A'] as const, ['A', 'Z' as 'A'])).toEqual({ A: 1 });
  });
});

describe('resumirSeguimientoDeAjustes', () => {
  const ajuste = (...periodos: number[]) => ({ seguimientos: periodos.map((periodo_numero) => ({ periodo_numero })) });

  it('un ajuste cumple con seguimientos en al menos el mínimo de periodos distintos', () => {
    expect(resumirSeguimientoDeAjustes([ajuste(1, 2, 3), ajuste(1, 1, 1), ajuste()], 3)).toEqual({ total: 3, con_minimo: 1 });
  });

  it('sin ajustes no hay nada que cumplir', () => {
    expect(resumirSeguimientoDeAjustes([], 3)).toEqual({ total: 0, con_minimo: 0 });
  });
});
