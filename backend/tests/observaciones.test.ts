import { describe, expect, it } from 'vitest';
import {
  dentroDelPlazo,
  esSeguimientoDeOrientacion,
  esGraveEnTramite,
  esSituacionGrave,
  esVisibleParaEstudiante,
  MENSAJE_FALTA_GRAVE,
  problemasDeFalta,
  problemasDeReporteUrgente,
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
  // Lo grave que sigue su curso en convivencia tiene una solicitud; la Tipo II que el docente resolvió no.
  solicitud_id: gravedad === 'I' ? null : 'solicitud',
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

describe('esGraveEnTramite', () => {
  it('una Tipo II/III con solicitud sigue en convivencia; una Tipo II que el docente resolvió o una Tipo I no', () => {
    expect(esGraveEnTramite(falta('II'))).toBe(true);
    expect(esGraveEnTramite(falta('III'))).toBe(true);
    expect(esGraveEnTramite(falta('II', { solicitud_id: null }))).toBe(false);
    expect(esGraveEnTramite(falta('I'))).toBe(false);
  });

  it('la Tipo II resuelta por el docente la ven completa el director y orientación, como una Tipo I', () => {
    expect(visibilidadDeObservacion('DOCENTE', falta('II', { solicitud_id: null }), false)).toBe('COMPLETA');
    expect(visibilidadDeObservacion('ORIENTADOR', falta('II', { solicitud_id: null }), false)).toBe('COMPLETA');
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

  it('el seguimiento psicosocial de orientación solo lo lee su autor y el ADMIN, aunque sea de convivencia u otro orientador', () => {
    const psicosocial = observacion({ confidencial: true, contexto: 'ORIENTACION' });
    expect(visibilidadDeObservacion('ORIENTADOR', psicosocial, true)).toBe('COMPLETA');
    expect(visibilidadDeObservacion('ADMIN', psicosocial, false)).toBe('COMPLETA');
    for (const rol of ['ORIENTADOR', 'COORDINADOR_CONVIVENCIA', 'COORDINADOR', 'DOCENTE'] as const) {
      expect(visibilidadDeObservacion(rol, psicosocial, false), rol).toBeNull();
    }
    expect(esSeguimientoDeOrientacion(psicosocial)).toBe(true);
    expect(esSeguimientoDeOrientacion(observacion({ confidencial: true }))).toBe(false);
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
  it('una falta Tipo I solo pide hechos', () => {
    expect(problemasDeFalta('I', { hechos: 'Llegó tarde.' })).toEqual([]);
    expect(problemasDeFalta('I', { hechos: '  ' })).toEqual(['Describe los hechos.']);
  });

  it('una Tipo II que el docente resolvió se registra como falta; una Tipo III siempre va a coordinación', () => {
    expect(problemasDeFalta('II', { hechos: 'Empujón en el patio.' })).toEqual([]);
    expect(problemasDeFalta('III', { hechos: 'Agresión.' })).toEqual([MENSAJE_FALTA_GRAVE]);
  });
});

describe('problemasDeReporteUrgente', () => {
  const base = { hechos: 'Se agredieron en el patio.', acciones_contencion: 'Se llevó a uno a enfermería.', cantidad_estudiantes: 2 };

  it('un reporte completo no tiene problemas: no pide falta, gravedad ni roles', () => {
    expect(problemasDeReporteUrgente(base)).toEqual([]);
  });

  it('exige los hechos, la contención inmediata y al menos un estudiante', () => {
    expect(problemasDeReporteUrgente({ ...base, hechos: '  ' })).toEqual(['Describe los hechos.']);
    expect(problemasDeReporteUrgente({ ...base, acciones_contencion: 'ok' })).toEqual(['Indica la medida de contención inmediata que tomaste.']);
    expect(problemasDeReporteUrgente({ ...base, cantidad_estudiantes: 0 })).toEqual(['Indica al menos un estudiante involucrado.']);
    expect(problemasDeReporteUrgente({ hechos: '', acciones_contencion: '', cantidad_estudiantes: 0 })).toHaveLength(3);
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
