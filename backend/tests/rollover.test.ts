import { describe, expect, it } from 'vitest';
import { RESULTADOS_PROMOCION, TEXTO_PROMOCION_BOLETIN } from '../src/constants/promocion';
import { asignarCupos, destinoDeRollover } from '../src/utils/rollover';

const entrada = (resultado: Parameters<typeof destinoDeRollover>[0]['resultado'], extra: Partial<Parameters<typeof destinoDeRollover>[0]> = {}) =>
  destinoDeRollover({ resultado, no_renueva_cupo: false, hay_grado_siguiente: true, ...extra });

describe('a dónde va cada estudiante al cambiar de año', () => {
  it('los promovidos van al grado siguiente, de cualquier forma que hayan sido promovidos', () => {
    for (const r of ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE'] as const) expect(entrada(r).destino).toBe('GRADO_SIGUIENTE');
  });

  it('el no promovido repite el mismo grado', () => {
    expect(entrada('NO_PROMOVIDO').destino).toBe('MISMO_GRADO');
  });

  it('en el último grado lo que sigue es la titulación, no una matrícula', () => {
    expect(entrada('PROMOVIDO', { hay_grado_siguiente: false }).destino).toBe('TERMINA_CICLO');
    expect(entrada('NO_PROMOVIDO', { hay_grado_siguiente: false }).destino).toBe('MISMO_GRADO');
  });

  it('quien aún espera recuperación, comisión, una persona o notas no se pre-matricula', () => {
    for (const r of ['PENDIENTE_RECUPERACION', 'EN_COMISION', 'RETIRO_PROPUESTO', 'INCOMPLETO'] as const) expect(entrada(r).destino).toBe('SIN_DECISION');
    expect(entrada(null)).toMatchObject({ destino: 'SIN_DECISION', motivo: expect.stringMatching(/cierre/) });
  });

  it('una regla de «no renovar cupo» gana sobre promover o repetir, pero no sobre un resultado pendiente', () => {
    expect(entrada('PROMOVIDO', { no_renueva_cupo: true }).destino).toBe('NO_RENUEVA_CUPO');
    expect(entrada('NO_PROMOVIDO', { no_renueva_cupo: true }).destino).toBe('NO_RENUEVA_CUPO');
    expect(entrada('EN_COMISION', { no_renueva_cupo: true }).destino).toBe('SIN_DECISION');
  });
});

describe('reparto de cupos', () => {
  it('llena en orden y respeta el candidato preferido', () => {
    const r = asignarCupos(
      [
        { id: 'a', candidatos: ['g1', 'g2'] },
        { id: 'b', candidatos: ['g1', 'g2'] },
        { id: 'c', candidatos: ['g1', 'g2'] },
        { id: 'd', candidatos: ['g2'] },
      ],
      new Map([['g1', 2], ['g2', 1]])
    );
    expect([...r.entries()]).toEqual([['a', 'g1'], ['b', 'g1'], ['c', 'g2'], ['d', null]]);
  });

  it('es determinista y no consume el mapa de entrada', () => {
    const libres = new Map([['g1', 1]]);
    const solicitudes = [{ id: 'a', candidatos: ['g1'] }];
    expect(asignarCupos(solicitudes, libres)).toEqual(asignarCupos(solicitudes, libres));
    expect(libres.get('g1')).toBe(1);
  });

  it('un grupo que no existe o está lleno no recibe a nadie', () => {
    expect(asignarCupos([{ id: 'a', candidatos: ['x'] }], new Map()).get('a')).toBeNull();
  });
});

describe('texto del informe final', () => {
  it('solo dice a la familia lo que ya es una decisión o una espera comprensible; lo interno no se muestra', () => {
    const mostrables = RESULTADOS_PROMOCION.filter((r) => TEXTO_PROMOCION_BOLETIN[r]);
    expect(mostrables).toEqual(['PROMOVIDO', 'PENDIENTE_RECUPERACION', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE', 'NO_PROMOVIDO', 'EN_COMISION']);
    expect(TEXTO_PROMOCION_BOLETIN.RETIRO_PROPUESTO).toBeUndefined();
    expect(TEXTO_PROMOCION_BOLETIN.INCOMPLETO).toBeUndefined();
  });
});
