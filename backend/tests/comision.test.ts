import { describe, expect, it } from 'vitest';
import { actaCompleta, alertasDeReprobacionMasiva, CONFIGURACION_INICIAL, contarVotos, firmantesRequeridos, nivelDeRiesgo, validarConfiguracion, causalDeCierre } from '../src/utils/comision';

const { semaforo, reprobacion_masiva } = CONFIGURACION_INICIAL;

describe('semáforo de riesgo (valores de partida del colegio)', () => {
  it('verde con 0, amarillo con 1, naranja con 2 y rojo con 3 o más asignaturas perdidas', () => {
    expect([0, 1, 2, 3, 5].map((n) => nivelDeRiesgo(n, 0, semaforo).nivel)).toEqual(['VERDE', 'AMARILLO', 'NARANJA', 'ROJO', 'ROJO']);
  });

  it('una inasistencia por encima del tope es rojo aunque no pierda nada', () => {
    const r = nivelDeRiesgo(0, 21, semaforo);
    expect(r.nivel).toBe('ROJO');
    expect(r.motivos[0]).toMatch(/Inasistencia de 21%/);
    expect(nivelDeRiesgo(0, 20, semaforo).nivel).toBe('VERDE');
  });

  it('los umbrales son del colegio: otro colegio puede ser más estricto', () => {
    const estricto = { ...semaforo, amarillo_desde: 1, naranja_desde: 1, rojo_desde: 2, inasistencia_roja_pct: 10 };
    expect(nivelDeRiesgo(1, 0, estricto).nivel).toBe('NARANJA');
    expect(nivelDeRiesgo(2, 0, estricto).nivel).toBe('ROJO');
    expect(nivelDeRiesgo(0, 11, estricto).nivel).toBe('ROJO');
  });
});

describe('reprobación masiva', () => {
  const conteo = (clave: string, evaluados: number, reprobados: number) => ({ clave, nombre: clave, evaluados, reprobados });

  it('alerta cuando se supera el porcentaje, no cuando se iguala', () => {
    const a = alertasDeReprobacionMasiva([conteo('mat', 40, 11), conteo('esp', 40, 10)], reprobacion_masiva);
    expect(a.map((x) => x.clave)).toEqual(['mat']);
    expect(a[0]?.porcentaje).toBe(27.5);
  });

  it('un grupo muy pequeño no dispara la alerta por ruido', () => {
    expect(alertasDeReprobacionMasiva([conteo('chico', 5, 3)], reprobacion_masiva)).toEqual([]);
    expect(alertasDeReprobacionMasiva([conteo('chico', 5, 3)], { porcentaje: 25, minimo_estudiantes: 4 })).toHaveLength(1);
  });
});

describe('votación', () => {
  const votos = (...v: Array<[string, 'A_FAVOR' | 'EN_CONTRA' | 'ABSTENCION']>) => v.map(([miembro_id, voto]) => ({ miembro_id, voto }));

  it('mayoría simple: más a favor que en contra; la abstención no cuenta a ningún lado', () => {
    const r = contarVotos(votos(['a', 'A_FAVOR'], ['b', 'A_FAVOR'], ['c', 'EN_CONTRA'], ['d', 'ABSTENCION']), ['a', 'b', 'c', 'd'], 'SIMPLE');
    expect(r).toMatchObject({ a_favor: 2, en_contra: 1, abstenciones: 1, aprobada: true });
    expect(contarVotos(votos(['a', 'A_FAVOR'], ['b', 'EN_CONTRA']), ['a', 'b'], 'SIMPLE').aprobada).toBe(false);
  });

  it('mayoría absoluta: más de la mitad de quienes podían votar', () => {
    const v = votos(['a', 'A_FAVOR'], ['b', 'A_FAVOR']);
    expect(contarVotos(v, ['a', 'b', 'c', 'd'], 'ABSOLUTA').aprobada).toBe(false);
    expect(contarVotos(v, ['a', 'b', 'c'], 'ABSOLUTA').aprobada).toBe(true);
  });

  it('el voto de un recusado o ausente no se cuenta', () => {
    const r = contarVotos(votos(['a', 'A_FAVOR'], ['fuera', 'A_FAVOR'], ['b', 'EN_CONTRA']), ['a', 'b'], 'SIMPLE');
    expect(r).toMatchObject({ a_favor: 1, en_contra: 1, habilitados: 2, aprobada: false });
  });

  it('sin votos no hay decisión aprobada', () => {
    expect(contarVotos([], ['a', 'b'], 'SIMPLE').aprobada).toBe(false);
    expect(contarVotos([], ['a', 'b'], 'ABSOLUTA').aprobada).toBe(false);
  });
});

