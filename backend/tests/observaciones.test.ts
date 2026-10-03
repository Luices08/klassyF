import { describe, expect, it } from 'vitest';
import {
  debeRemitirse,
  dentroDelPlazo,
  esSituacionGrave,
  esVisibleParaEstudiante,
  problemasDeFalta,
  tituloDeRegistro,
  visibilidadDeObservacion,
  vistaObservacion,
} from '../src/utils/observaciones';

const observacion = (extra: Partial<Parameters<typeof visibilidadDeObservacion>[1]> = {}) => ({
  clase: 'OBSERVACION' as const,
  estado: 'ACTIVA',
  confidencial: false,
  falta: null,
  ...extra,
});
const falta = (gravedad: 'I' | 'II' | 'III', extra: Partial<Parameters<typeof visibilidadDeObservacion>[1]> = {}) => ({
  clase: 'FALTA' as const,
  estado: 'ACTIVA',
  confidencial: false,
  falta: { gravedad },
  ...extra,
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

describe('esSituacionGrave', () => {
  it('II y III son graves; I y sin gravedad no', () => {
    expect(['I', 'II', 'III', null].map((g) => esSituacionGrave(g as 'I' | null))).toEqual([false, true, true, false]);
  });
});

describe('visibilidadDeObservacion', () => {
  it('ADMIN y coordinación de convivencia lo ven todo, incluso confidencial y anulado', () => {
    for (const rol of ['ADMIN', 'COORDINADOR_CONVIVENCIA'] as const) {
      expect(visibilidadDeObservacion(rol, observacion({ confidencial: true, estado: 'ANULADA' }), false)).toBe('COMPLETA');
      expect(visibilidadDeObservacion(rol, falta('III'), false)).toBe('COMPLETA');
    }
  });

  it('una observación confidencial solo la leen su autor y orientación, no el director, el coordinador ni otro docente', () => {
    const confidencial = observacion({ confidencial: true });
    expect(visibilidadDeObservacion('ORIENTADOR', confidencial, false)).toBe('COMPLETA');
    expect(visibilidadDeObservacion('DOCENTE', confidencial, true)).toBe('COMPLETA');
    expect(visibilidadDeObservacion('DOCENTE', confidencial, false)).toBeNull();
    expect(visibilidadDeObservacion('COORDINADOR', confidencial, false)).toBeNull();
  });

  it('una observación común la ven el director, el coordinador académico y orientación', () => {
    for (const rol of ['DOCENTE', 'COORDINADOR', 'ORIENTADOR'] as const) {
      expect(visibilidadDeObservacion(rol, observacion(), false), rol).toBe('COMPLETA');
    }
  });

  it('lo anulado solo lo ve convivencia', () => {
    expect(visibilidadDeObservacion('DOCENTE', observacion({ estado: 'ANULADA' }), true)).toBeNull();
    expect(visibilidadDeObservacion('ORIENTADOR', falta('I', { estado: 'ANULADA' }), false)).toBeNull();
  });

  it('el coordinador académico no ve ninguna falta', () => {
    for (const gravedad of ['I', 'II', 'III'] as const) {
      expect(visibilidadDeObservacion('COORDINADOR', falta(gravedad), false)).toBeNull();
    }
  });

  it('una falta Tipo I la ven completa el director y orientación; la Tipo II/III solo su autor, el resto solo que existe', () => {
    expect(visibilidadDeObservacion('DOCENTE', falta('I'), false)).toBe('COMPLETA');
    expect(visibilidadDeObservacion('ORIENTADOR', falta('I'), false)).toBe('COMPLETA');
    for (const gravedad of ['II', 'III'] as const) {
      expect(visibilidadDeObservacion('DOCENTE', falta(gravedad), false)).toBe('RESERVADA');
      expect(visibilidadDeObservacion('ORIENTADOR', falta(gravedad), false)).toBe('RESERVADA');
      expect(visibilidadDeObservacion('DOCENTE', falta(gravedad), true)).toBe('COMPLETA');
    }
  });

  it('secretaría, acudiente y estudiante no entran por aquí', () => {
    for (const rol of ['SECRETARIA', 'ACUDIENTE', 'ESTUDIANTE'] as const) {
      expect(visibilidadDeObservacion(rol, observacion(), true), rol).toBeNull();
    }
  });
});

describe('esVisibleParaEstudiante', () => {
  const con = (obs: ReturnType<typeof observacion> | ReturnType<typeof falta>, visible: boolean) => ({ ...obs, visible_estudiante: visible });

  it('ve las observaciones de tipos visibles y nunca las confidenciales', () => {
    expect(esVisibleParaEstudiante(con(observacion(), true))).toBe(true);
    expect(esVisibleParaEstudiante(con(observacion(), false))).toBe(false);
    expect(esVisibleParaEstudiante(con(observacion({ confidencial: true }), true))).toBe(false);
  });

  it('ve sus faltas de cualquier gravedad (de las graves, el servicio solo muestra que hay un caso) y nunca lo anulado', () => {
    for (const gravedad of ['I', 'II', 'III'] as const) expect(esVisibleParaEstudiante(con(falta(gravedad), false)), gravedad).toBe(true);
    expect(esVisibleParaEstudiante(con(observacion({ estado: 'ANULADA' }), true))).toBe(false);
    expect(esVisibleParaEstudiante(con(falta('I', { estado: 'ANULADA' }), true))).toBe(false);
  });
});

describe('problemasDeFalta', () => {
  const presunto = [{ rol: 'PRESUNTO_RESPONSABLE' as const }];

  it('una falta Tipo I solo pide hechos; versión y acuerdo son opcionales', () => {
    expect(problemasDeFalta('I', { hechos: 'Llegó tarde.', involucrados: presunto })).toEqual([]);
    expect(problemasDeFalta('I', { hechos: 'Llegó tarde.', version_estudiante: 'Se me dañó la ruta.', compromiso: 'Llegará a tiempo.', involucrados: presunto })).toEqual([]);
  });

  it('una falta Tipo I no acepta contención ni otros roles', () => {
    const problemas = problemasDeFalta('I', {
      hechos: 'Discusión.',
      acciones_contencion: 'Se separó a los estudiantes.',
      involucrados: [{ rol: 'PRESUNTO_RESPONSABLE' }, { rol: 'AFECTADO' }],
    });
    expect(problemas).toHaveLength(2);
  });

  it('una falta Tipo II/III exige contención y no acepta versión ni acuerdo', () => {
    for (const gravedad of ['II', 'III'] as const) {
      expect(problemasDeFalta(gravedad, { hechos: 'Agresión.', involucrados: presunto })).toEqual(['Una falta Tipo II o III exige las acciones inmediatas de contención.']);
      expect(
        problemasDeFalta(gravedad, {
          hechos: 'Agresión.',
          acciones_contencion: 'Se llevó a enfermería.',
          compromiso: 'No lo volverá a hacer.',
          involucrados: [...presunto, { rol: 'AFECTADO' }, { rol: 'TESTIGO' }],
        })
      ).toHaveLength(1);
      expect(
        problemasDeFalta(gravedad, { hechos: 'Agresión.', acciones_contencion: 'Se llevó a enfermería.', involucrados: [...presunto, { rol: 'AFECTADO' }] })
      ).toEqual([]);
    }
  });

  it('siempre pide hechos y un presunto responsable', () => {
    expect(problemasDeFalta('I', { hechos: '  ', involucrados: [] })).toEqual(['Describe los hechos.', 'Indica al menos un presunto responsable.']);
    expect(problemasDeFalta('II', { hechos: 'x', acciones_contencion: 'Contención inmediata.', involucrados: [{ rol: 'AFECTADO' }] })).toEqual([
      'Indica al menos un presunto responsable.',
    ]);
  });
});

describe('debeRemitirse', () => {
  it('lo grave siempre va a convivencia; lo leve solo si el docente lo decide', () => {
    expect(debeRemitirse('II', false)).toBe(true);
    expect(debeRemitirse('III', undefined)).toBe(true);
    expect(debeRemitirse('I', undefined)).toBe(false);
    expect(debeRemitirse('I', true)).toBe(true);
  });
});

describe('vistaObservacion', () => {
  const obs = {
    _id: 'o1',
    student_id: 'e1',
    clase: 'FALTA' as const,
    fecha_hecho: new Date('2026-03-02T00:00:00Z'),
    periodo_numero: 1,
    tipo_id: null,
    tipo_nombre: '',
    visible_estudiante: false,
    requiere_citacion: false,
    confidencial: false,
    citacion_realizada: null,
    falta: { falta_id: 'f1', codigo: '3.3', descripcion: 'Agrede físicamente a un miembro de la comunidad.', gravedad: 'II' as const },
    version_estudiante: '',
    solicitud_id: 's1',
    descripcion: 'relato con detalles',
    compromiso: '',
    compromiso_estado: null,
    contexto: 'CLASE',
    estado: 'ACTIVA',
    autor_id: 'd1',
    registrado_por: 'd1',
    group_id: 'g1',
    evento_id: 'ev1',
    anulacion: null,
    enmiendas: [],
    seguimientos: [],
    createdAt: new Date(),
  };

  it('la vista reservada solo dice que hay una falta y su gravedad', () => {
    const v = vistaObservacion(obs, 'RESERVADA') as Record<string, unknown>;
    expect(v).toMatchObject({ reservada: true, gravedad: 'II', clase: 'FALTA' });
    for (const campo of ['descripcion', 'falta', 'autor_id', 'evento_id', 'solicitud_id', 'tipo_nombre', 'version_estudiante']) {
      expect(v).not.toHaveProperty(campo);
    }
  });

  it('la vista del estudiante de una falta grave no trae la falta, los hechos ni quién la registró', () => {
    const v = vistaObservacion(obs, 'ESTUDIANTE');
    expect(Object.keys(v).sort()).toEqual(['_id', 'clase', 'fecha_hecho', 'gravedad', 'periodo_numero', 'tipo_nombre']);
    expect(v).toMatchObject({ tipo_nombre: 'Situación de convivencia', gravedad: 'II' });
  });

  it('la vista del estudiante de una observación o de una falta Tipo I trae el texto final', () => {
    expect(Object.keys(vistaObservacion({ ...obs, clase: 'OBSERVACION', falta: null, tipo_nombre: 'Académica' }, 'ESTUDIANTE')).sort()).toEqual([
      '_id',
      'clase',
      'descripcion',
      'fecha_hecho',
      'periodo_numero',
      'tipo_nombre',
    ]);
    const leve = vistaObservacion({ ...obs, falta: { ...obs.falta, gravedad: 'I' as const }, version_estudiante: 'Mi versión' }, 'ESTUDIANTE');
    expect(leve).toMatchObject({ tipo_nombre: 'Falta 3.3', gravedad: 'I', descripcion: 'relato con detalles', version_estudiante: 'Mi versión' });
    expect(leve).not.toHaveProperty('autor_id');
  });

  it('la vista completa trae el contenido y rotula la falta con su código', () => {
    expect(vistaObservacion(obs, 'COMPLETA')).toMatchObject({ reservada: false, descripcion: 'relato con detalles', tipo_nombre: 'Falta 3.3', gravedad: 'II' });
    expect(tituloDeRegistro({ clase: 'OBSERVACION', tipo_nombre: 'Académica', falta: null })).toBe('Académica');
  });
});
