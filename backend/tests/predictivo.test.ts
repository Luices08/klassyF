import { describe, expect, it } from 'vitest';
import { ENTRADAS_MODELO } from '../src/modulos/predictivo/constants/predictivo';
import { aVector, corteVigente, cortesDeEntrenamiento, DatosAlCorte, entradasDeAsignatura, notaDelAnioAnterior } from '../src/modulos/predictivo/utils/caracteristicas';
import { entrenarYEvaluar, FilaEntrenamiento, partirParaPrueba } from '../src/modulos/predictivo/utils/entrenamiento';
import { crearVariador, fodaDeAsignatura, fodaGeneral, lista, PLANTILLAS_FODA, rellenar, ResumenAsignaturaFoda } from '../src/modulos/predictivo/utils/foda';
import { combinarProbabilidades, historialDeAsignatura, probabilidadPorHistorial, SenalesAsignatura } from '../src/modulos/predictivo/utils/historial';
import { auc, calcularMetricas, motivoDeRechazo } from '../src/modulos/predictivo/utils/metricas';
import { notaRequerida } from '../src/modulos/predictivo/utils/notaRequerida';
import { puedePredictivo, vistaDelAnalisis } from '../src/modulos/predictivo/utils/permisos';
import { AsignaturaConRiesgo, BaseRiesgo, generador, riesgoDePromocion } from '../src/modulos/predictivo/utils/riesgoPromocion';
import { politicaInicial } from '../src/utils/promocion';

const escala = { minima: 1, maxima: 5, aprobatoria: 3 };

function periodo(n: number, nota: number | null, extra: Partial<{ actividades: number; no_entregadas: number; registros: number; fallas: number; exento: boolean }> = {}) {
  return { periodo: n, nota, actividades: 0, no_entregadas: 0, registros: 0, fallas: 0, ...extra };
}

function datos(parcial: Partial<DatosAlCorte> = {}): DatosAlCorte {
  return {
    corte: 2,
    totalPeriodos: 4,
    escala,
    asignaturas: [
      { subject_id: 'mat', area_id: 'a1', periodos: [periodo(1, 2.5, { actividades: 4, no_entregadas: 2, registros: 40, fallas: 4 }), periodo(2, 2.0, { actividades: 4, no_entregadas: 0, registros: 40, fallas: 0 }), periodo(3, 4.8), periodo(4, null)] },
      { subject_id: 'esp', area_id: 'a2', periodos: [periodo(1, 4.0, { registros: 20 }), periodo(2, 4.4, { registros: 20 }), periodo(3, null), periodo(4, null)] },
    ],
    faltas: [
      { periodo: 1, gravedad: 'I' },
      { periodo: 2, gravedad: 'II' },
      { periodo: 3, gravedad: 'III' },
    ],
    esRepitente: true,
    anterior: null,
    ...parcial,
  };
}

