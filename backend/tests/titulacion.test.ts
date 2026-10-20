import { describe, expect, it } from 'vitest';
import { titulacionInicial } from '../src/utils/promocion';
import { estadoDeTitulacion, evaluarRequisitos } from '../src/utils/titulacion';

const completo = { grado_numero: 11, horas_servicio_social: 80, presento_saber_11: true, paz_y_salvo_confirmado: true };

describe('requisitos de titulación', () => {
  const politica = titulacionInicial();

  it('quien cumple todo no tiene pendientes', () => {
    expect(evaluarRequisitos(completo, politica).pendientes).toEqual([]);
  });

  it('dice cuántas horas de servicio social faltan', () => {
    const { pendientes } = evaluarRequisitos({ ...completo, horas_servicio_social: 40 }, politica);
    expect(pendientes).toEqual([{ requisito: 'SERVICIO_SOCIAL', detalle: expect.stringMatching(/Debe 40 horas/) }]);
  });

  it('en 10° el servicio social solo avisa y no bloquea', () => {
    const r = evaluarRequisitos({ ...completo, grado_numero: 10, horas_servicio_social: 20, presento_saber_11: false }, politica);
    expect(r.pendientes).toEqual([]);
    expect(r.alertas).toHaveLength(1);
    // Antes del grado desde el que avisa, ni siquiera avisa.
    expect(evaluarRequisitos({ ...completo, grado_numero: 9, horas_servicio_social: 0 }, politica).alertas).toEqual([]);
  });

  it('cada requisito se puede apagar o endurecer desde la política', () => {
    const sinSaber = { ...politica, saber_11: { activo: false }, servicio_social: { ...politica.servicio_social, horas_requeridas: 120 } };
    const r = evaluarRequisitos({ ...completo, presento_saber_11: false, horas_servicio_social: 100 }, sinSaber);
    expect(r.pendientes.map((p) => p.requisito)).toEqual(['SERVICIO_SOCIAL']);
  });

});

describe('estado de titulación', () => {
  const pendiente = [{ requisito: 'SABER_11' as const, detalle: 'x' }];

  it('no aplica si no aprobó el grado', () => {
    expect(estadoDeTitulacion(false, [], null)).toBeNull();
  });

  it('cumple todo: graduado; le falta algo: aprobó pero no graduado', () => {
    expect(estadoDeTitulacion(true, [], null)).toBe('GRADUADO');
    expect(estadoDeTitulacion(true, pendiente, null)).toBe('APROBO_NO_GRADUADO');
  });

  it('cumplir después es grado extemporáneo y lo ya graduado no retrocede', () => {
    expect(estadoDeTitulacion(true, [], 'APROBO_NO_GRADUADO')).toBe('GRADUADO_EXTEMPORANEO');
    expect(estadoDeTitulacion(true, pendiente, 'GRADUADO')).toBe('GRADUADO');
    expect(estadoDeTitulacion(true, pendiente, 'GRADUADO_EXTEMPORANEO')).toBe('GRADUADO_EXTEMPORANEO');
  });
});

describe('titulación solo del grado 11', () => {
  it('una política con otro grado de titulación se evalúa igual: el grado es fijo', async () => {
    const { GRADO_TITULACION } = await import('../src/constants/titulacion');
    expect(GRADO_TITULACION).toBe(11);
    const otra = { ...titulacionInicial(), grado_titulacion: 5 };
    // En 5° nada bloquea aunque la política diga 5: solo el 11 bloquea.
    expect(evaluarRequisitos({ ...completo, grado_numero: 5, horas_servicio_social: 0, presento_saber_11: false }, otra).pendientes).toEqual([]);
    expect(evaluarRequisitos({ ...completo, grado_numero: 11, horas_servicio_social: 0 }, otra).pendientes).toHaveLength(1);
  });

  it('la carpeta académica ya no es un requisito: los certificados de otros grados se piden en la matrícula', () => {
    const pendientes = evaluarRequisitos(completo, { ...titulacionInicial(), carpeta_academica: { activo: true, desde_grado: 1 } }).pendientes;
    expect(pendientes).toEqual([]);
  });

  it('el registro de Saber 11 es AC y de 8 a 12 dígitos', async () => {
    const { PATRON_REGISTRO_SABER_11: patron } = await import('../src/constants/titulacion');
    expect(patron.test('AC202612345678')).toBe(true);
    // Las dos formas que se usan: AC + 8 dígitos y AC + año + 8 dígitos.
    for (const bueno of ['AC23245678', 'AC202612345678']) expect(patron.test(bueno)).toBe(true);
    for (const malo of ['ac23245678', 'AC2324567', 'AC2026123456789', 'AC2026ABCDEFGH', 'SB11202612345', '']) expect(patron.test(malo)).toBe(false);
    const { normalizarRegistroSaber11: normalizar } = await import('../src/constants/titulacion');
    expect(normalizar(' ac-2324 5678 ')).toBe('AC23245678');
  });
});
