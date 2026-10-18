import { describe, expect, it } from 'vitest';
import { titulacionInicial } from '../src/utils/promocion';
import { estadoDeTitulacion, evaluarRequisitos, gradosSinCertificado } from '../src/utils/titulacion';

const completo = { grado_numero: 11, horas_servicio_social: 80, presento_saber_11: true, paz_y_salvo_confirmado: true, grados_sin_certificado: [] };

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

  it('la carpeta pide los grados anteriores que no tienen certificado', () => {
    const p = { ...politica, carpeta_academica: { activo: true, desde_grado: 8 } };
    expect(gradosSinCertificado(p, new Set([8, 10]))).toEqual([9]);
    const r = evaluarRequisitos({ ...completo, grados_sin_certificado: [9] }, p);
    expect(r.pendientes[0]).toMatchObject({ requisito: 'CARPETA_ACADEMICA' });
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