describe('firmas del acta', () => {
  const m = (id: string, extra: Partial<{ asistio: boolean; es_presidente: boolean; tiene_usuario: boolean; firmo: boolean }> = {}) => ({ miembro_id: id, asistio: true, es_presidente: false, tiene_usuario: true, firmo: false, ...extra });

  it('firman todos los asistentes con usuario; el externo firma en papel', () => {
    const miembros = [m('rector', { es_presidente: true }), m('docente'), m('personero', { tiene_usuario: false }), m('ausente', { asistio: false })];
    expect(firmantesRequeridos(miembros, 'TODOS_LOS_ASISTENTES')).toEqual(['rector', 'docente']);
    expect(firmantesRequeridos(miembros, 'SOLO_PRESIDENTE')).toEqual(['rector']);
  });

  it('el acta se completa cuando firmó el último requerido', () => {
    const miembros = [m('rector', { es_presidente: true, firmo: true }), m('docente')];
    expect(actaCompleta(miembros, 'TODOS_LOS_ASISTENTES')).toBe(false);
    expect(actaCompleta(miembros, 'SOLO_PRESIDENTE')).toBe(true);
    expect(actaCompleta([m('rector', { firmo: true }), m('docente', { firmo: true })], 'TODOS_LOS_ASISTENTES')).toBe(true);
  });

  it('sin nadie que pueda firmar con el sistema, el acta nunca está completa', () => {
    expect(actaCompleta([m('externo', { tiene_usuario: false })], 'TODOS_LOS_ASISTENTES')).toBe(false);
  });
});

describe('validar configuración', () => {
  it('rechaza umbrales que no crecen o porcentajes fuera de rango', () => {
    expect(validarConfiguracion(CONFIGURACION_INICIAL)).toBeNull();
    expect(validarConfiguracion({ ...CONFIGURACION_INICIAL, semaforo: { ...semaforo, naranja_desde: 1 } })).toMatch(/crecer/);
    expect(validarConfiguracion({ ...CONFIGURACION_INICIAL, reprobacion_masiva: { porcentaje: 0, minimo_estudiantes: 8 } })).toMatch(/entre 1 y 100/);
    expect(validarConfiguracion({ ...CONFIGURACION_INICIAL, quorum_porcentaje: 101 })).toMatch(/quórum/);
  });
});

describe('causal del SIEE en el acta', () => {
  it('lee del cierre las frases, las reglas y lo perdido', () => {
    expect(
      causalDeCierre({
        motivos: ['Perdió 3 asignaturas; el SIEE permite recuperar hasta 2.', ''],
        reglas_disparadas: [{ clave: 'auto-umbral', nombre: 'Más de 2 asignaturas perdidas', accion: 'NO_PROMUEVE' }],
        perdidas: [{ nombre: 'Matemáticas' }, { nombre: 'Física' }, { nombre: 'Inglés' }],
      })
    ).toEqual({ motivos: ['Perdió 3 asignaturas; el SIEE permite recuperar hasta 2.'], reglas: ['Más de 2 asignaturas perdidas'], perdidas: ['Matemáticas', 'Física', 'Inglés'] });
  });

  it('un detalle sin esa forma da listas vacías y no falla', () => {
    for (const raro of [null, undefined, 'texto', 42, {}, { motivos: 'no es lista', perdidas: [null, 3] }]) {
      expect(causalDeCierre(raro)).toEqual({ motivos: [], reglas: [], perdidas: [] });
    }
  });
});
