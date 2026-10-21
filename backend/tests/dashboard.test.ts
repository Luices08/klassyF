import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEscalaEvaluacion } from '../src/models/academicYear.model';
import { memorizar, vaciarCacheCorta } from '../src/utils/cacheCorta';
import {
  ClaseParaAvance,
  agruparDocentesPendientes,
  clasificarEstudiante,
  compararGruposPorGrado,
  distribucionDesempeno,
  elegirPeriodoDeReferencia,
  elegirPeriodoEnCurso,
  porcentaje,
  rankingMorbilidadPorArea,
  rankingMorbilidadPorAsignatura,
  resumirAvancePlanillas,
  resumirCupos,
  resumirEficienciaPorGrado,
  resumirRendimiento,
  resumirServicioSocial,
} from '../src/utils/dashboard';

const escala: IEscalaEvaluacion = {
  nota_minima: 1,
  nota_maxima: 5,
  nota_aprobatoria: 3,
  precision_decimales: 1,
  rangos: [
    { nivel: 'BAJO', etiqueta: 'Bajo', valor_minimo: 1, valor_maximo: 2.9, es_aprobatorio: false },
    { nivel: 'BASICO', etiqueta: 'Básico', valor_minimo: 3, valor_maximo: 3.9, es_aprobatorio: true },
    { nivel: 'ALTO', etiqueta: 'Alto', valor_minimo: 4, valor_maximo: 4.5, es_aprobatorio: true },
    { nivel: 'SUPERIOR', etiqueta: 'Superior', valor_minimo: 4.6, valor_maximo: 5, es_aprobatorio: true },
  ],
};

describe('porcentaje', () => {
  it('redondea a un decimal y devuelve null sin base (no es lo mismo ninguno que sin datos)', () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(0, 10)).toBe(0);
    expect(porcentaje(0, 0)).toBeNull();
  });
});

describe('periodos de referencia', () => {
  const periodos = [
    { numero: 1, estado: 'CERRADO' },
    { numero: 2, estado: 'EN_DIGITACION' },
    { numero: 3, estado: 'PROGRAMADO' },
  ];

  it('el periodo en curso es el pedido, si existe', () => {
    expect(elegirPeriodoEnCurso(3, periodos)).toBe(3);
    expect(elegirPeriodoEnCurso(9, periodos)).toBe(2);
  });

  it('sin pedido prefiere el que está en digitación, luego el abierto, luego el último cerrado y por fin el primero', () => {
    expect(elegirPeriodoEnCurso(undefined, periodos)).toBe(2);
    expect(elegirPeriodoEnCurso(undefined, [{ numero: 1, estado: 'CERRADO' }, { numero: 2, estado: 'ABIERTO' }])).toBe(2);
    expect(elegirPeriodoEnCurso(undefined, [{ numero: 1, estado: 'CERRADO' }, { numero: 2, estado: 'CERRADO' }])).toBe(2);
    expect(elegirPeriodoEnCurso(undefined, [{ numero: 1, estado: 'PROGRAMADO' }, { numero: 2, estado: 'PROGRAMADO' }])).toBe(1);
  });

  it('el periodo de las notas es el pedido o el último con notas cerradas, y si ninguno el primero', () => {
    expect(elegirPeriodoDeReferencia(2, [1, 2, 3], [1])).toBe(2);
    expect(elegirPeriodoDeReferencia(undefined, [1, 2, 3], [1, 2])).toBe(2);
    expect(elegirPeriodoDeReferencia(undefined, [1, 2, 3], [])).toBe(1);
    expect(elegirPeriodoDeReferencia(undefined, [1, 2, 3], [7])).toBe(1);
  });
});

describe('resumirCupos', () => {
  it('calcula disponibles y ocupación, y nunca disponibles negativos', () => {
    expect(resumirCupos(90, 120)).toEqual({ matriculados: 90, capacidad: 120, disponibles: 30, ocupacion_pct: 75 });
    expect(resumirCupos(130, 120).disponibles).toBe(0);
    expect(resumirCupos(0, 0).ocupacion_pct).toBeNull();
  });
});

