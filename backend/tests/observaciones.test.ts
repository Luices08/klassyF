import { describe, expect, it } from 'vitest';
import {
  componerTextoObservacion,
  dentroDelPlazo,
  esCompromisoVencido,
  esSituacionGrave,
  tipoSituacionMaxima,
  vistaObservacion,
} from '../src/utils/observaciones';

describe('componerTextoObservacion', () => {
  it('pone una línea por frase, con su código, y luego el comentario', () => {
    expect(
      componerTextoObservacion(
        [
          { codigo: '1.3', texto: 'Debe estar puntual en clase.' },
          { codigo: null, texto: 'Participa activamente.' },
        ],
        '  Llegó tarde dos veces.  '
      )
    ).toBe('1.3. Debe estar puntual en clase.\nParticipa activamente.\nLlegó tarde dos veces.');
  });

  it('solo comentario o solo frases', () => {
    expect(componerTextoObservacion([], 'Texto libre')).toBe('Texto libre');
    expect(componerTextoObservacion([{ codigo: null, texto: 'Frase' }], '')).toBe('Frase');
  });
});

describe('tipoSituacionMaxima', () => {
  it('toma el mayor tipo y respeta el orden I < II < III', () => {
    expect(tipoSituacionMaxima([{ tipo_situacion: 'I' }, { tipo_situacion: 'III' }, { tipo_situacion: 'II' }])).toBe('III');
    expect(tipoSituacionMaxima([{ tipo_situacion: 'I' }, { tipo_situacion: null }])).toBe('I');
  });

  it('sin tipos devuelve null', () => {
    expect(tipoSituacionMaxima([])).toBeNull();
    expect(tipoSituacionMaxima([{ tipo_situacion: null }])).toBeNull();
  });

  it('II y III son graves; I y null no', () => {
    expect(['I', 'II', 'III', null].map((t) => esSituacionGrave(t as 'I' | null))).toEqual([false, true, true, false]);
  });
});

describe('dentroDelPlazo', () => {
  const desde = new Date('2026-03-02T10:00:00Z');
  it('es verdadero antes de cumplirse el plazo y falso después', () => {
    expect(dentroDelPlazo(desde, 48, new Date('2026-03-04T09:59:00Z'))).toBe(true);
    expect(dentroDelPlazo(desde, 48, new Date('2026-03-04T10:00:00Z'))).toBe(false);
  });

  it('plazo 0 nunca está vigente', () => {
    expect(dentroDelPlazo(desde, 0, desde)).toBe(false);
  });
});

describe('esCompromisoVencido', () => {
  const hoy = new Date('2026-03-10T00:00:00Z');
  it('vence solo después de la fecha límite y solo si sigue pendiente', () => {
    expect(esCompromisoVencido({ estado: 'PENDIENTE', fecha_limite: new Date('2026-03-09T00:00:00Z') }, hoy)).toBe(true);
    expect(esCompromisoVencido({ estado: 'PENDIENTE', fecha_limite: hoy }, hoy)).toBe(false);
    expect(esCompromisoVencido({ estado: 'CUMPLIDO', fecha_limite: new Date('2026-03-01T00:00:00Z') }, hoy)).toBe(false);
  });
});

describe('vistaObservacion', () => {
  const obs = {
    _id: 'o1',
    student_id: 'e1',
    fecha_hecho: new Date('2026-03-02T00:00:00Z'),
    periodo_numero: 1,
    tipo_id: 't1',
    tipo_nombre: 'Disciplinaria',
    familia: 'DISCIPLINARIA',
    tipo_situacion_maxima: 'II' as const,
    descriptores: [{ texto: 'x' }],
    comentario: 'relato con detalles',
    texto_generado: 'x\nrelato con detalles',
    contexto: 'CLASE',
    estado: 'ACTIVA',
    autor_id: 'd1',
    registrado_por: 'd1',
    group_id: 'g1',
    evento_id: 'ev1',
    anulacion: null,
    enmiendas: [],
    compromisos: [],
    citaciones: [],
    solicitud_caso: null,
    createdAt: new Date(),
  };

  it('la vista reservada no trae contenido ni autor', () => {
    const v = vistaObservacion(obs, 'RESERVADA') as Record<string, unknown>;
    expect(v.reservada).toBe(true);
    expect(v.tipo_situacion_maxima).toBe('II');
    for (const campo of ['texto_generado', 'comentario', 'descriptores', 'autor_id', 'evento_id']) {
      expect(v).not.toHaveProperty(campo);
    }
  });

  it('la vista del estudiante solo trae el texto final', () => {
    expect(Object.keys(vistaObservacion(obs, 'ESTUDIANTE')).sort()).toEqual(
      ['_id', 'fecha_hecho', 'periodo_numero', 'texto_generado', 'tipo_nombre'].sort()
    );
  });

  it('la vista completa trae el contenido', () => {
    expect(vistaObservacion(obs, 'COMPLETA')).toMatchObject({ reservada: false, comentario: 'relato con detalles' });
  });
});
