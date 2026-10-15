import { describe, expect, it } from 'vitest';
import { TIPO_DE_JORNADA } from '../src/constants/planeacion';
import {
  AlcanceLider,
  CoberturaConPlan,
  Rebanada,
  alcanceCubre,
  alcancesSeSolapan,
  planAreaDeClase,
  rebanadasSinCubrir,
  textoDeAlcance,
  textoDeRebanadas,
} from '../src/utils/liderArea';

const todo: AlcanceLider = { niveles: [], jornada: 'TODAS', sedes_ids: [] };
const alcance = (extra: Partial<AlcanceLider>): AlcanceLider => ({ ...todo, ...extra });
const rebanada = (extra: Partial<Rebanada> = {}): Rebanada => ({ nivel: 'PRIMARIA', jornada: 'DIURNA', sede_id: 's1', ...extra });

describe('tipo de jornada', () => {
  it('la mañana, la tarde y la única son diurnas; la nocturna y la sabatina, nocturnas', () => {
    expect(TIPO_DE_JORNADA).toEqual({ MANANA: 'DIURNA', TARDE: 'DIURNA', UNICA: 'DIURNA', NOCTURNA: 'NOCTURNA', SABATINA: 'NOCTURNA' });
  });
});

describe('alcanceCubre', () => {
  it('el alcance por defecto (colegio pequeño: un solo líder) cubre todo', () => {
    for (const nivel of ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'] as const) {
      expect(alcanceCubre(todo, rebanada({ nivel, jornada: 'NOCTURNA', sede_id: 's9' }))).toBe(true);
    }
  });

  it('un líder por nivel cubre solo sus niveles', () => {
    const secundariaYMedia = alcance({ niveles: ['SECUNDARIA', 'MEDIA'] });
    expect(alcanceCubre(secundariaYMedia, rebanada({ nivel: 'MEDIA' }))).toBe(true);
    expect(alcanceCubre(secundariaYMedia, rebanada({ nivel: 'PRIMARIA' }))).toBe(false);
  });

  it('diurna y nocturna se separan', () => {
    expect(alcanceCubre(alcance({ jornada: 'NOCTURNA' }), rebanada({ jornada: 'DIURNA' }))).toBe(false);
    expect(alcanceCubre(alcance({ jornada: 'NOCTURNA' }), rebanada({ jornada: 'NOCTURNA' }))).toBe(true);
  });

  it('las sedes son opcionales: vacío = todas; con sedes, solo esas', () => {
    expect(alcanceCubre(alcance({ sedes_ids: ['s1'] }), rebanada({ sede_id: 's1' }))).toBe(true);
    expect(alcanceCubre(alcance({ sedes_ids: ['s1'] }), rebanada({ sede_id: 's2' }))).toBe(false);
  });

  it('un pedazo sin jornada ni sede conocidas (aún no hay grupos) lo cubre cualquiera que cubra su nivel', () => {
    expect(alcanceCubre(alcance({ jornada: 'NOCTURNA', sedes_ids: ['s1'] }), rebanada({ jornada: null, sede_id: null }))).toBe(true);
    expect(alcanceCubre(alcance({ niveles: ['MEDIA'] }), rebanada({ jornada: null, sede_id: null }))).toBe(false);
  });
});

describe('alcancesSeSolapan', () => {
  it('dos líderes por nivel distinto no se cruzan', () => {
    expect(alcancesSeSolapan(alcance({ niveles: ['PRIMARIA'] }), alcance({ niveles: ['SECUNDARIA', 'MEDIA'] }))).toBe(false);
  });

  it('el de toda la institución se cruza con cualquiera', () => {
    expect(alcancesSeSolapan(todo, alcance({ niveles: ['MEDIA'], jornada: 'NOCTURNA', sedes_ids: ['s2'] }))).toBe(true);
  });

  it('mismo nivel pero diurna contra nocturna no se cruzan', () => {
    expect(alcancesSeSolapan(alcance({ jornada: 'DIURNA' }), alcance({ jornada: 'NOCTURNA' }))).toBe(false);
    expect(alcancesSeSolapan(alcance({ jornada: 'DIURNA' }), alcance({ jornada: 'TODAS' }))).toBe(true);
  });

  it('sedes distintas no se cruzan; si una de las dos es «todas las sedes», sí', () => {
    expect(alcancesSeSolapan(alcance({ sedes_ids: ['s1'] }), alcance({ sedes_ids: ['s2'] }))).toBe(false);
    expect(alcancesSeSolapan(alcance({ sedes_ids: ['s1'] }), alcance({ sedes_ids: ['s1', 's2'] }))).toBe(true);
    expect(alcancesSeSolapan(alcance({ sedes_ids: ['s1'] }), todo)).toBe(true);
  });
});