describe('clasificarEstudiante', () => {
  it('con cierre oficial manda el cierre; los resultados sin resolver quedan pendientes', () => {
    expect(clasificarEstudiante({ resultado_oficial: 'PROMOVIDO_POR_RECUPERACION', perdidas: 4, sin_reprobacion: false })).toBe('PROMOVIDO');
    expect(clasificarEstudiante({ resultado_oficial: 'NO_PROMOVIDO', perdidas: 0, sin_reprobacion: false })).toBe('NO_PROMOVIDO');
    expect(clasificarEstudiante({ resultado_oficial: 'EN_COMISION', perdidas: 0, sin_reprobacion: false })).toBe('PENDIENTE');
  });

  it('sin cierre solo distingue quien va sin asignaturas perdidas de quien las tiene, o no tiene notas', () => {
    expect(clasificarEstudiante({ resultado_oficial: null, perdidas: 0, sin_reprobacion: false })).toBe('SIN_PERDIDAS');
    expect(clasificarEstudiante({ resultado_oficial: null, perdidas: 2, sin_reprobacion: false })).toBe('CON_PERDIDAS');
    expect(clasificarEstudiante({ resultado_oficial: null, perdidas: null, sin_reprobacion: false })).toBe('SIN_NOTAS');
  });

  it('en Preescolar nadie reprueba, con o sin notas', () => {
    expect(clasificarEstudiante({ resultado_oficial: null, perdidas: 3, sin_reprobacion: true })).toBe('PROMOVIDO');
    expect(clasificarEstudiante({ resultado_oficial: 'NO_PROMOVIDO', perdidas: 3, sin_reprobacion: true })).toBe('PROMOVIDO');
  });
});

describe('eficiencia por grado y rendimiento', () => {
  const grados = [
    { grado_id: 'g6', grado: 'Sexto', grado_numero: 6 },
    { grado_id: 'g0', grado: 'Transición', grado_numero: 0 },
  ];

  it('una fila por grado ofrecido, ordenadas por número, con retirados aparte', () => {
    const filas = resumirEficienciaPorGrado(
      grados,
      [
        { grado_id: 'g6', clasificacion: 'PROMOVIDO' },
        { grado_id: 'g6', clasificacion: 'NO_PROMOVIDO' },
      ],
      new Map([['g6', 2]])
    );
    expect(filas.map((f) => f.grado_numero)).toEqual([0, 6]);
    expect(filas[0]).toMatchObject({ matriculados: 0, retirados: 0 });
    expect(filas[1]).toMatchObject({ matriculados: 2, retirados: 2, promovidos: 1, no_promovidos: 1 });
  });

  it('es oficial solo cuando todos tienen resultado final', () => {
    const filas = resumirEficienciaPorGrado(
      grados,
      [
        { grado_id: 'g6', clasificacion: 'PROMOVIDO' },
        { grado_id: 'g6', clasificacion: 'PROMOVIDO' },
        { grado_id: 'g6', clasificacion: 'NO_PROMOVIDO' },
        { grado_id: 'g6', clasificacion: 'PROMOVIDO' },
      ],
      new Map()
    );
    expect(resumirRendimiento(filas)).toEqual({ modo: 'OFICIAL', aprobacion_pct: 75, reprobacion_pct: 25, base: 4 });
  });

  it('mientras falten cierres es provisional y cuenta a los que van sin perdidas contra los que las tienen', () => {
    const filas = resumirEficienciaPorGrado(
      grados,
      [
        { grado_id: 'g6', clasificacion: 'SIN_PERDIDAS' },
        { grado_id: 'g6', clasificacion: 'SIN_PERDIDAS' },
        { grado_id: 'g6', clasificacion: 'CON_PERDIDAS' },
        { grado_id: 'g6', clasificacion: 'SIN_NOTAS' },
      ],
      new Map()
    );
    // Quien no tiene notas no entra a la base: no se puede decir que va bien ni mal.
    expect(resumirRendimiento(filas)).toEqual({ modo: 'PROVISIONAL', aprobacion_pct: 66.7, reprobacion_pct: 33.3, base: 3 });
  });

  it('quien espera recuperación o comisión cuenta del lado de quienes tienen algo por resolver', () => {
    const filas = resumirEficienciaPorGrado(
      grados,
      [
        { grado_id: 'g6', clasificacion: 'PROMOVIDO' },
        { grado_id: 'g6', clasificacion: 'PENDIENTE' },
      ],
      new Map()
    );
    expect(resumirRendimiento(filas)).toEqual({ modo: 'PROVISIONAL', aprobacion_pct: 50, reprobacion_pct: 50, base: 2 });
  });

  it('sin estudiantes o sin ninguna nota no hay porcentaje que mostrar', () => {
    expect(resumirRendimiento(resumirEficienciaPorGrado(grados, [], new Map())).modo).toBe('SIN_DATOS');
    const sinNotas = resumirEficienciaPorGrado(grados, [{ grado_id: 'g6', clasificacion: 'SIN_NOTAS' }], new Map());
    expect(resumirRendimiento(sinNotas)).toEqual({ modo: 'SIN_DATOS', aprobacion_pct: null, reprobacion_pct: null, base: 0 });
  });
});

