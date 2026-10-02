import { describe, expect, it } from 'vitest';
import { claveDeNombre, leerDecimal, leerEstado, leerOrden, leerSiNo, neutralizarFormula, normalizarFecha, partirLista } from '../src/utils/importacion';

describe('neutralizarFormula', () => {
  it('antepone un apóstrofo a lo que Excel tomaría por fórmula', () => {
    for (const peligrosa of ['=SUMA(A1)', '+1', '-2', '@usuario', '\t=x']) {
      expect(neutralizarFormula(peligrosa).startsWith("'")).toBe(true);
    }
    expect(neutralizarFormula('Texto normal')).toBe('Texto normal');
    expect(neutralizarFormula('1.3 Debe estar puntual')).toBe('1.3 Debe estar puntual');
  });
});

describe('normalizarFecha', () => {
  it('acepta AAAA-MM-DD y DD/MM/AAAA y rechaza fechas que no existen', () => {
    expect(normalizarFecha('2026-03-12')).toBe('2026-03-12');
    expect(normalizarFecha('12/03/2026')).toBe('2026-03-12');
    expect(normalizarFecha('2/3/2026')).toBe('2026-03-02');
    expect(normalizarFecha('2026-02-30')).toBeNull();
    expect(normalizarFecha('31/04/2026')).toBeNull();
    expect(normalizarFecha('ayer')).toBeNull();
    expect(normalizarFecha('')).toBeNull();
  });
});

describe('lectores de celdas', () => {
  it('SI/NO acepta mayúsculas y tilde, usa el valor por defecto en vacío y rechaza lo demás', () => {
    expect(leerSiNo('Sí', false)).toBe(true);
    expect(leerSiNo('NO', true)).toBe(false);
    expect(leerSiNo('', true)).toBe(true);
    expect(leerSiNo('quizás', false)).toBeNull();
  });

  it('estado: vacío es activo y lo desconocido es error', () => {
    expect(leerEstado('')).toBe('activo');
    expect(leerEstado('Inactivo')).toBe('inactivo');
    expect(leerEstado('suspendido')).toBeNull();
  });

  it('orden: entero no negativo', () => {
    expect(leerOrden('')).toBe(0);
    expect(leerOrden('12')).toBe(12);
    expect(leerOrden('-1')).toBeNull();
    expect(leerOrden('1,5')).toBeNull();
  });

  it('decimal acepta coma o punto; vacío es sin dato y lo inválido es undefined', () => {
    expect(leerDecimal('0,3')).toBe(0.3);
    expect(leerDecimal('1.5')).toBe(1.5);
    expect(leerDecimal('')).toBeNull();
    expect(leerDecimal('abc')).toBeUndefined();
    expect(leerDecimal('-1')).toBeUndefined();
  });

  it('partirLista separa con | o ; sin vacíos ni repetidos', () => {
    expect(partirLista('C-01| C-04;C-01;;')).toEqual(['C-01', 'C-04']);
    expect(partirLista('')).toEqual([]);
  });

  it('claveDeNombre ignora mayúsculas, tildes y espacios dobles', () => {
    expect(claveDeNombre('  Académica  ')).toBe(claveDeNombre('academica'));
    expect(claveDeNombre('Filosofía   institucional')).toBe('filosofia institucional');
  });
});
