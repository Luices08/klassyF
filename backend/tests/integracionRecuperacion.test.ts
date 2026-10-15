import { describe, expect, it } from 'vitest';
import { INTEGRACION_INICIAL, IntegracionPeriodo, integrarRecuperacion, validarIntegracion } from '../src/utils/integracionRecuperacion';

// Heteroevaluación 70% (3 notas) y Autoevaluación 30% (1 nota).
const bloques = [
  { clave: 'HETERO', nombre: 'Heteroevaluación', porcentaje: 70 },
  { clave: 'AUTO', nombre: 'Autoevaluación', porcentaje: 30 },
];
const casillas = [
  { id: 'a', bloque: 'HETERO', peso: null, titulo: 'Taller' },
  { id: 'b', bloque: 'HETERO', peso: null, titulo: 'Quiz' },
  { id: 'c', bloque: 'HETERO', peso: null, titulo: 'Examen' },
  { id: 'd', bloque: 'AUTO', peso: null, titulo: 'Autoevaluación' },
];
const notas = new Map([
  ['a', 2],
  ['b', 3],
  ['c', 1],
  ['d', 4],
]);
// HETERO = 2.0, AUTO = 4.0 → 2*0.7 + 4*0.3 = 2.6
const base = { bloques, casillas, notas, notaAprobatoria: 3, decimales: 2 };
const integracion = (cambios: Partial<IntegracionPeriodo>): IntegracionPeriodo => ({ ...INTEGRACION_INICIAL, ...cambios });

describe('integrarRecuperacion', () => {
  it('reemplaza la nota más baja y recalcula la asignatura', () => {
    const r = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'REEMPLAZA_NOTA_MAS_BAJA' }), notaRecuperacion: 4 });
    // El examen (1) pasa a 4: HETERO = 3.0 → 3*0.7 + 4*0.3 = 3.3
    expect(r.aplicada).toBe(true);
    expect(r.nota).toBe(3.3);
    expect(r.detalle).toMatch(/Examen/);
  });

  it('puede buscar la nota más baja solo dentro de un bloque', () => {
    const r = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'REEMPLAZA_NOTA_MAS_BAJA', bloque_clave: 'AUTO' }), notaRecuperacion: 5 });
    // Solo la autoevaluación (4) → 5: 2*0.7 + 5*0.3 = 2.9
    expect(r.nota).toBe(2.9);
  });

  it('reemplaza la nota de un bloque completo', () => {
    const r = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'REEMPLAZA_BLOQUE', bloque_clave: 'HETERO' }), notaRecuperacion: 4 });
    // HETERO = 4 → 4*0.7 + 4*0.3 = 4
    expect(r.nota).toBe(4);
    expect(r.bloques.find((b) => b.clave === 'HETERO')?.nota).toBe(4);
  });

  it('suma la recuperación como una nota más del bloque, con o sin peso propio', () => {
    const igual = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'CASILLA_ADICIONAL', bloque_clave: 'HETERO' }), notaRecuperacion: 5 });
    // HETERO = (2+3+1+5)/4 = 2.75 → 2.75*0.7 + 4*0.3 = 3.125
    expect(igual.nota).toBe(3.13);
    const conPeso = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'CASILLA_ADICIONAL', bloque_clave: 'HETERO', peso: 50 }), notaRecuperacion: 5 });
    // Las otras tres se reparten el otro 50% (16.67% c/u): HETERO = 2*(1/6)... = (2+3+1)/6 + 5*0.5 = 3.5 → 3.5*0.7 + 1.2 = 3.65
    expect(conPeso.nota).toBe(3.65);
  });

  it('si el colegio exige que mejore, una recuperación peor no baja la nota', () => {
    const exige = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'CASILLA_ADICIONAL', bloque_clave: 'HETERO', solo_si_mejora: true }), notaRecuperacion: 0.5 });
    expect(exige.aplicada).toBe(false);
    expect(exige.nota).toBe(2.6);
    const noExige = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'CASILLA_ADICIONAL', bloque_clave: 'HETERO', solo_si_mejora: false }), notaRecuperacion: 0.5 });
    expect(noExige.aplicada).toBe(true);
    expect(noExige.nota).toBeLessThan(2.6);
  });

  it('puede limitar el resultado a la nota aprobatoria', () => {
    const r = integrarRecuperacion({ ...base, integracion: integracion({ modo: 'REEMPLAZA_BLOQUE', bloque_clave: 'HETERO', tope_aprobatoria: true }), notaRecuperacion: 5 });
    expect(r.nota).toBe(3);
  });
});

describe('validarIntegracion', () => {
  it('exige bloque donde el modo lo necesita y que exista en el molde', () => {
    expect(validarIntegracion(integracion({ modo: 'CASILLA_ADICIONAL' }), ['HETERO'])).toMatch(/bloque/i);
    expect(validarIntegracion(integracion({ modo: 'REEMPLAZA_BLOQUE', bloque_clave: 'OTRO' }), ['HETERO'])).toMatch(/no existe/);
    expect(validarIntegracion(integracion({ modo: 'REEMPLAZA_BLOQUE', bloque_clave: 'HETERO' }), ['HETERO'])).toBeNull();
    expect(validarIntegracion(integracion({ modo: 'CASILLA_ADICIONAL', bloque_clave: 'HETERO', peso: 150 }), ['HETERO'])).toMatch(/peso/i);
    expect(validarIntegracion(INTEGRACION_INICIAL, ['HETERO'])).toBeNull();
  });
});
