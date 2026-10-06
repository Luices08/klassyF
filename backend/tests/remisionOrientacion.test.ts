import { describe, expect, it } from 'vitest';
import { claveDeRemision, involucradosARemitir } from '../src/dominios/bienestar/orientacion/remisionOrientacion';

describe('involucradosARemitir', () => {
  it('remite a los afectados y a los presuntos responsables, no a testigos ni reportantes', () => {
    const involucrados = [
      { id: 'a', rol: 'AFECTADO' as const },
      { id: 'b', rol: 'PRESUNTO_RESPONSABLE' as const },
      { id: 'c', rol: 'TESTIGO' as const },
      { id: 'd', rol: 'REPORTANTE' as const },
    ];
    expect(involucradosARemitir(involucrados).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('sin afectados ni presuntos responsables no hay a quién remitir', () => {
    expect(involucradosARemitir([{ rol: 'TESTIGO' as const }])).toEqual([]);
  });
});

describe('claveDeRemision', () => {
  it('es la misma para el mismo caso, estudiante y origen, y distinta si cambia cualquiera', () => {
    const base = claveDeRemision('c1', 's1', 'MEDIDA', 'm1');
    expect(claveDeRemision('c1', 's1', 'MEDIDA', 'm1')).toBe(base);
    expect(claveDeRemision('c1', 's2', 'MEDIDA', 'm1')).not.toBe(base);
    expect(claveDeRemision('c1', 's1', 'PASO', 'm1')).not.toBe(base);
    expect(claveDeRemision('c1', 's1', 'MEDIDA', 'm2')).not.toBe(base);
  });
});