describe('morbilidad académica', () => {
  const conteos = [
    { clave: 'mat6', nombre: 'Matemáticas', area: 'Matemáticas', evaluados: 40, reprobados: 20 },
    { clave: 'est6', nombre: 'Estadística', area: 'Matemáticas', evaluados: 40, reprobados: 4 },
    { clave: 'ing', nombre: 'Inglés', area: 'Humanidades', evaluados: 40, reprobados: 12 },
    { clave: 'art', nombre: 'Artes', area: 'Artística', evaluados: 3, reprobados: 3 },
    { clave: 'edf', nombre: 'Educación física', area: 'Deportes', evaluados: 40, reprobados: 0 },
  ];

  it('ordena por porcentaje, descarta los de muy pocos evaluados y los que no reprueban nadie', () => {
    const ranking = rankingMorbilidadPorAsignatura(conteos, 8, 10);
    expect(ranking.map((r) => r.nombre)).toEqual(['Matemáticas', 'Inglés', 'Estadística']);
    expect(ranking[0]).toMatchObject({ porcentaje: 50 });
  });

  it('respeta el límite de filas', () => {
    expect(rankingMorbilidadPorAsignatura(conteos, 8, 1)).toHaveLength(1);
  });

  it('agrupa por área sumando sus asignaturas', () => {
    const porArea = rankingMorbilidadPorArea(conteos, 8, 10);
    expect(porArea[0]).toMatchObject({ nombre: 'Matemáticas', evaluados: 80, reprobados: 24, porcentaje: 30 });
    expect(porArea.map((r) => r.nombre)).toEqual(['Matemáticas', 'Humanidades']);
  });
});

describe('entrega de notas', () => {
  const clase = (docente_id: string, estado: ClaseParaAvance['estado'], estudiantes: number, cerradas: number, asignatura = 'Mat'): ClaseParaAvance => ({
    docente_id,
    docente: `Docente ${docente_id}`,
    asignatura,
    grupo: '6-A',
    estudiantes,
    cerradas,
    estado,
  });

  const clases = [clase('a', 'CERRADA', 30, 30), clase('a', 'ABIERTA', 30, 10, 'Len'), clase('b', 'DEFINITIVA', 20, 20), clase('c', 'ABIERTA', 25, 0), clase('c', 'ABIERTA', 25, 5, 'Cien')];

  it('el avance cuenta planillas y notas cerradas', () => {
    expect(resumirAvancePlanillas(clases)).toEqual({ clases_total: 5, clases_cerradas: 2, clases_pct: 40, notas_esperadas: 130, notas_cerradas: 65, notas_pct: 50 });
  });

  it('sin clases no hay porcentaje', () => {
    expect(resumirAvancePlanillas([])).toMatchObject({ clases_total: 0, clases_pct: null, notas_pct: null });
  });

  it('lista a los docentes con planillas abiertas, el que más debe primero', () => {
    const { total, docentes } = agruparDocentesPendientes(clases, 10);
    expect(total).toBe(2);
    expect(docentes.map((d) => [d.docente_id, d.pendientes])).toEqual([
      ['c', 2],
      ['a', 1],
    ]);
  });

  it('recorta docentes y clases por docente pero informa cuántos hay en total', () => {
    const muchas = Array.from({ length: 8 }, (_, i) => clase('x', 'ABIERTA', 10, 0, `Asig ${i}`));
    const { total, docentes } = agruparDocentesPendientes([...muchas, clase('y', 'ABIERTA', 10, 0)], 1, 3);
    expect(total).toBe(2);
    expect(docentes).toHaveLength(1);
    expect(docentes[0]?.pendientes).toBe(8);
    expect(docentes[0]?.clases).toHaveLength(3);
  });
});

