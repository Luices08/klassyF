import { describe, expect, it } from 'vitest';
import {
  alertasDeCaso,
  CasoParaCierre,
  esEscalamiento,
  pasosFaltantes,
  pendientesParaCerrar,
  puedeTransicionar,
  TRANSICIONES_CASO,
} from '../src/dominios/bienestar/convivencia/casoConvivencia';
import { ESTADOS_CASO } from '../src/dominios/bienestar/comun/convivencia.constants';

describe('transiciones del caso', () => {
  it('permite el flujo normal y la remisión, y no deja volver atrás', () => {
    expect(puedeTransicionar('ABIERTO', 'EN_ATENCION')).toBe(true);
    expect(puedeTransicionar('EN_ATENCION', 'EN_MEDIACION')).toBe(true);
    expect(puedeTransicionar('EN_MEDIACION', 'REMITIDO')).toBe(true);
    expect(puedeTransicionar('REMITIDO', 'EN_SEGUIMIENTO')).toBe(true);
    expect(puedeTransicionar('EN_SEGUIMIENTO', 'EN_ATENCION')).toBe(false);
    expect(puedeTransicionar('EN_ATENCION', 'ABIERTO')).toBe(false);
  });

  it('cerrar, reabrir y anular no son transiciones genéricas', () => {
    for (const estado of ESTADOS_CASO) {
      expect(TRANSICIONES_CASO[estado]).not.toContain('CERRADO');
      expect(TRANSICIONES_CASO[estado]).not.toContain('ANULADO');
      expect(TRANSICIONES_CASO[estado]).not.toContain('REABIERTO');
    }
    expect(TRANSICIONES_CASO.CERRADO).toEqual([]);
    expect(TRANSICIONES_CASO.ANULADO).toEqual([]);
  });

  it('solo es escalamiento subir de tipo', () => {
    expect(esEscalamiento('I', 'II')).toBe(true);
    expect(esEscalamiento('II', 'III')).toBe(true);
    expect(esEscalamiento('III', 'II')).toBe(false);
    expect(esEscalamiento('II', 'II')).toBe(false);
  });
});

const casoBase = (extra: Partial<CasoParaCierre> = {}): CasoParaCierre => ({
  tipo_situacion: 'I',
  pasos: [],
  atencion_inmediata: null,
  notificaciones: [],
  remisiones: [],
  justificacion_sin_remision: '',
  decision: null,
  medidas_aplicadas: [],
  ...extra,
});

describe('pendientesParaCerrar', () => {
  it('un tipo I sin pasos obligatorios se puede cerrar', () => {
    expect(pendientesParaCerrar(casoBase(), 'SOLUCIONADO')).toEqual([]);
  });

  it('lista los pasos obligatorios pendientes e ignora los opcionales', () => {
    const faltan = pendientesParaCerrar(
      casoBase({
        pasos: [
          { nombre: 'Diálogo con el estudiante', obligatorio: true, estado: 'PENDIENTE' },
          { nombre: 'Mediación', obligatorio: false, estado: 'PENDIENTE' },
          { nombre: 'Citación', obligatorio: true, estado: 'NO_APLICA' },
        ],
      }),
      'SOLUCIONADO'
    );
    expect(faltan).toEqual(['Paso obligatorio pendiente: Diálogo con el estudiante.']);
  });

  it('el tipo II exige atención inmediata e informe a los acudientes', () => {
    expect(pendientesParaCerrar(casoBase({ tipo_situacion: 'II' }), 'SOLUCIONADO')).toHaveLength(2);
    expect(
      pendientesParaCerrar(casoBase({ tipo_situacion: 'II', atencion_inmediata: {}, notificaciones: [{ tipo: 'ACUDIENTES' }] }), 'SOLUCIONADO')
    ).toEqual([]);
  });

  it('el tipo III además exige remisión o su justificación', () => {
    const base = { tipo_situacion: 'III' as const, atencion_inmediata: {}, notificaciones: [{ tipo: 'ACUDIENTES' }] };
    expect(pendientesParaCerrar(casoBase(base), 'SOLUCIONADO')).toHaveLength(1);
    expect(pendientesParaCerrar(casoBase({ ...base, remisiones: [{}] }), 'SOLUCIONADO')).toEqual([]);
    expect(pendientesParaCerrar(casoBase({ ...base, justificacion_sin_remision: 'No hubo delito.' }), 'SOLUCIONADO')).toEqual([]);
  });

  it('el resultado condiciona lo que se exige', () => {
    expect(pendientesParaCerrar(casoBase(), 'REMITIDO')).toHaveLength(1);
    expect(pendientesParaCerrar(casoBase(), 'MEDIDA_APLICADA')).toHaveLength(2);
    expect(pendientesParaCerrar(casoBase({ decision: {}, medidas_aplicadas: [{}] }), 'MEDIDA_APLICADA')).toEqual([]);
  });
});

describe('pasosFaltantes', () => {
  it('trae solo los pasos del protocolo que el caso no tiene, sin distinguir mayúsculas', () => {
    expect(
      pasosFaltantes([{ nombre: 'Descargos' }], [{ nombre: 'descargos' }, { nombre: 'Remisión' }, { nombre: ' Citación ' }])
    ).toEqual([{ nombre: 'Remisión' }, { nombre: ' Citación ' }]);
  });
});

describe('alertasDeCaso', () => {
  const hoy = new Date('2026-03-10T00:00:00Z');
  const ahora = new Date('2026-03-10T15:00:00Z');
  const politica = { plazo_remision_tipo_iii_horas: 24 };
  const caso = {
    tipo_situacion: 'III' as const,
    estado: 'EN_ATENCION' as const,
    createdAt: new Date('2026-03-09T10:00:00Z'),
    remisiones: [],
    justificacion_sin_remision: '',
    seguimientos: [],
  };

  it('avisa del tipo III sin remisión pasado el plazo y no antes', () => {
    expect(alertasDeCaso(caso, politica, ahora, hoy).map((a) => a.codigo)).toEqual(['REMISION_TIPO_III_PENDIENTE']);
    expect(alertasDeCaso({ ...caso, createdAt: new Date('2026-03-10T10:00:00Z') }, politica, ahora, hoy)).toEqual([]);
    expect(alertasDeCaso({ ...caso, remisiones: [{}] }, politica, ahora, hoy)).toEqual([]);
  });

  it('avisa del seguimiento vencido según su próxima fecha', () => {
    const conSeguimiento = { ...caso, tipo_situacion: 'I' as const, seguimientos: [{ proxima_fecha: new Date('2026-03-05T00:00:00Z') }] };
    expect(alertasDeCaso(conSeguimiento, politica, ahora, hoy).map((a) => a.codigo)).toEqual(['SEGUIMIENTO_VENCIDO']);
    const alDia = { ...conSeguimiento, seguimientos: [{ proxima_fecha: new Date('2026-03-12T00:00:00Z') }] };
    expect(alertasDeCaso(alDia, politica, ahora, hoy)).toEqual([]);
  });

  it('un caso cerrado o anulado no genera alertas', () => {
    expect(alertasDeCaso({ ...caso, estado: 'CERRADO' }, politica, ahora, hoy)).toEqual([]);
  });
});
