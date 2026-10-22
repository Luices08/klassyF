import { describe, expect, it } from 'vitest';
import { diasHasta, etiquetaDeRecuperacion, hoyEnColombia, momentoDeAviso, textoDeVentana, ultimoDiaDeLaVentana } from '../src/utils/avisosRecuperacion';

// 22/10/2026 a las 10:00 en Colombia = 15:00 UTC.
const AHORA = new Date('2026-10-22T15:00:00Z');
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('hoyEnColombia / diasHasta', () => {
  it('«hoy» es el día de calendario en Colombia, no el UTC', () => {
    // 23/10 02:00 UTC todavía es 22/10 21:00 en Colombia.
    expect(hoyEnColombia(new Date('2026-10-23T02:00:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(hoyEnColombia(AHORA).toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });

  it('cuenta días de calendario hasta una fecha del colegio', () => {
    expect(diasHasta(AHORA, dia('2026-10-22'))).toBe(0);
    expect(diasHasta(AHORA, dia('2026-10-23'))).toBe(1);
    expect(diasHasta(AHORA, dia('2026-10-21'))).toBe(-1);
    // Una fecha guardada al final del día UTC es el mismo día de calendario.
    expect(diasHasta(AHORA, new Date('2026-10-22T23:59:59.000Z'))).toBe(0);
  });
});

describe('momentoDeAviso', () => {
  const ventana = { fecha_inicio: dia('2026-10-22'), fecha_fin: dia('2026-11-13') };

  it('el día que empieza avisa el inicio y está abierta', () => {
    expect(momentoDeAviso(AHORA, ventana)).toEqual({ iniciaHoy: true, terminaManana: false, abierta: true });
  });

  it('antes de empezar no está abierta ni avisa', () => {
    expect(momentoDeAviso(new Date('2026-10-20T15:00:00Z'), ventana)).toEqual({ iniciaHoy: false, terminaManana: false, abierta: false });
  });

  it('el día antes del último día avisa que mañana termina', () => {
    expect(momentoDeAviso(new Date('2026-11-12T15:00:00Z'), ventana)).toEqual({ iniciaHoy: false, terminaManana: true, abierta: true });
  });

  it('el último día ya no avisa «mañana» y después está cerrada', () => {
    expect(momentoDeAviso(new Date('2026-11-13T15:00:00Z'), ventana)).toMatchObject({ terminaManana: false, abierta: true });
    expect(momentoDeAviso(new Date('2026-11-14T15:00:00Z'), ventana).abierta).toBe(false);
  });

  it('el plazo para registrar resultados manda sobre el fin del evento', () => {
    const conPlazo = { ...ventana, fecha_limite_resultados: dia('2026-11-20') };
    expect(ultimoDiaDeLaVentana(conPlazo).toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(momentoDeAviso(new Date('2026-11-19T15:00:00Z'), conPlazo).terminaManana).toBe(true);
    expect(momentoDeAviso(new Date('2026-11-12T15:00:00Z'), conPlazo).terminaManana).toBe(false);
  });

  it('una ventana de un solo día avisa el inicio y no el «mañana termina»', () => {
    const unDia = { fecha_inicio: dia('2026-10-22'), fecha_fin: dia('2026-10-22') };
    expect(momentoDeAviso(AHORA, unDia)).toEqual({ iniciaHoy: true, terminaManana: false, abierta: true });
    expect(momentoDeAviso(new Date('2026-10-21T15:00:00Z'), unDia).terminaManana).toBe(false);
  });
});

describe('textos', () => {
  it('escribe la ventana con día y mes', () => {
    expect(textoDeVentana({ fecha_inicio: dia('2026-10-22'), fecha_fin: dia('2026-11-13') })).toBe('del 22/10 al 13/11');
    expect(textoDeVentana({ fecha_inicio: dia('2026-10-22'), fecha_fin: dia('2026-10-22') })).toBe('el 22/10');
    expect(textoDeVentana({ fecha_inicio: dia('2026-10-22'), fecha_fin: dia('2026-10-30'), fecha_limite_resultados: dia('2026-11-02') })).toBe('del 22/10 al 02/11');
  });

  it('nombra la recuperación', () => {
    expect(etiquetaDeRecuperacion('PERIODO', 2)).toBe('la recuperación del periodo 2');
    expect(etiquetaDeRecuperacion('ANUAL')).toBe('la recuperación de fin de año');
  });
});