describe('predictivo: entradas de una asignatura', () => {
  it('usa solo lo cerrado hasta el corte y normaliza todo a 0–1', () => {
    const e = entradasDeAsignatura(datos(), 'mat');
    expect(e).not.toBeNull();
    const x = e!;
    expect(x.nota_asignatura).toBeCloseTo((2.25 - 1) / 4, 4); // el 4.8 del periodo 3 no cuenta
    expect(x.nota_ultimo_periodo).toBeCloseTo(0.25, 4);
    expect(x.tendencia).toBeCloseTo(0.5 - 0.5 / 8, 4);
    expect(x.perdidas_ratio).toBe(0.5); // 2 de 4 notas de periodo bajo 3
    expect(x.no_entregadas_asignatura).toBe(0.25);
    expect(x.inasistencia_asignatura).toBeCloseTo(Math.min(1, (4 / 80) * 4), 4);
    expect(x.inasistencia_general).toBeCloseTo((4 / 120) * 4, 4);
    expect(x.alertas_convivencia).toBe(0.25); // solo la II hasta el corte 2; la I no es alerta
    expect(x.es_repitente).toBe(1);
    expect(x.periodo_norm).toBe(0.5);
    expect(x.hay_notas).toBe(1);
    expect(x.hay_anio_anterior).toBe(0);
    for (const k of ENTRADAS_MODELO) {
      expect(x[k]).toBeGreaterThanOrEqual(0);
      expect(x[k]).toBeLessThanOrEqual(1);
    }
    expect(aVector(x)).toHaveLength(ENTRADAS_MODELO.length);
  });

  it('sin notas ni año anterior no hay con qué predecir; con año anterior sí (corte 0)', () => {
    expect(entradasDeAsignatura(datos({ corte: 0 }), 'mat')).toBeNull();
    const anterior = { escala, asignaturas: [{ subject_id: 'mat', area_id: 'a1', nota: 4.2 }], promedio_general: 3.8 };
    const e = entradasDeAsignatura(datos({ corte: 0, anterior }), 'mat')!;
    expect(e.hay_notas).toBe(0);
    expect(e.nota_asignatura).toBe(0);
    expect(e.tendencia).toBe(0.5);
    expect(e.hay_anio_anterior).toBe(1);
    expect(e.nota_anio_anterior).toBeCloseTo(0.8, 4);
  });

  it('del año anterior toma la misma asignatura, si no el área y si no el promedio general', () => {
    const anterior = { escala, asignaturas: [{ subject_id: 'fis', area_id: 'a1', nota: 2 }, { subject_id: 'quim', area_id: 'a1', nota: 4 }], promedio_general: 5 };
    expect(notaDelAnioAnterior(anterior, 'mat', 'a1')).toBeCloseTo(0.5, 4);
    expect(notaDelAnioAnterior(anterior, 'art', 'a9')).toBe(1);
    expect(notaDelAnioAnterior(null, 'mat', 'a1')).toBeNull();
  });

  it('cortes: del 0 al penúltimo cerrado; vigente = periodos seguidos cerrados', () => {
    expect(cortesDeEntrenamiento([1, 2, 3, 4], 4)).toEqual([0, 1, 2, 3]);
    expect(cortesDeEntrenamiento([1, 3], 4)).toEqual([0, 1]);
    expect(corteVigente([])).toBe(0);
    expect(corteVigente([1, 2, 4])).toBe(2);
  });
});

describe('predictivo: nota requerida', () => {
  const e = { ...escala, decimales: 1 };
  it('calcula el promedio que falta y lo redondea hacia arriba', () => {
    const r = notaRequerida([{ porcentaje: 25, nota: 2.5 }, { porcentaje: 25, nota: 2.8 }, { porcentaje: 25, nota: null }, { porcentaje: 25, nota: null }], e);
    expect(r).toMatchObject({ estado: 'ALCANZABLE', nota: 3.4, periodos_restantes: 2 });
  });
  it('asegurada, no alcanza y definida', () => {
    expect(notaRequerida([{ porcentaje: 50, nota: 5 }, { porcentaje: 50, nota: null }], e).estado).toBe('ASEGURADA');
    expect(notaRequerida([{ porcentaje: 75, nota: 1 }, { porcentaje: 25, nota: null }], e).estado).toBe('NO_ALCANZA');
    expect(notaRequerida([{ porcentaje: 50, nota: 3.2 }, { porcentaje: 50, nota: 2.9 }], e)).toMatchObject({ estado: 'APROBADA', definitiva: 3.1 });
    expect(notaRequerida([{ porcentaje: 50, nota: 2 }, { porcentaje: 50, nota: 2.9 }], e).estado).toBe('PERDIDA');
  });
  it('un periodo exento sale y su peso se reparte', () => {
    const r = notaRequerida([{ porcentaje: 50, nota: null, exento: true }, { porcentaje: 25, nota: 2 }, { porcentaje: 25, nota: null }], e);
    expect(r).toMatchObject({ estado: 'ALCANZABLE', nota: 4 });
  });
});

describe('predictivo: métricas', () => {
  it('AUC 1 si separa perfecto, 0.5 con empates y null con una sola clase', () => {
    expect(auc([{ probabilidad: 0.9, real: 1 }, { probabilidad: 0.1, real: 0 }])).toBe(1);
    expect(auc([{ probabilidad: 0.5, real: 1 }, { probabilidad: 0.5, real: 0 }])).toBe(0.5);
    expect(auc([{ probabilidad: 0.5, real: 1 }])).toBeNull();
  });
  it('Brier, referencia y motivo de rechazo', () => {
    const preds = Array.from({ length: 100 }, (_, i) => ({ probabilidad: i < 20 ? 0.8 : 0.1, real: (i < 20 ? 1 : 0) as 0 | 1 }));
    const m = calcularMetricas(preds);
    expect(m.prevalencia).toBe(0.2);
    expect(m.brier_referencia).toBe(0.16);
    expect(m.brier).toBeCloseTo((20 * 0.04 + 80 * 0.01) / 100, 4);
    expect(m.calibracion).toHaveLength(10);
    expect(motivoDeRechazo(m)).toBeNull();
    expect(motivoDeRechazo(calcularMetricas(preds.slice(0, 10)))).toMatch(/filas/);
    expect(motivoDeRechazo(calcularMetricas(preds.map((p) => ({ ...p, probabilidad: 0.5 }))))).toMatch(/AUC/);
  });
});

