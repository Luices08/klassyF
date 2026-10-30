import { describe, expect, it } from 'vitest';
import { documentosPorRevisar, ocupacionPorGrado, resumirCondicionales, resumirRenovacion } from '../src/utils/dashboardSecretaria';

describe('ocupacionPorGrado', () => {
  const grupo = (grado_id: string, grado_numero: number, max_capacity: number, cupos_ocupados: number) => ({ grado_id, grado: `Grado ${grado_numero}`, grado_numero, max_capacity, cupos_ocupados });

  it('suma los grupos de cada grado y ordena del más lleno al menos lleno', () => {
    const r = ocupacionPorGrado([grupo('a', 6, 30, 15), grupo('a', 6, 30, 15), grupo('b', 7, 40, 38), grupo('c', 8, 30, 30)], 8);
    expect(r.map((g) => g.grado_id)).toEqual(['c', 'b', 'a']);
    expect(r[2]).toMatchObject({ ocupados: 30, capacidad: 60, ocupacion_pct: 50 });
  });

  it('a igual ocupación va primero el grado menor, y se limita a los que pide la pantalla', () => {
    const r = ocupacionPorGrado([grupo('b', 7, 10, 5), grupo('a', 6, 10, 5), grupo('c', 8, 10, 1)], 2);
    expect(r.map((g) => g.grado_id)).toEqual(['a', 'b']);
  });

  it('un grado sin capacidad no entra: no hay con qué medir la ocupación', () => {
    expect(ocupacionPorGrado([grupo('a', 6, 0, 0)], 8)).toEqual([]);
  });
});

describe('resumirCondicionales', () => {
  const ahora = new Date('2026-10-20T12:00:00Z');

  it('el plazo vence después de su último día; sin fecha no cuenta como vencida', () => {
    const r = resumirCondicionales(
      [{ fecha_limite_compromiso: new Date('2026-10-19T00:00:00Z') }, { fecha_limite_compromiso: new Date('2026-10-20T00:00:00Z') }, { fecha_limite_compromiso: new Date('2026-11-01T00:00:00Z') }, { fecha_limite_compromiso: null }],
      ahora
    );
    expect(r).toEqual({ total: 4, plazo_vencido: 1 });
  });
});

describe('documentosPorRevisar', () => {
  it('cuenta solo los cargados, sumando todas las matrículas', () => {
    expect(documentosPorRevisar([[{ estado: 'CARGADO' }, { estado: 'APROBADO' }], [{ estado: 'CARGADO' }, { estado: 'CARGADO' }, { estado: 'RECHAZADO' }], []])).toBe(3);
  });
});

describe('resumirRenovacion', () => {
  it('«sin respuesta» se deriva de los matriculados que no respondieron', () => {
    expect(resumirRenovacion(10, ['CONTINUA', 'CONTINUA', 'NO_CONTINUA'])).toEqual({ continuan: 2, no_continuan: 1, sin_respuesta: 7 });
  });

  it('nunca es negativo aunque haya respuestas de quien ya no está matriculado', () => {
    expect(resumirRenovacion(1, ['CONTINUA', 'NO_CONTINUA']).sin_respuesta).toBe(0);
  });
});
