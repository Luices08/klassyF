import { describe, expect, it } from 'vitest';
import { EntradaRevisionSimat, ENCABEZADOS_SIMAT, FilaSimat, aCsv, advertenciasDeFila, codigoDeGrado, revisarSimat, situacionSimat } from '../src/utils/simat';

const fila = (extra: Partial<FilaSimat> = {}): FilaSimat => ({
  codigo_dane_sede: '168001000123',
  anio: 2026,
  tipo_documento: 'TI',
  numero_documento: '1098765432',
  primer_apellido: 'Núñez',
  segundo_apellido: '',
  primer_nombre: 'Sofía',
  segundo_nombre: '',
  grado: '06',
  grupo: 'A',
  situacion: 'P',
  areas_reprobadas: 0,
  ...extra,
});
const entrada = (f: Partial<FilaSimat> = {}, extra: Partial<EntradaRevisionSimat> = {}): EntradaRevisionSimat => ({ fila: fila(f), etiqueta: 'Núñez Sofía (1098765432) · 6-A', oficial: true, grado_numero: 6, aprobo_sin_grado: false, ...extra });

describe('situación para SIMAT', () => {
  it('retirado manda sobre todo, luego graduado, luego el resultado de promoción', () => {
    expect(situacionSimat({ retirado: true, graduado: true, resultado: 'PROMOVIDO' })).toBe('D');
    expect(situacionSimat({ retirado: false, graduado: true, resultado: 'PROMOVIDO' })).toBe('G');
    for (const r of ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE']) expect(situacionSimat({ retirado: false, graduado: false, resultado: r })).toBe('P');
    expect(situacionSimat({ retirado: false, graduado: false, resultado: 'NO_PROMOVIDO' })).toBe('R');
  });

  it('lo que aún espera algo es N, nunca R ni P', () => {
    for (const r of ['PENDIENTE_RECUPERACION', 'EN_COMISION', 'RETIRO_PROPUESTO', 'INCOMPLETO', null]) expect(situacionSimat({ retirado: false, graduado: false, resultado: r })).toBe('N');
  });
});

describe('código del grado', () => {
  it('Transición es 00 y los demás llevan dos cifras', () => {
    expect([0, 1, 9, 10, 11].map(codigoDeGrado)).toEqual(['00', '01', '09', '10', '11']);
  });
  it('un grado anterior a Transición no inventa un código: escribe su número', () => {
    expect(codigoDeGrado(-1)).toBe('-1');
  });
});

describe('advertencias y revisión', () => {
  it('una fila completa y oficial no tiene advertencias', () => {
    expect(advertenciasDeFila(entrada())).toEqual([]);
    expect(revisarSimat([entrada()]).listo).toBe(true);
  });

  it('avisa sin nombres separados, sin cierre, DANE inválido, tipo de documento fuera de lista, grado sin código y once sin grado', () => {
    expect(advertenciasDeFila(entrada({ primer_nombre: '' }))).toEqual(['SIN_NOMBRES']);
    expect(advertenciasDeFila(entrada({ primer_apellido: '' }))).toEqual(['SIN_NOMBRES']);
    expect(advertenciasDeFila(entrada({}, { oficial: false }))).toEqual(['SIN_CIERRE']);
    expect(advertenciasDeFila(entrada({ codigo_dane_sede: '12345' }))).toEqual(['DANE_INVALIDO']);
    expect(advertenciasDeFila(entrada({ tipo_documento: 'CE' }))).toEqual(['TIPO_DOCUMENTO']);
    expect(advertenciasDeFila(entrada({}, { grado_numero: -1 }))).toEqual(['GRADO_SIN_CODIGO']);
    expect(advertenciasDeFila(entrada({}, { aprobo_sin_grado: true }))).toEqual(['APROBO_SIN_GRADO']);
  });

  it('un retirado no necesita cierre de promoción para estar listo', () => {
    expect(advertenciasDeFila(entrada({ situacion: 'D' }, { oficial: false }))).toEqual([]);
  });

  it('cuenta por situación, agrupa las advertencias y deja pocos ejemplos', () => {
    const entradas = Array.from({ length: 8 }, (_, i) => entrada({ numero_documento: String(i), primer_nombre: '' }, { etiqueta: `Estudiante ${i}` }));
    entradas.push(entrada({ situacion: 'R' }), entrada({ situacion: 'D' }, { oficial: false }));
    const r = revisarSimat(entradas);
    expect(r.total).toBe(10);
    expect(r.por_situacion).toEqual({ P: 8, R: 1, D: 1, G: 0, N: 0 });
    expect(r.listo).toBe(false);
    const sinNombres = r.advertencias.find((a) => a.codigo === 'SIN_NOMBRES')!;
    expect(sinNombres.cantidad).toBe(8);
    expect(sinNombres.ejemplos).toHaveLength(5);
  });
});

describe('CSV', () => {
  it('trae solo los encabezados y un estudiante por fila, con BOM, separador «;» y los ceros del grado', () => {
    const csv = aCsv([fila(), fila({ numero_documento: '1098765433', segundo_apellido: 'Rojas', segundo_nombre: 'Valentina', grado: '00', situacion: 'N', areas_reprobadas: 2 })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lineas = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe(ENCABEZADOS_SIMAT.join(';'));
    expect(lineas[1]).toBe('168001000123;2026;TI;1098765432;Núñez;;Sofía;;06;A;P;0');
    expect(lineas[2]).toBe('168001000123;2026;TI;1098765433;Núñez;Rojas;Sofía;Valentina;00;A;N;2');
  });

  it('entrecomilla lo que traiga el separador o comillas', () => {
    const csv = aCsv([fila({ primer_apellido: 'De la Cruz; Pérez', primer_nombre: 'Ana "Anita"' })]);
    expect(csv).toContain('"De la Cruz; Pérez"');
    expect(csv).toContain('"Ana ""Anita"""');
  });
});
