import { describe, expect, it } from 'vitest';
import { etapasNotaEfectiva, notaEfectivaDePeriodo, notaFinalDelAnio, recuperacionCuenta, resumenDeRecuperacion } from '../src/utils/notaEfectiva';

const recuperada = (nota: number | null, integracion?: { cuenta_en_boletin?: boolean }) => ({
  nota_resultante: nota,
  integracion,
  estado: nota !== null && nota >= 3 ? 'SUPERADA' : 'NO_SUPERADA',
  detalle: '',
  intentos: [{ fecha: new Date('2026-10-22T15:00:00Z') }, { fecha: new Date('2026-10-23T15:00:00Z') }],
});

describe('notaEfectivaDePeriodo', () => {
  it('sin recuperación es la nota que cerró el docente', () => {
    expect(notaEfectivaDePeriodo(2.06, null)).toBe(2.06);
    expect(notaEfectivaDePeriodo(2.06, undefined)).toBe(2.06);
  });

  it('con una recuperación que cuenta, es la nota resultante', () => {
    expect(notaEfectivaDePeriodo(2.06, recuperada(3.2))).toBe(3.2);
    expect(notaEfectivaDePeriodo(2.06, recuperada(3.2, { cuenta_en_boletin: true }))).toBe(3.2);
  });

  it('si el colegio configuró «solo anotar», la nota no cambia', () => {
    expect(notaEfectivaDePeriodo(2.06, recuperada(3.2, { cuenta_en_boletin: false }))).toBe(2.06);
    expect(recuperacionCuenta(recuperada(3.2, { cuenta_en_boletin: false }))).toBe(false);
  });

  it('una recuperación sin resultado no cambia la nota', () => {
    expect(notaEfectivaDePeriodo(2.06, recuperada(null))).toBe(2.06);
  });

  it('sin nota cerrada no hay nota efectiva', () => {
    expect(notaEfectivaDePeriodo(null, recuperada(3.2))).toBeNull();
  });

  it('la recuperación puede dejar la nota por debajo (el efecto lo decide el colegio, no esta regla)', () => {
    expect(notaEfectivaDePeriodo(2.8, recuperada(2.5))).toBe(2.5);
  });
});

describe('resumenDeRecuperacion', () => {
  it('trae la nota anterior, la nueva, los intentos y la fecha del último', () => {
    const r = resumenDeRecuperacion(2.06, recuperada(3.2));
    expect(r).toMatchObject({ nota_original: 2.06, nota_resultante: 3.2, estado: 'SUPERADA', cuenta: true, intentos: 2 });
    expect(r?.fecha?.toISOString()).toBe('2026-10-23T15:00:00.000Z');
  });

  it('marca cuando la recuperación no cuenta', () => {
    expect(resumenDeRecuperacion(2.06, recuperada(3.2, { cuenta_en_boletin: false }))?.cuenta).toBe(false);
  });

  it('no inventa nada si no hay recuperación, resultado o nota cerrada', () => {
    expect(resumenDeRecuperacion(2.06, null)).toBeNull();
    expect(resumenDeRecuperacion(2.06, recuperada(null))).toBeNull();
    expect(resumenDeRecuperacion(null, recuperada(3.2))).toBeNull();
  });
});

describe('notaFinalDelAnio', () => {
  it('una asignatura perdida toma la nota de la recuperación de fin de año', () => {
    expect(notaFinalDelAnio(2.4, 3, { nota_resultante: 3 })).toBe(3);
  });

  it('una aprobada no cambia aunque tenga una recuperación anotada', () => {
    expect(notaFinalDelAnio(3.6, 3, { nota_resultante: 5 })).toBe(3.6);
  });

  it('sin recuperación o sin definitiva se queda como está', () => {
    expect(notaFinalDelAnio(2.4, 3, null)).toBe(2.4);
    expect(notaFinalDelAnio(2.4, 3, { nota_resultante: null })).toBe(2.4);
    expect(notaFinalDelAnio(null, 3, { nota_resultante: 4 })).toBeNull();
  });
});

describe('etapasNotaEfectiva', () => {
  it('cruza con las recuperaciones de PERIODO del mismo estudiante, clase y periodo, y deja nota_efectiva', () => {
    const [cruce, agrega] = etapasNotaEfectiva() as Array<Record<string, Record<string, unknown>>>;
    expect(cruce!.$lookup!.from).toBe('recuperacions');
    expect(JSON.stringify(cruce)).toContain("'PERIODO'".replace(/'/g, '"'));
    expect(JSON.stringify(cruce)).toContain('cuenta_en_boletin');
    expect(JSON.stringify(agrega)).toContain('nota_efectiva');
    expect(JSON.stringify(agrega)).toContain('$resultado.nota_asignatura');
  });
});
