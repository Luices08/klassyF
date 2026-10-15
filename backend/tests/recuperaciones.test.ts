import { describe, expect, it } from 'vitest';
import {
  estadoDeRecuperacion,
  evaluarVentana,
  necesitaRecuperar,
  notaAnual,
  notaTrasRecuperar,
  politicaInicial,
  validarPolitica,
} from '../src/utils/recuperaciones';

const base = { notaOriginal: 2, notaRecuperacion: 4.5, notaAprobatoria: 3, decimales: 1 };

describe('notaTrasRecuperar', () => {
  it('aplica el efecto elegido por el colegio', () => {
    expect(notaTrasRecuperar({ ...base, efecto: 'REEMPLAZA' })).toBe(4.5);
    expect(notaTrasRecuperar({ ...base, efecto: 'LIMITA_A_APROBATORIA' })).toBe(3);
    expect(notaTrasRecuperar({ ...base, efecto: 'PROMEDIA' })).toBe(3.3);
    expect(notaTrasRecuperar({ ...base, efecto: 'LA_MAYOR', notaRecuperacion: 1 })).toBe(2);
  });
});

describe('estado y elegibilidad', () => {
  it('recupera quien está por debajo de la aprobatoria', () => {
    expect(necesitaRecuperar(2.9, 3)).toBe(true);
    expect(necesitaRecuperar(3, 3)).toBe(false);
    expect(estadoDeRecuperacion(null, 3)).toBe('PENDIENTE');
    expect(estadoDeRecuperacion(3, 3)).toBe('SUPERADA');
    expect(estadoDeRecuperacion(2.5, 3)).toBe('NO_SUPERADA');
  });
});

describe('notaAnual', () => {
  it('pondera por porcentaje y no promedia lo que falta', () => {
    expect(notaAnual([{ porcentaje: 50, nota: 2 }, { porcentaje: 50, nota: 4 }], 1)).toBe(3);
    expect(notaAnual([{ porcentaje: 50, nota: 2 }, { porcentaje: 50, nota: null }], 1)).toBeNull();
  });
});

describe('validarPolitica', () => {
  it('rechaza «al iniciar el siguiente» en el último periodo', () => {
    const p = politicaInicial([1, 2, 3]);
    expect(validarPolitica(p, [1, 2, 3])).toBeNull();
    p.periodos[2] = { periodo_numero: 3, aplica: true, momento: 'INICIO_SIGUIENTE_PERIODO' };
    expect(validarPolitica(p, [1, 2, 3])).toMatch(/último/);
    p.periodos[2] = { periodo_numero: 3, aplica: false, momento: 'INICIO_SIGUIENTE_PERIODO' };
    expect(validarPolitica(p, [1, 2, 3])).toBeNull();
  });
});

describe('evaluarVentana', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const periodos = [
    { numero: 1, fecha_inicio: d('2026-02-01'), fecha_fin: d('2026-04-15') },
    { numero: 2, fecha_inicio: d('2026-04-20'), fecha_fin: d('2026-07-01') },
  ];
  const evento = (inicio: string, fin: string) => ({
    tipo: 'RECUPERACION_PERIODO' as const,
    nombre: 'Rec',
    fecha_inicio: d(inicio),
    fecha_fin: d(fin),
    periodo_numero: 1,
  });
  const ahora = new Date('2026-04-22T15:00:00Z');

  it('sin evento no hay ventana', () => {
    const v = evaluarVentana({ tipo: 'PERIODO', periodoNumero: 1, momento: 'FIN_PERIODO', periodos, eventos: [], ahora });
    expect(v.abierta).toBe(false);
  });

  it('exige que el evento coincida con el momento configurado', () => {
    const eventos = [evento('2026-04-21', '2026-04-24')];
    expect(evaluarVentana({ tipo: 'PERIODO', periodoNumero: 1, momento: 'INICIO_SIGUIENTE_PERIODO', periodos, eventos, ahora }).abierta).toBe(true);
    expect(evaluarVentana({ tipo: 'PERIODO', periodoNumero: 1, momento: 'FIN_PERIODO', periodos, eventos, ahora }).abierta).toBe(false);
  });
});
