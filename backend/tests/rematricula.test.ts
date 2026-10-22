import { describe, expect, it } from 'vitest';
import { CRITERIOS_INICIALES, CriterioConfigurado } from '../src/constants/rematricula';
import { validarConfiguracionRematricula } from '../src/services/configuracionRematricula.service';
import { GrupoParalelo, SolicitudDeReparto, DatosDePrioridad, edadCumplida, ordenarPorPrioridad, repartirConBalanceo } from '../src/utils/rematricula';
import { destinoDeRollover } from '../src/utils/rollover';

const persona = (id: string, extra: Partial<DatosDePrioridad> = {}): DatosDePrioridad => ({
  id,
  promedio: 4,
  anios_en_plantel: 1,
  faltas_graves: 0,
  apellido: id,
  nombre: 'X',
  documento: id,
  ...extra,
});
const ids = (xs: DatosDePrioridad[]) => xs.map((x) => x.id);

describe('ordenarPorPrioridad', () => {
  it('aplica los criterios activos en el orden configurado', () => {
    const gente = [persona('a', { promedio: 4.5, anios_en_plantel: 1 }), persona('b', { promedio: 4.5, anios_en_plantel: 5 }), persona('c', { promedio: 4.9, anios_en_plantel: 0 })];
    expect(ids(ordenarPorPrioridad(gente, CRITERIOS_INICIALES))).toEqual(['c', 'b', 'a']);
    const antiguedadPrimero: CriterioConfigurado[] = [
      { criterio: 'ANTIGUEDAD', activo: true },
      { criterio: 'PROMEDIO_GENERAL', activo: true },
      { criterio: 'SIN_FALTAS_GRAVES', activo: true },
    ];
    expect(ids(ordenarPorPrioridad(gente, antiguedadPrimero))).toEqual(['b', 'a', 'c']);
  });

  it('un criterio apagado no cuenta; sin promedio va después; las faltas graves restan prioridad', () => {
    const gente = [persona('a', { promedio: null }), persona('b', { promedio: 3.1, faltas_graves: 2 }), persona('c', { promedio: 3.1 })];
    expect(ids(ordenarPorPrioridad(gente, CRITERIOS_INICIALES))).toEqual(['c', 'b', 'a']);
    const sinConvivencia = CRITERIOS_INICIALES.map((c) => (c.criterio === 'SIN_FALTAS_GRAVES' ? { ...c, activo: false } : c));
    expect(ids(ordenarPorPrioridad(gente, sinConvivencia))).toEqual(['b', 'c', 'a']);
  });

  it('lo que empata cae a un orden estable y no altera la lista original', () => {
    const gente = [persona('z'), persona('m'), persona('a')];
    expect(ids(ordenarPorPrioridad(gente, []))).toEqual(['a', 'm', 'z']);
    expect(ids(gente)).toEqual(['z', 'm', 'a']);
  });
});

describe('edadCumplida', () => {
  const ref = new Date('2027-01-25T00:00:00Z');
  it('cuenta años cumplidos a la fecha', () => {
    expect(edadCumplida(new Date('2016-01-25T00:00:00Z'), ref)).toBe(11);
    expect(edadCumplida(new Date('2016-01-26T00:00:00Z'), ref)).toBe(10);
    expect(edadCumplida(null, ref)).toBeNull();
  });
});

const grupo = (id: string, extra: Partial<GrupoParalelo> = {}): GrupoParalelo => ({ id, nomenclatura: id, jornada_id: 'M', capacidad: 10, ocupados: 0, repitentes: 0, con_piar: 0, edades: [], ...extra });
const sol = (id: string, extra: Partial<SolicitudDeReparto> = {}): SolicitudDeReparto => ({ id, jornada_id: 'M', repitente: false, piar: false, edad: null, ...extra });
const cuantos = (r: Map<string, string | null>, g: string) => [...r.values()].filter((x) => x === g).length;

