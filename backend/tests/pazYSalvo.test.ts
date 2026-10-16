import { describe, expect, it } from 'vitest';
import { documentosObligatoriosPendientes } from '../src/utils/documentosMatricula';
import { permisoPazYSalvo } from '../src/utils/permisosPazYSalvo';

describe('permisoPazYSalvo (M04)', () => {
  it('el personal de matrículas gestiona siempre, también quitar una confirmación', () => {
    for (const rol of ['ADMIN', 'COORDINADOR', 'SECRETARIA'] as const) {
      expect(permisoPazYSalvo(rol, false)).toMatchObject({ ver: true, cargar: true, confirmar: true, revocar: true });
    }
  });

  it('el docente solo entra si la institución lo habilitó, y no puede quitar confirmaciones', () => {
    expect(permisoPazYSalvo('DOCENTE', true)).toMatchObject({ ver: true, cargar: true, confirmar: true, revocar: false });
    const apagado = permisoPazYSalvo('DOCENTE', false);
    expect(apagado).toMatchObject({ ver: false, cargar: false, confirmar: false });
    expect(apagado.motivo).toMatch(/Configuración institucional/);
  });

  it('los demás roles nunca, aunque el docente esté habilitado (sin herencia)', () => {
    for (const rol of ['ESTUDIANTE', 'ACUDIENTE', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR'] as const) {
      expect(permisoPazYSalvo(rol, true)).toMatchObject({ ver: false, cargar: false, confirmar: false, revocar: false });
    }
  });
});

describe('documentosObligatoriosPendientes (compuerta de matrícula definitiva)', () => {
  it('lista solo los obligatorios sin aprobar, con su nombre', () => {
    const pendientes = documentosObligatoriosPendientes([
      { tipo_documento: 'FOTO', obligatorio: true, estado: 'APROBADO' },
      { tipo_documento: 'CARNE_EPS', obligatorio: true, estado: 'CARGADO' },
      { tipo_documento: 'DOCUMENTO_IDENTIDAD', estado: 'PENDIENTE' },
      { tipo_documento: 'CUSTODIA_LEGAL_O_PODER', obligatorio: false, estado: 'PENDIENTE' },
      { tipo_documento: 'OTRO_DOCUMENTO', nombre_personalizado: 'Carta del párroco', obligatorio: true, estado: 'RECHAZADO' },
    ]);
    expect(pendientes).toEqual([
      'Certificado o carné de afiliación a EPS',
      'Documento de identidad del estudiante',
      'Carta del párroco',
    ]);
  });

  it('con todo lo obligatorio aprobado no queda nada pendiente', () => {
    expect(documentosObligatoriosPendientes([{ tipo_documento: 'FOTO', estado: 'APROBADO' }])).toEqual([]);
  });
});