describe('distribucionDesempeno', () => {
  it('reparte las notas por nivel de la escala y ordena de Superior a Bajo', () => {
    const { total, niveles } = distribucionDesempeno(
      [
        { nota: 4.8, total: 10 },
        { nota: 4.2, total: 20 },
        { nota: 3.5, total: 30 },
        { nota: 2.0, total: 40 },
      ],
      escala
    );
    expect(total).toBe(100);
    expect(niveles.map((n) => [n.nivel, n.total, n.porcentaje])).toEqual([
      ['SUPERIOR', 10, 10],
      ['ALTO', 20, 20],
      ['BASICO', 30, 30],
      ['BAJO', 40, 40],
    ]);
  });

  it('una nota fuera de la escala se omite en lugar de romper', () => {
    const { total, niveles } = distribucionDesempeno([{ nota: 9, total: 5 }, { nota: 4, total: 5 }], escala);
    expect(total).toBe(5);
    expect(niveles.find((n) => n.nivel === 'ALTO')?.total).toBe(5);
  });

  it('sin notas los porcentajes son null', () => {
    expect(distribucionDesempeno([], escala).niveles.every((n) => n.porcentaje === null)).toBe(true);
  });
});

describe('compararGruposPorGrado', () => {
  const g = (grupo_id: string, etiqueta: string, grado_id: string, grado_numero: number, promedio: number | null) => ({ grupo_id, etiqueta, grado_id, grado: `G${grado_numero}`, grado_numero, promedio, notas: 10 });

  it('compara los grupos del mismo grado y da la brecha entre el mejor y el peor', () => {
    const r = compararGruposPorGrado([g('1', '8-B', 'g8', 8, 3.5), g('2', '8-A', 'g8', 8, 4.1), g('3', '6-A', 'g6', 6, 4)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ grado_numero: 8, brecha: 0.6 });
    expect(r[0]?.grupos.map((x) => x.etiqueta)).toEqual(['8-A', '8-B']);
  });

  it('un grado con un solo grupo no tiene con quién compararse', () => {
    expect(compararGruposPorGrado([g('1', '6-A', 'g6', 6, 4)])).toEqual([]);
  });

  it('un grupo sin promedio no inventa brecha', () => {
    const r = compararGruposPorGrado([g('1', '8-A', 'g8', 8, 4), g('2', '8-B', 'g8', 8, null)]);
    expect(r[0]?.brecha).toBeNull();
  });
});

describe('resumirServicioSocial', () => {
  it('cuenta aprobados y pendientes y suma las horas por verificar', () => {
    expect(
      resumirServicioSocial([
        { estado: 'Aprobado', por_verificar: 0 },
        { estado: 'Pendiente', por_verificar: 10.5 },
        { estado: 'Pendiente', por_verificar: 4 },
      ])
    ).toEqual({ estudiantes: 3, aprobados: 1, pendientes: 2, sin_exigencia: false, horas_por_verificar: 14.5 });
  });

  it('si el colegio no exige horas no hay aprobados ni pendientes que contar', () => {
    const r = resumirServicioSocial([{ estado: 'No se exige', por_verificar: 0 }]);
    expect(r).toMatchObject({ estudiantes: 1, aprobados: 0, pendientes: 0, sin_exigencia: true });
  });
});

describe('memorizar', () => {
  beforeEach(() => vaciarCacheCorta());

  it('reutiliza el resultado dentro del tiempo y comparte el cálculo en curso', async () => {
    const calcular = vi.fn(async () => 42);
    const [a, b] = await Promise.all([memorizar('k', 1000, calcular), memorizar('k', 1000, calcular)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calcular).toHaveBeenCalledTimes(1);
    await memorizar('k', 1000, calcular);
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  it('claves distintas se calculan por separado', async () => {
    const calcular = vi.fn(async () => 1);
    await memorizar('a', 1000, calcular);
    await memorizar('b', 1000, calcular);
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it('vuelve a calcular cuando venció', async () => {
    const calcular = vi.fn(async () => 1);
    await memorizar('k', 0, calcular);
    await new Promise((r) => setTimeout(r, 5));
    await memorizar('k', 0, calcular);
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it('una falla no se guarda: el siguiente intento lo repite', async () => {
    const calcular = vi.fn().mockRejectedValueOnce(new Error('falló')).mockResolvedValueOnce('bien');
    await expect(memorizar('k', 1000, calcular)).rejects.toThrow('falló');
    await expect(memorizar('k', 1000, calcular)).resolves.toBe('bien');
    expect(calcular).toHaveBeenCalledTimes(2);
  });
});
