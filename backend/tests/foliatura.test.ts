import { describe, expect, it } from 'vitest';
import { MASCARA_INICIAL } from '../src/constants/foliatura';
import { libroDeFolio, renderizarMascara, siguienteFolio, validarMascara } from '../src/utils/foliatura';

describe('renderizarMascara (foliatura del Libro de Matrícula)', () => {
  it('arma el código de partida con el folio a 6 cifras', () => {
    expect(renderizarMascara(MASCARA_INICIAL, { libro: 24, folio: 188, anio: 2026 })).toBe('L24-F000188-2026');
  });

  it('{año} y {anio} son lo mismo y el libro puede llevar ceros', () => {
    expect(renderizarMascara('{libro:4}/{folio:3}/{anio}', { libro: 7, folio: 5, anio: 2027 })).toBe('0007/005/2027');
  });

  it('un folio más largo que su ancho no se recorta', () => {
    expect(renderizarMascara('F{folio:3}-L{libro}', { libro: 1, folio: 12345, anio: 2026 })).toBe('F12345-L1');
  });
});

describe('validarMascara', () => {
  it('acepta la máscara de partida y variantes razonables', () => {
    expect(validarMascara(MASCARA_INICIAL)).toBeNull();
    expect(validarMascara('L{libro}-F{folio:6}')).toBeNull();
    expect(validarMascara('{libro}/{folio:5}')).toBeNull();
  });

  it('exige {folio} y {libro}: sin ellos dos libros darían el mismo código', () => {
    expect(validarMascara('L{libro}-{año}')).toMatch(/\{folio\}/);
    expect(validarMascara('F{folio:6}-{año}')).toMatch(/\{libro\}/);
  });

  it('rechaza partes que no existen y llaves sueltas', () => {
    expect(validarMascara('L{libro}-F{folio:6}-{sede}')).toMatch(/llave|parte/i);
    expect(validarMascara('L{libro}-F{folio:6}-{año')).toMatch(/llave|parte/i);
    expect(validarMascara('')).toMatch(/Escribe/);
  });

  it('solo permite letras, números y los signos - _ / .', () => {
    expect(validarMascara('L{libro}#F{folio:6}')).toMatch(/Solo se permiten/);
  });

  it('no deja pasar un código que en el peor caso supere los 20 caracteres', () => {
    expect(validarMascara('LIBRO-{libro}-FOLIO-{folio:6}-{año}')).toMatch(/20 caracteres/);
  });
});

describe('libroDeFolio y siguienteFolio', () => {
  const continuo = { esquema: 'CONTINUO' as const, capacidad_por_libro: 300 as number | null, libro_actual: 24 as number | null, contadores: { '24': 187 } };

  it('en el esquema anual el libro es la vigencia y el folio arranca en 1', () => {
    expect(libroDeFolio('ANUAL', 2026, null)).toBe(2026);
    expect(siguienteFolio({ esquema: 'ANUAL', capacidad_por_libro: null, libro_actual: null, contadores: {} }, 2026)).toEqual({ libro: 2026, folio: 1 });
    expect(siguienteFolio({ esquema: 'ANUAL', capacidad_por_libro: null, libro_actual: null, contadores: { '2026': 40 } }, 2027)).toEqual({ libro: 2027, folio: 1 });
  });

  it('en el continuo sigue donde iba el archivo físico', () => {
    expect(siguienteFolio(continuo, 2026)).toEqual({ libro: 24, folio: 188 });
    expect(siguienteFolio(continuo, 2031)).toEqual({ libro: 24, folio: 188 });
  });

  it('con el libro lleno abre el siguiente con el folio en 1', () => {
    expect(siguienteFolio({ ...continuo, contadores: { '24': 300 } }, 2026)).toEqual({ libro: 25, folio: 1 });
  });

  it('sin capacidad el libro no se llena', () => {
    expect(siguienteFolio({ ...continuo, capacidad_por_libro: null, contadores: { '24': 900 } }, 2026)).toEqual({ libro: 24, folio: 901 });
  });

  it('acepta los contadores como Map (como los guarda el modelo)', () => {
    expect(siguienteFolio({ ...continuo, contadores: new Map([['24', 10]]) }, 2026)).toEqual({ libro: 24, folio: 11 });
  });
});
