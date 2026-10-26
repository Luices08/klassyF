import { describe, expect, it } from 'vitest';
import { checklistCompleto, clavesNoPrevistas } from '../src/utils/documentosMatricula';

describe('clavesNoPrevistas (M04)', () => {
  it('devuelve las claves entregadas que la matrícula no pide, sin repetirlas', () => {
    expect(clavesNoPrevistas(['FOTO', 'CARNE_EPS'], ['FOTO', 'CERTIFICADO_QUINTO_PRIMARIA', 'CERTIFICADO_QUINTO_PRIMARIA'])).toEqual(['CERTIFICADO_QUINTO_PRIMARIA']);
  });

  it('no hay nada que avisar si todo lo entregado se pide', () => {
    expect(clavesNoPrevistas(['FOTO', 'CARNE_EPS'], ['CARNE_EPS'])).toEqual([]);
    expect(clavesNoPrevistas(['FOTO'], [])).toEqual([]);
  });
});

describe('checklistCompleto con documentos verificados en físico (M04)', () => {
  it('un obligatorio visto en físico cuenta como aprobado aunque no tenga archivo', () => {
    expect(
      checklistCompleto([
        { tipo_documento: 'FOTO', obligatorio: true, estado: 'APROBADO' },
        { tipo_documento: 'CARNE_EPS', obligatorio: true, estado: 'APROBADO' },
        { tipo_documento: 'CUSTODIA_LEGAL_O_PODER', obligatorio: false, estado: 'PENDIENTE' },
      ])
    ).toBe(true);
  });

  it('falta uno obligatorio: no está completo y el acta lo listará', () => {
    expect(
      checklistCompleto([
        { tipo_documento: 'FOTO', obligatorio: true, estado: 'APROBADO' },
        { tipo_documento: 'CARNE_EPS', obligatorio: true, estado: 'PENDIENTE' },
      ])
    ).toBe(false);
  });
});
