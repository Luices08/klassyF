import { describe, expect, it } from 'vitest';
import { claveDeNombre, leerDecimal, leerEstado, neutralizarFormula } from '../src/utils/importacion';

describe('neutralizarFormula', () => {
  it('antepone un apóstrofo a lo que Excel tomaría por fórmula', () => {
    for (const peligrosa of ['=SUMA(A1)', '+1', '-2', '@usuario', '\t=x']) {
      expect(neutralizarFormula(peligrosa).startsWith("'")).toBe(true);
    }
    expect(neutralizarFormula('Texto normal')).toBe('Texto normal');
    expect(neutralizarFormula('2.15 Debe portar los tenis')).toBe('2.15 Debe portar los tenis');
  });
});

describe('lectores de celdas', () => {
  it('estado: vacío es activo y lo desconocido es error', () => {
    expect(leerEstado('')).toBe('activo');
    expect(leerEstado('Inactivo')).toBe('inactivo');
    expect(leerEstado('suspendido')).toBeNull();
  });

  it('decimal acepta coma o punto; vacío es sin dato y lo inválido es undefined', () => {
    expect(leerDecimal('0,3')).toBe(0.3);
    expect(leerDecimal('1.5')).toBe(1.5);
    expect(leerDecimal('')).toBeNull();
    expect(leerDecimal('abc')).toBeUndefined();
    expect(leerDecimal('-1')).toBeUndefined();
  });

  it('claveDeNombre ignora mayúsculas, tildes y espacios dobles', () => {
    expect(claveDeNombre('  Académica  ')).toBe(claveDeNombre('academica'));
    expect(claveDeNombre('Filosofía   institucional')).toBe('filosofia institucional');
  });
});
