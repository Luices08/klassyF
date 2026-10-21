import { describe, expect, it } from 'vitest';
import { codigoDeLibro, estudiantesQueBloqueanElLibro, rangoDeFolios } from '../src/utils/libroCalificaciones';

const fila = (extra: Partial<{ numero_documento: string; nombres: string; apellidos: string; promocion: { codigo: string; oficial: boolean } | null }> = {}) => ({
  numero_documento: '1',
  nombres: 'Ana',
  apellidos: 'Pérez',
  promocion: { codigo: 'PROMOVIDO', oficial: true },
  ...extra,
});

describe('quién impide emitir el libro', () => {
  it('con el cierre oficial y un resultado final de todos, se puede emitir', () => {
    const grupos = [{ etiqueta: '6-A', filas: [fila(), fila({ numero_documento: '2', promocion: { codigo: 'NO_PROMOVIDO', oficial: true } }), fila({ numero_documento: '3', promocion: { codigo: 'PROMOVIDO_CON_ARRASTRE', oficial: true } })] }];
    expect(estudiantesQueBloqueanElLibro(grupos)).toEqual([]);
  });

  it('bloquean: sin cierre, proyección, o un resultado que aún espera algo', () => {
    const grupos = [
      {
        etiqueta: '6-A',
        filas: [
          fila({ numero_documento: '1', promocion: null }),
          fila({ numero_documento: '2', promocion: { codigo: 'PROMOVIDO', oficial: false } }),
          fila({ numero_documento: '3', promocion: { codigo: 'PENDIENTE_RECUPERACION', oficial: true } }),
          fila({ numero_documento: '4', promocion: { codigo: 'EN_COMISION', oficial: true } }),
          fila({ numero_documento: '5', promocion: { codigo: 'RETIRO_PROPUESTO', oficial: true } }),
          fila({ numero_documento: '6', promocion: { codigo: 'INCOMPLETO', oficial: true } }),
          fila({ numero_documento: '7' }),
        ],
      },
    ];
    const r = estudiantesQueBloqueanElLibro(grupos);
    expect(r).toHaveLength(6);
    expect(r[0]).toBe('6-A · Pérez Ana (1)');
    expect(r.join(' ')).not.toContain('(7)');
  });
});

describe('consecutivo y folios', () => {
  it('el código lleva el año y el consecutivo con tres cifras', () => {
    expect(codigoDeLibro(2026, 1)).toBe('LC-2026-001');
    expect(codigoDeLibro(2026, 42)).toBe('LC-2026-042');
  });

  it('un libro ocupa desde el folio siguiente al último usado hasta el último reservado, sin huecos', () => {
    expect(rangoDeFolios(12, 12)).toEqual({ inicial: 1, final: 12 });
    expect(rangoDeFolios(30, 18)).toEqual({ inicial: 13, final: 30 });
    // Dos libros seguidos nunca comparten ni dejan folios sueltos.
    const primero = rangoDeFolios(12, 12);
    const segundo = rangoDeFolios(30, 18);
    expect(segundo.inicial).toBe(primero.final + 1);
  });
});