describe('predictivo: riesgo de no promoción con la política del colegio', () => {
  const base: BaseRiesgo = {
    grado_id: 'g',
    nivel: 'BASICA_SECUNDARIA',
    escala,
    inasistencia_global_total_pct: 0,
    inasistencia_global_injustificada_pct: 0,
    faltas_por_gravedad: {},
    admite_recuperacion_final: true,
    max_recuperables: 0,
  };
  const asig = (id: string, p: number): AsignaturaConRiesgo => ({ subject_id: id, area_id: `area-${id}`, nombre: id, probabilidad: p, inasistencia_total_pct: 0, inasistencia_injustificada_pct: 0 });
  const politica = { ...politicaInicial(), umbrales: { ...politicaInicial().umbrales, recuperacion_hasta: 2 } };

  it('sin riesgo promueve; tres asignaturas seguras perdidas = no promovido (umbral del colegio)', () => {
    expect(riesgoDePromocion([asig('a', 0), asig('b', 0)], base, politica, 200).promovido).toBe(1);
    expect(riesgoDePromocion([asig('a', 1), asig('b', 1), asig('c', 1), asig('d', 0)], base, politica, 200).no_promovido).toBe(1);
    expect(riesgoDePromocion([asig('a', 1), asig('b', 0)], base, politica, 200).recuperacion).toBe(1);
  });

  it('es reproducible y suma 1', () => {
    const lista = [asig('a', 0.5), asig('b', 0.4), asig('c', 0.6)];
    const r1 = riesgoDePromocion(lista, base, politica, 500);
    expect(riesgoDePromocion(lista, base, politica, 500)).toEqual(r1);
    expect(r1.no_promovido + r1.recuperacion + r1.comision + r1.promovido).toBeCloseTo(1, 3);
    expect(r1.perdidas_esperadas).toBe(1.5);
    // P(perder las tres) = 0.5 · 0.4 · 0.6 = 0.12
    expect(r1.no_promovido).toBeGreaterThan(0.08);
    expect(r1.no_promovido).toBeLessThan(0.16);
  });

  it('Preescolar nunca reprueba', () => {
    expect(riesgoDePromocion([asig('a', 1), asig('b', 1), asig('c', 1)], { ...base, nivel: 'PREESCOLAR' }, politica, 50).promovido).toBe(1);
  });

  it('el generador con semilla repite la secuencia', () => {
    const a = generador(7);
    const b = generador(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('predictivo: FODA', () => {
  const base: ResumenAsignaturaFoda = {
    nombre: 'Matemáticas',
    nota: 2.4,
    nivel: 'BAJO',
    desempeno: 'Bajo',
    tendencia: 'BAJA',
    actividades: 10,
    no_entregadas: 3,
    registros: 40,
    fallas: 6,
    nota_requerida: { estado: 'ALCANZABLE', nota: 3.6, definitiva: null, periodos_restantes: 2 },
    riesgo: 'ALTO',
    nota_anio_anterior: null,
  };

  it('arma los cuatro cuadrantes con los datos de la asignatura', () => {
    const f = fodaDeAsignatura(base, 3);
    expect(f.debilidades.map((d) => d.clave)).toEqual(['NOTA_BAJA', 'TENDENCIA_BAJA', 'NO_ENTREGAS', 'INASISTENCIA']);
    expect(f.oportunidades[0]?.texto).toBe('Para aprobar Matemáticas le basta un promedio de 3.6 en los 2 periodos que faltan.');
    expect(f.amenazas.map((d) => d.clave)).toEqual(['RIESGO_ALTO']);
    expect(f.fortalezas).toEqual([]);
  });

  it('escribe las notas con los decimales de la escala', () => {
    const f = fodaDeAsignatura({ ...base, nota: 2, nota_requerida: { estado: 'ALCANZABLE', nota: 4, definitiva: null, periodos_restantes: 1 } }, 3);
    expect(f.debilidades[0]?.texto).toBe('Su promedio en Matemáticas es 2.0, por debajo de la nota aprobatoria (3.0).');
    expect(f.oportunidades[0]?.texto).toBe('Para aprobar Matemáticas le basta un promedio de 4.0 en el periodo que falta.');
    expect(fodaDeAsignatura({ ...base, nota: 2.5 }, 3, 2).debilidades[0]?.texto).toContain('es 2.50, por debajo de la nota aprobatoria (3.00)');
  });

  it('lo que ya está decidido manda sobre el riesgo del modelo', () => {
    const noAlcanza = fodaDeAsignatura({ ...base, nota_requerida: { estado: 'NO_ALCANZA', nota: null, definitiva: null, periodos_restantes: 1 } }, 3);
    expect(noAlcanza.amenazas.map((d) => d.clave)).toEqual(['NO_ALCANZA']);
    const asegurada = fodaDeAsignatura({ ...base, nota: 4.5, nivel: 'ALTO', desempeno: 'Alto', tendencia: 'SUBE', no_entregadas: 0, fallas: 0, nota_requerida: { estado: 'ASEGURADA', nota: null, definitiva: null, periodos_restantes: 1 } }, 3);
    expect(asegurada.amenazas).toEqual([]);
    expect(asegurada.fortalezas.map((d) => d.clave)).toEqual(['NOTA_ALTA', 'TENDENCIA_SUBE', 'ENTREGA_TODO', 'ASISTE_SIEMPRE']);
  });

  it('la convivencia solo se nombra a quien puede verla', () => {
    const g = { promedio: 3.1, nivel: 'BASICO' as const, desempeno: 'Básico', perdidas: 2, registros: 100, fallas: 2, faltas_graves: 1, hay_periodos_cerrados: true, riesgo_no_promocion: 0.4, riesgo_recuperacion: 0.5 };
    expect(fodaGeneral(g, ['Matemáticas'], false).amenazas.map((a) => a.clave)).toEqual(['GEN_RIESGO_NO_PROMOCION']);
    expect(fodaGeneral(g, ['Matemáticas'], true).amenazas.map((a) => a.clave)).toEqual(['GEN_RIESGO_NO_PROMOCION', 'GEN_CONVIVENCIA']);
    expect(fodaGeneral(g, ['Matemáticas'], false).oportunidades[0]?.texto).toContain('Matemáticas');    expect(fodaGeneral(g, [], true).debilidades[0]?.texto).toBe('Va perdiendo 2 asignaturas en los periodos cerrados.');
    expect(fodaGeneral({ ...g, perdidas: 1 }, [], true).debilidades[0]?.texto).toBe('Va perdiendo 1 asignatura en los periodos cerrados.');
    expect(fodaGeneral(g, [], true).amenazas.at(-1)?.texto).toBe('Tiene 1 falta de convivencia Tipo II o III este año.');
    expect(fodaGeneral(g, [], false, ['Inglés', 'Artes']).fortalezas.map((f) => f.texto)).toContain('Con lo que lleva ya tiene asegurado aprobar: Inglés, Artes.');
  });

  it('ninguna plantilla para todos menciona convivencia, y las marcas se reemplazan', () => {
    for (const p of PLANTILLAS_FODA.filter((x) => x.audiencia === 'TODOS')) for (const t of p.textos) expect(t.toLowerCase()).not.toMatch(/convivencia|faltas? (de|tipo)|observador/);
    expect(rellenar('{a} y {b}', { a: 1 })).toBe('1 y {b}');
  });
});

describe('predictivo: FODA ampliado', () => {
  const base: ResumenAsignaturaFoda = {
    nombre: 'Matemáticas',
    nota: 3.1,
    nivel: 'BASICO',
    desempeno: 'Básico',
    tendencia: 'ESTABLE',
    actividades: 10,
    no_entregadas: 0,
    registros: 40,
    fallas: 0,
    nota_requerida: { estado: 'ALCANZABLE', nota: 3.0, definitiva: null, periodos_restantes: 2 },
    riesgo: 'MEDIO',
    nota_anio_anterior: null,
    minima: 1,
    maxima: 5,
  };

  it('cada clave tiene varias redacciones y ninguna se repite', () => {
    const claves = PLANTILLAS_FODA.map((p) => p.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(PLANTILLAS_FODA.length).toBeGreaterThanOrEqual(50);
    for (const p of PLANTILLAS_FODA) {
      expect(p.textos.length).toBeGreaterThanOrEqual(2);
      expect(new Set(p.textos).size).toBe(p.textos.length);
    }
  });

  it('el variador rota las redacciones entre asignaturas y es determinista', () => {
    const textos = (semilla: string) => {
      const variar = crearVariador(semilla);
      return ['Matemáticas', 'Física', 'Química'].map((nombre) => fodaDeAsignatura({ ...base, nombre }, 3, 1, variar).fortalezas.find((f) => f.clave === 'ENTREGA_TODO')?.texto);
    };
    const a = textos('estudiante-1');
    expect(a).toEqual(textos('estudiante-1'));
    const formas = a.map((t) => t?.replace(/Matemáticas|Física|Química/, '·'));
    expect(new Set(formas).size).toBe(3);
  });

  it('descarta una redacción que usa una marca sin valor', () => {
    // Sin notas por periodo no se conoce {primera} ni {ultima}: la variante que las usa no puede salir.
    for (let i = 0; i < 8; i += 1) {
      const variar = crearVariador(`s${i}`);
      const f = fodaDeAsignatura({ ...base, tendencia: 'SUBE' }, 3, 1, variar);
      expect(f.fortalezas.find((x) => x.clave === 'TENDENCIA_SUBE')?.texto).not.toMatch(/\{/);
    }
  });

  it('reconoce nota en el límite, historia difícil, cambio reciente y la nota exigente', () => {
    const f = fodaDeAsignatura(
      {
        ...base,
        nota: 3.1,
        notas_periodos: [3.3, 3.4, 2.9],
        historial: { anios: 2, perdidas: 1, promedio: 0.45 },
        nota_requerida: { estado: 'ALCANZABLE', nota: 4.6, definitiva: null, periodos_restantes: 1 },
      },
      3
    );
    expect(f.debilidades.map((d) => d.clave)).toEqual(expect.arrayContaining(['NOTA_LIMITE', 'CAIDA_RECIENTE', 'HISTORIAL_DEBIL']));
    expect(f.amenazas.map((d) => d.clave)).toEqual(expect.arrayContaining(['REQUERIDA_ALTA', 'HISTORIAL_REPITE']));
    expect(f.debilidades.find((d) => d.clave === 'HISTORIAL_DEBIL')).toBeDefined();
  });

  it('si con su nivel actual le alcanza, dice «mantener» en vez de «alcanzable»', () => {
    const f = fodaDeAsignatura({ ...base, nota: 3.8, nota_requerida: { estado: 'ALCANZABLE', nota: 3.2, definitiva: null, periodos_restantes: 1 } }, 3);
    expect(f.oportunidades.map((o) => o.clave)).toContain('MANTENER_NIVEL');
    expect(f.oportunidades.map((o) => o.clave)).not.toContain('ALCANZABLE');
  });

  it('el FODA general nombra mejores, débiles, pendientes y varias en riesgo', () => {
    const f = fodaGeneral(
      {
        promedio: 3.4,
        nivel: 'BASICO',
        desempeno: 'Básico',
        perdidas: 2,
        registros: 100,
        fallas: 20,
        faltas_graves: 0,
        hay_periodos_cerrados: true,
        riesgo_no_promocion: 0.1,
        riesgo_recuperacion: 0.1,
        actividades: 20,
        no_entregadas: 8,
        mejores: ['Artes'],
        debiles: ['Física', 'Química'],
        en_riesgo: ['Física', 'Química', 'Inglés'],
        con_pendientes: ['Física'],
        periodos_restantes: 2,
        promedio_primero: 3.8,
        promedio_ultimo: 3.2,
        minima: 1,
        maxima: 5,
        aprobatoria: 3,
      },
      ['Física'],
      true
    );
    expect(f.fortalezas.map((x) => x.clave)).toEqual(['GEN_MEJORES', 'GEN_SIN_FALTAS_GRAVES']);
    expect(f.debilidades.map((x) => x.clave)).toEqual(['GEN_PERDIDAS', 'GEN_DEBILES', 'GEN_INASISTENCIA', 'GEN_INCUMPLIMIENTO', 'GEN_CAIDA']);
    expect(f.oportunidades.map((x) => x.clave)).toEqual(['GEN_RECUPERABLES', 'GEN_PONERSE_AL_DIA', 'GEN_APOYARSE', 'GEN_TIEMPO']);
    expect(f.amenazas.map((x) => x.clave)).toEqual(['GEN_VARIAS_EN_RIESGO', 'GEN_INASISTENCIA_CRITICA']);
    expect(f.debilidades[1]?.texto).toContain('Física y Química');
    expect(lista(['A', 'B', 'C'])).toBe('A, B y C');
  });
});

describe('predictivo: historial y probabilidad sin notas', () => {
  const escala = { minima: 1, maxima: 5, aprobatoria: 3 };
  const anios = [
    { year: 2025, escala, asignaturas: [{ subject_id: 'mat', area_id: 'ma', nota: 2.6 }, { subject_id: 'art', area_id: 'ar', nota: 4.6 }], promedio_general: 3.6 },
    { year: 2024, escala, asignaturas: [{ subject_id: 'mat', area_id: 'ma', nota: 2.8 }, { subject_id: 'geo', area_id: 'ma', nota: 3.4 }], promedio_general: 3.5 },
  ];
  const senales = (subject: string, area: string, extra: Partial<SenalesAsignatura> = {}): SenalesAsignatura => ({
    nota_actual: null,
    periodos_con_nota: 0,
    promedio_general: null,
    historial: historialDeAsignatura(anios, subject, area),
    inasistencia: null,
    no_entregadas: null,
    alertas_convivencia: 0,
    es_repitente: false,
    aprobatoria: 0.5,
    ...extra,
  });

  it('arma la historia de la asignatura (o de su área) del año más reciente al más antiguo', () => {
    const mat = historialDeAsignatura(anios, 'mat', 'ma');
    expect(mat.anios.map((a) => [a.year, a.misma, a.perdida])).toEqual([
      [2025, true, true],
      [2024, true, true],
    ]);
    expect(mat.perdidas).toBe(2);
    const fis = historialDeAsignatura(anios, 'fis', 'ma');
    expect(fis.anios.map((a) => [a.year, a.misma])).toEqual([
      [2025, false],
      [2024, false],
    ]);
    expect(fis.perdidas).toBe(0);
  });

  it('sin ninguna nota del año da una cifra: alta para la que siempre ha perdido y baja para la que siempre gana', () => {
    const mala = probabilidadPorHistorial(senales('mat', 'ma')) as number;
    const buena = probabilidadPorHistorial(senales('art', 'ar')) as number;
    expect(mala).toBeGreaterThan(0.5);
    expect(buena).toBeLessThan(0.1);
  });

  it('con 3.0 cerrado y una historia mala la probabilidad sigue siendo considerable', () => {
    const p = probabilidadPorHistorial(senales('mat', 'ma', { nota_actual: 0.5, periodos_con_nota: 1, promedio_general: 0.6 })) as number;
    expect(p).toBeGreaterThan(0.35);
    const sinHistoria = probabilidadPorHistorial({ ...senales('x', 'y'), historial: { anios: [], promedio: null, perdidas: 0 }, nota_actual: 0.5, periodos_con_nota: 1, promedio_general: 0.6 }) as number;
    expect(p).toBeGreaterThan(sinHistoria);
  });

  it('las fallas y las entregas pendientes suben la probabilidad; sin nada que mirar no inventa', () => {
    const sin = { ...senales('x', 'y'), historial: { anios: [], promedio: null, perdidas: 0 } };
    expect(probabilidadPorHistorial(sin)).toBeNull();
    const asiste = probabilidadPorHistorial({ ...sin, inasistencia: 0, no_entregadas: 0 }) as number;
    const falta = probabilidadPorHistorial({ ...sin, inasistencia: 0.25, no_entregadas: 0.6 }) as number;
    expect(falta).toBeGreaterThan(asiste);
  });

  it('combina la red con la historia solo con dos o más años de la misma asignatura', () => {
    expect(combinarProbabilidades(0.4, 0.8, 1)).toEqual({ probabilidad: 0.4, fuente: 'MODELO' });
    expect(combinarProbabilidades(0.4, 0.8, 2)).toEqual({ probabilidad: 0.52, fuente: 'MODELO_E_HISTORIAL' });
    expect(combinarProbabilidades(null, 0.8, 0)).toEqual({ probabilidad: 0.8, fuente: 'HISTORIAL' });
    expect(combinarProbabilidades(null, null, 0)).toEqual({ probabilidad: null, fuente: null });
  });
});

describe('predictivo: permisos', () => {
  it('solo el ADMIN entrena; el personal busca y ve la probabilidad; familia y estudiante no', () => {
    expect(puedePredictivo('ADMIN', 'ENTRENAR')).toBe(true);
    for (const rol of ['COORDINADOR', 'DOCENTE', 'ORIENTADOR', 'SECRETARIA']) expect(puedePredictivo(rol, 'ENTRENAR')).toBe(false);
    for (const rol of ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE']) expect(puedePredictivo(rol, 'BUSCAR_ESTUDIANTES')).toBe(true);
    for (const rol of ['SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE', null]) expect(puedePredictivo(rol, 'BUSCAR_ESTUDIANTES')).toBe(false);
    expect(vistaDelAnalisis('ESTUDIANTE')).toEqual({ probabilidad: false, convivencia: false });
    expect(vistaDelAnalisis('ACUDIENTE')).toEqual({ probabilidad: false, convivencia: false });
    expect(vistaDelAnalisis('DOCENTE')).toEqual({ probabilidad: true, convivencia: false });
    expect(vistaDelAnalisis('COORDINADOR_CONVIVENCIA')).toEqual({ probabilidad: true, convivencia: true });
  });
});

describe('predictivo: entrenamiento con Brain.js', () => {
  function filas(anio: number, n: number, semilla: number): FilaEntrenamiento[] {
    const azar = generador(semilla);
    return Array.from({ length: n }, (_, i) => {
      const nota = azar();
      const x = ENTRADAS_MODELO.map((k) => (k === 'nota_asignatura' || k === 'promedio_general' ? nota : k === 'hay_notas' ? 1 : azar() * 0.2));
      return { anio, student_id: `s${anio}-${i}`, subject_id: 'mat', corte: 1, x, y: (nota < 0.45 ? 1 : 0) as 0 | 1 };
    });
  }

  it('parte por año si hay varios y por estudiantes si hay uno', () => {
    const dos = partirParaPrueba([...filas(2024, 10, 1), ...filas(2025, 5, 2)]);
    expect(dos).toMatchObject({ criterio: 'ANIO', anio_prueba: 2025 });
    expect(dos.prueba).toHaveLength(5);
    const uno = partirParaPrueba(filas(2024, 200, 3));
    expect(uno.criterio).toBe('ESTUDIANTES');
    expect(uno.prueba.length).toBeGreaterThan(10);
    expect(new Set(uno.prueba.map((f) => f.student_id)).size).toBe(uno.prueba.length);
  });

  it('no prueba con un año que trae filas que el entrenamiento nunca vio (primer año sin año anterior)', () => {
    const iAnterior = ENTRADAS_MODELO.indexOf('hay_anio_anterior');
    const conAnterior = filas(2025, 100, 6).map((f) => ({ ...f, x: f.x.map((v, i) => (i === iAnterior ? 1 : v)) }));
    const r = partirParaPrueba([...filas(2024, 100, 1), ...conAnterior]);
    expect(r.criterio).toBe('ESTUDIANTES');
    const corteCero = filas(2025, 100, 7).map((f) => ({ ...f, corte: 0 }));
    expect(partirParaPrueba([...filas(2024, 100, 1), ...corteCero]).criterio).toBe('ESTUDIANTES');
  });

  it('aprende una señal clara y la prueba lo confirma', () => {
    const r = entrenarYEvaluar([...filas(2024, 400, 4), ...filas(2025, 200, 5)], { iterations: 300 });
    expect(r.criterio_prueba).toBe('ANIO');
    expect(r.filas_prueba).toBe(200);
    expect(r.metricas.auc).toBeGreaterThan(0.9);
    expect(motivoDeRechazo(r.metricas)).toBeNull();
  }, 30_000);
});