describe('textos', () => {
  const sedes = new Map([['s1', 'Sede Norte']]);

  it('el alcance por defecto se lee «todo»', () => {
    expect(textoDeAlcance(todo)).toBe('Todos los niveles · Todas las jornadas · Todas las sedes');
  });

  it('con segmentos nombra niveles en orden, la jornada y las sedes', () => {
    expect(textoDeAlcance(alcance({ niveles: ['MEDIA', 'SECUNDARIA'], jornada: 'NOCTURNA', sedes_ids: ['s1'] }), sedes)).toBe('Secundaria, Media · Nocturna · Sede Norte');
  });

  it('lo que nadie cubre se agrupa por jornada, y por sede solo si hay varias', () => {
    const faltan = [rebanada({ nivel: 'SECUNDARIA' }), rebanada({ nivel: 'MEDIA' }), rebanada({ nivel: 'MEDIA', jornada: 'NOCTURNA', sede_id: 's2' })];
    expect(textoDeRebanadas(faltan)).toEqual(['Secundaria, Media · Diurna', 'Media · Nocturna']);
    expect(textoDeRebanadas(faltan, new Map([['s1', 'Norte'], ['s2', 'Sur']]), true)).toEqual(['Secundaria, Media · Diurna · Norte', 'Media · Nocturna · Sur']);
  });
});

describe('rebanadasSinCubrir', () => {
  it('devuelve lo que ningún líder cubre', () => {
    const demandadas = [rebanada({ nivel: 'PRIMARIA' }), rebanada({ nivel: 'SECUNDARIA' })];
    expect(rebanadasSinCubrir(demandadas, [alcance({ niveles: ['PRIMARIA'] })])).toEqual([rebanada({ nivel: 'SECUNDARIA' })]);
    expect(rebanadasSinCubrir(demandadas, [alcance({ niveles: ['PRIMARIA'] }), alcance({ niveles: ['SECUNDARIA'] })])).toEqual([]);
    expect(rebanadasSinCubrir(demandadas, [])).toHaveLength(2);
  });
});

describe('planAreaDeClase: el plan de área que aplica a una clase', () => {
  const lider = (_id: string, a: Partial<AlcanceLider>, estado: CoberturaConPlan['estado'], plan_id: string | null): CoberturaConPlan => ({ _id, alcance: alcance(a), estado, plan_id });
  const primaria = lider('l1', { niveles: ['PRIMARIA'] }, 'APROBADO', 'p1');
  const secundaria = lider('l2', { niveles: ['SECUNDARIA', 'MEDIA'] }, 'EN_REVISION', 'p2');

  it('toma el plan del líder del nivel de la clase, no el de otro nivel', () => {
    const diurna = [{ jornada: 'DIURNA' as const, sede_id: 's1' }];
    expect(planAreaDeClase([primaria, secundaria], 'PRIMARIA', diurna)).toEqual({ estado: 'APROBADO', planes_aprobados_ids: ['p1'], detalle: null });
    expect(planAreaDeClase([primaria, secundaria], 'SECUNDARIA', diurna)).toMatchObject({ estado: 'EN_REVISION', planes_aprobados_ids: [] });
  });

  it('sin líder para ese nivel no está habilitada y dice qué falta', () => {
    const r = planAreaDeClase([primaria], 'MEDIA', [{ jornada: 'DIURNA', sede_id: 's1' }]);
    expect(r.estado).toBe('SIN_CARGAR');
    expect(r.detalle).toMatch(/Media · Diurna/);
  });

  it('una clase dictada en un grupo diurno y uno nocturno necesita los dos planes aprobados', () => {
    const diurno = lider('d', { jornada: 'DIURNA' }, 'APROBADO', 'pd');
    const nocturno = lider('n', { jornada: 'NOCTURNA' }, 'DEVUELTO', 'pn');
    const grupos = [
      { jornada: 'DIURNA' as const, sede_id: 's1' },
      { jornada: 'NOCTURNA' as const, sede_id: 's1' },
    ];
    expect(planAreaDeClase([diurno, nocturno], 'PRIMARIA', grupos)).toMatchObject({ estado: 'DEVUELTO', planes_aprobados_ids: ['pd'] });
    expect(planAreaDeClase([diurno, { ...nocturno, estado: 'APROBADO' }], 'PRIMARIA', grupos).estado).toBe('APROBADO');
  });

  it('el líder único de toda la institución cubre cualquier clase', () => {
    const unico = lider('u', {}, 'APROBADO', 'pu');
    expect(planAreaDeClase([unico], 'MEDIA', [{ jornada: 'NOCTURNA', sede_id: 's7' }])).toMatchObject({ estado: 'APROBADO', planes_aprobados_ids: ['pu'] });
  });

  it('sin grupos conocidos basta el nivel', () => {
    expect(planAreaDeClase([primaria], 'PRIMARIA', []).estado).toBe('APROBADO');
  });
});