describe('repartirConBalanceo', () => {
  it('no manda a todos al mismo salón: los reparte parejo entre los paralelos', () => {
    const { asignado } = repartirConBalanceo(Array.from({ length: 8 }, (_, i) => sol(`e${i}`)), [grupo('A'), grupo('B')], 10);
    expect(cuantos(asignado, 'A')).toBe(4);
    expect(cuantos(asignado, 'B')).toBe(4);
  });

  it('reparte los repitentes entre los paralelos', () => {
    const { asignado } = repartirConBalanceo([sol('r1', { repitente: true }), sol('r2', { repitente: true }), sol('r3', { repitente: true }), sol('r4', { repitente: true })], [grupo('A'), grupo('B')], 50);
    expect(cuantos(asignado, 'A')).toBe(2);
    expect(cuantos(asignado, 'B')).toBe(2);
  });

  it('tiene en cuenta los repitentes y los PIAR que un grupo ya tenía de etapas anteriores', () => {
    const grupos = [grupo('A', { ocupados: 3, repitentes: 3, con_piar: 2 }), grupo('B', { ocupados: 3 })];
    expect(repartirConBalanceo([sol('r', { repitente: true })], grupos, 50).asignado.get('r')).toBe('B');
    expect(repartirConBalanceo([sol('p', { piar: true })], grupos, 50).asignado.get('p')).toBe('B');
  });

  it('reparte estudiantes con PIAR de manera pareja', () => {
    const { asignado } = repartirConBalanceo([sol('p1', { piar: true }), sol('p2', { piar: true }), sol('p3', { piar: true }), sol('p4', { piar: true })], [grupo('A'), grupo('B')], 50);
    expect(cuantos(asignado, 'A')).toBe(2);
  });

  it('separa a los de una misma edad cuando los grupos están parejos', () => {
    const { asignado } = repartirConBalanceo([sol('a', { edad: 12 }), sol('b', { edad: 12 }), sol('c', { edad: 13 })], [grupo('A'), grupo('B')], 50);
    expect(asignado.get('a')).not.toBe(asignado.get('b'));
  });

  it('el balance de ocupación manda: un grupo mucho más lleno no recibe más aunque convenga por repitentes', () => {
    const grupos = [grupo('A', { ocupados: 2 }), grupo('B', { ocupados: 8, repitentes: 0 })];
    // Con tolerancia pequeña, B (8/10) queda fuera aunque A tenga más repitentes.
    const conRepitentes = [grupo('A', { ocupados: 2, repitentes: 2 }), grupo('B', { ocupados: 8 })];
    expect(repartirConBalanceo([sol('r', { repitente: true })], conRepitentes, 10).asignado.get('r')).toBe('A');
    expect(repartirConBalanceo([sol('n')], grupos, 10).asignado.get('n')).toBe('A');
  });

  it('respeta la jornada del estudiante y solo usa otra si la suya no tiene lugar', () => {
    const grupos = [grupo('M1', { jornada_id: 'M', capacidad: 1 }), grupo('T1', { jornada_id: 'T' })];
    const { asignado } = repartirConBalanceo([sol('a', { jornada_id: 'M' }), sol('b', { jornada_id: 'M' })], grupos, 10);
    expect(asignado.get('a')).toBe('M1');
    expect(asignado.get('b')).toBe('T1');
  });

  it('con menos cupos que aspirantes, los de mayor prioridad (los primeros) se quedan los lugares y los demás quedan sin grupo', () => {
    const { asignado, grupos } = repartirConBalanceo([sol('uno'), sol('dos'), sol('tres'), sol('cuatro')], [grupo('A', { capacidad: 2 }), grupo('B', { capacidad: 1 })], 10);
    expect([asignado.get('uno'), asignado.get('dos'), asignado.get('tres')].every(Boolean)).toBe(true);
    expect(asignado.get('cuatro')).toBeNull();
    expect(grupos.map((g) => g.ocupados).sort()).toEqual([1, 2]);
  });

  it('no modifica los grupos recibidos y es determinista', () => {
    const entrada = [grupo('A'), grupo('B')];
    const a = repartirConBalanceo([sol('x'), sol('y')], entrada, 10);
    const b = repartirConBalanceo([sol('x'), sol('y')], entrada, 10);
    expect(entrada[0]!.ocupados).toBe(0);
    expect([...a.asignado]).toEqual([...b.asignado]);
  });
});

describe('destinoDeRollover: egresados y recuperaciones', () => {
  const base = { no_renueva_cupo: false, hay_grado_siguiente: false };
  it('quien ya se graduó pasa al historial como egresado', () => {
    expect(destinoDeRollover({ ...base, resultado: 'PROMOVIDO', graduado: true }).destino).toBe('EGRESADO');
  });
  it('quien espera la recuperación se explica con M18 y no se proyecta', () => {
    expect(destinoDeRollover({ ...base, hay_grado_siguiente: true, resultado: 'PENDIENTE_RECUPERACION' })).toMatchObject({ destino: 'SIN_DECISION', motivo: expect.stringMatching(/M18/) });
  });
});

describe('validarConfiguracionRematricula', () => {
  it('exige cada criterio una vez y una tolerancia razonable', () => {
    expect(validarConfiguracionRematricula({ criterios_desempate: CRITERIOS_INICIALES, tolerancia_ocupacion_pct: 10 })).toBeNull();
    expect(validarConfiguracionRematricula({ criterios_desempate: [CRITERIOS_INICIALES[0]!, CRITERIOS_INICIALES[0]!, CRITERIOS_INICIALES[1]!], tolerancia_ocupacion_pct: 10 })).toMatch(/exactamente una vez/);
    expect(validarConfiguracionRematricula({ criterios_desempate: CRITERIOS_INICIALES, tolerancia_ocupacion_pct: 80 })).toMatch(/tolerancia/);
  });
});
