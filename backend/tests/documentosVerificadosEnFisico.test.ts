import { describe, expect, it } from 'vitest';
import { checklistCompleto, clavesNoPrevistas, faltaDigitalizar } from '../src/utils/documentosMatricula';

const VERIFICADO = new Date('2026-01-20T15:00:00Z');

describe('faltaDigitalizar (M04)', () => {
  it('un documento visto en físico, aprobado y sin archivo falta digitalizarlo', () => {
    expect(faltaDigitalizar({ estado: 'APROBADO', archivo_path: null, fecha_verificacion_fisica: VERIFICADO })).toBe(true);
    expect(faltaDigitalizar({ estado: 'APROBADO', fecha_verificacion_fisica: VERIFICADO })).toBe(true);
  });

  it('con archivo ya no falta nada', () => {
    expect(faltaDigitalizar({ estado: 'APROBADO', archivo_path: 'uploads/matriculas/a.pdf', fecha_verificacion_fisica: VERIFICADO })).toBe(false);
  });

  it('lo aprobado por el sistema (paz y salvo del año anterior) no se vio en físico, así que no entra', () => {
    expect(faltaDigitalizar({ estado: 'APROBADO', archivo_path: null, fecha_verificacion_fisica: null })).toBe(false);
    expect(faltaDigitalizar({ estado: 'APROBADO', archivo_path: null })).toBe(false);
  });

  it('un documento sin aprobar nunca falta digitalizarlo, aunque tenga la marca', () => {
    for (const estado of ['PENDIENTE', 'CARGADO', 'RECHAZADO'] as const) {
      expect(faltaDigitalizar({ estado, archivo_path: null, fecha_verificacion_fisica: VERIFICADO })).toBe(false);
    }
  });
});

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
