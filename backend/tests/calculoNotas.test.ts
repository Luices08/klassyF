import { describe, expect, it } from 'vitest';
import { calcularNotaArea, calcularNotaAsignatura, calcularPromedioGeneral, estadoAbiertoDe } from '../src/utils/calculoNotas';
import { claveDeComponente, componentesEfectivos, validarComponentesEvaluativos, ComponenteEvaluativo } from '../src/utils/siee';

const hetero: ComponenteEvaluativo = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, origen: 'ACTIVIDADES' };
const auto: ComponenteEvaluativo = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, origen: 'NOTA_DIRECTA' };
const actividades = [
  { id: 'a1', componente: 'HETEROEVALUACION', peso: 1 },
  { id: 'a2', componente: 'HETEROEVALUACION', peso: 3 },
];
const entrada = (notasActividad: Array<[string, number]>, notasDirectas: Array<[string, number]> = []) => ({
  componentes: [hetero, auto],
  actividades,
  notasActividad: new Map(notasActividad),
  notasDirectas: new Map(notasDirectas),
});

describe('calcularNotaAsignatura', () => {
  it('promedia las actividades por su peso y pondera los componentes por su porcentaje', () => {
    // Hetero = (4×1 + 2×3) / 4 = 2.5; nota = (2.5×70 + 5×30) / 100 = 3.25
    const r = calcularNotaAsignatura(entrada([['a1', 4], ['a2', 2]], [['AUTOEVALUACION', 5]]));
    expect(r.componentes).toEqual([
      { clave: 'HETEROEVALUACION', nota: 2.5, completo: true },
      { clave: 'AUTOEVALUACION', nota: 5, completo: true },
    ]);
    expect(r.nota).toBe(3.25);
    expect(r.completa).toBe(true);
    expect(r.faltantes).toEqual([]);
  });

  it('falta de nota no es cero: es parcial, y dice qué falta', () => {
    const sinAuto = calcularNotaAsignatura(entrada([['a1', 4], ['a2', 2]]));
    expect(sinAuto.completa).toBe(false);
    expect(sinAuto.faltantes).toEqual(['AUTOEVALUACION']);
    expect(sinAuto.nota).toBe(2.5); // solo con lo que hay, sin tratar la autoevaluación como 0

    const unaActividad = calcularNotaAsignatura(entrada([['a1', 4]], [['AUTOEVALUACION', 5]]));
    expect(unaActividad.completa).toBe(false); // a2 sin calificar
    expect(unaActividad.componentes[0]).toMatchObject({ nota: 4, completo: false });
  });

  it('un cero es una nota', () => {
    const r = calcularNotaAsignatura(entrada([['a1', 0], ['a2', 0]], [['AUTOEVALUACION', 0]]));
    expect(r.nota).toBe(0);
    expect(r.completa).toBe(true);
  });

  it('sin ninguna nota no hay nota; un componente sin actividades nunca queda completo', () => {
    const vacia = calcularNotaAsignatura(entrada([]));
    expect(vacia).toMatchObject({ nota: null, completa: false });

    const sinActividades = calcularNotaAsignatura({ ...entrada([]), actividades: [] });
    expect(sinActividades.componentes[0]).toEqual({ clave: 'HETEROEVALUACION', nota: null, completo: false });
  });

  it('si todos los pesos son 0 promedia por igual en vez de dividir por cero', () => {
    const r = calcularNotaAsignatura({
      ...entrada([['a1', 4], ['a2', 2]], [['AUTOEVALUACION', 3]]),
      actividades: actividades.map((a) => ({ ...a, peso: 0 })),
    });
    expect(r.componentes[0]?.nota).toBe(3);
  });

  it('redondea a 2 decimales', () => {
    const r = calcularNotaAsignatura({
      componentes: [{ ...hetero, porcentaje: 100 }],
      actividades: [{ id: 'x', componente: 'HETEROEVALUACION', peso: 1 }, { id: 'y', componente: 'HETEROEVALUACION', peso: 2 }],
      notasActividad: new Map([['x', 4], ['y', 3.5]]),
      notasDirectas: new Map(),
    });
    expect(r.nota).toBe(3.67);
  });
});

describe('estadoAbiertoDe', () => {
  it('pendiente si faltan notas, borrador si está completa y aún editable', () => {
    expect(estadoAbiertoDe({ completa: false })).toBe('PENDIENTE');
    expect(estadoAbiertoDe({ completa: true })).toBe('BORRADOR');
  });
});

describe('calcularNotaArea', () => {
  it('ponderado: cada asignatura aporta su porcentaje (Biología 50% y Química 50%)', () => {
    expect(calcularNotaArea([{ nota: 4, porcentaje: 50 }, { nota: 3, porcentaje: 50 }], 'PONDERADO')).toBe(3.5);
    expect(calcularNotaArea([{ nota: 5, porcentaje: 70 }, { nota: 3, porcentaje: 30 }], 'PONDERADO')).toBe(4.4);
  });

  it('aritmético: todas pesan igual, sin importar el porcentaje', () => {
    expect(calcularNotaArea([{ nota: 5, porcentaje: 90 }, { nota: 3, porcentaje: 10 }], 'ARITMETICO')).toBe(4);
  });

  it('si falta la nota de una asignatura, el área no se calcula', () => {
    expect(calcularNotaArea([{ nota: 4, porcentaje: 50 }, { nota: null, porcentaje: 50 }], 'PONDERADO')).toBeNull();
    expect(calcularNotaArea([], 'ARITMETICO')).toBeNull();
  });
});

describe('calcularPromedioGeneral', () => {
  it('promedia las áreas y exige todas', () => {
    expect(calcularPromedioGeneral([4, 3.5, 5])).toBe(4.17);
    expect(calcularPromedioGeneral([4, null])).toBeNull();
    expect(calcularPromedioGeneral([])).toBeNull();
  });
});

describe('componentesEfectivos', () => {
  it('sin componentes definidos rige Saber/Hacer/Ser con el respaldo 40/40/20', () => {
    expect(componentesEfectivos({}).map((c) => [c.clave, c.porcentaje, c.origen])).toEqual([
      ['COGNITIVO_SABER', 40, 'ACTIVIDADES'],
      ['PROCEDIMENTAL_HACER', 40, 'ACTIVIDADES'],
      ['ACTITUDINAL_SER', 20, 'ACTIVIDADES'],
    ]);
  });

  it('respeta la ponderación que el colegio ya había personalizado', () => {
    const efectivos = componentesEfectivos({ ponderacion_componentes: { COGNITIVO_SABER: 0.5, PROCEDIMENTAL_HACER: 0.3, ACTITUDINAL_SER: 0.2 } });
    expect(efectivos.map((c) => c.porcentaje)).toEqual([50, 30, 20]);
  });

  it('los componentes definidos reemplazan al respaldo', () => {
    expect(componentesEfectivos({ componentes_evaluativos: [hetero, auto] })).toEqual([hetero, auto]);
  });
});

describe('validarComponentesEvaluativos', () => {
  it('acepta bloques que suman 100', () => {
    expect(validarComponentesEvaluativos([hetero, auto])).toBeNull();
  });

  it('exige que sumen exactamente 100', () => {
    expect(validarComponentesEvaluativos([hetero, { ...auto, porcentaje: 20 }])).toMatch(/sumar exactamente 100.*90/);
  });

  it('exige claves y nombres únicos', () => {
    expect(validarComponentesEvaluativos([hetero, { ...auto, clave: 'HETEROEVALUACION' }])).toMatch(/misma clave/);
    expect(validarComponentesEvaluativos([hetero, { ...auto, nombre: ' HETEROEVALUACIÓN ' }])).toMatch(/mismo nombre/);
  });

  it('exige al menos un bloque alimentado por actividades, y no admite listas vacías ni enormes', () => {
    expect(validarComponentesEvaluativos([{ ...auto, porcentaje: 100 }])).toMatch(/alimentarse de actividades/);
    expect(validarComponentesEvaluativos([])).toMatch(/al menos un componente/);
    const nueve = Array.from({ length: 9 }, (_, i) => ({ ...hetero, clave: `C${i}X`, nombre: `C${i}`, porcentaje: 100 / 9 }));
    expect(validarComponentesEvaluativos(nueve)).toMatch(/hasta 8/);
  });
});

describe('claveDeComponente', () => {
  it('genera una clave estable sin tildes ni espacios', () => {
    expect(claveDeComponente('Heteroevaluación', new Set())).toBe('HETEROEVALUACION');
    expect(claveDeComponente('Trabajo en equipo (grupal)', new Set())).toBe('TRABAJO_EN_EQUIPO_GRUPAL');
  });

  it('evita choques con las claves ya usadas', () => {
    expect(claveDeComponente('Ser', new Set(['SER']))).toBe('SER_2');
  });

  it('un nombre sin letras ni números sigue dando una clave válida', () => {
    expect(claveDeComponente('***', new Set())).toBe('COMPONENTE');
    expect(claveDeComponente('A', new Set())).toMatch(/^[A-Z0-9_]{2,40}$/);
  });
});

describe('resolverDesempeno con promedios de 2 decimales', () => {
  // Escala por defecto: Bajo 1.0–2.9 | Básico 3.0–3.9 | Alto 4.0–4.5 | Superior 4.6–5.0 (huecos entre rangos).
  it('resuelve el nivel de una nota que cae entre dos rangos usando la precisión de la escala', async () => {
    const { escalaEfectiva, resolverDesempeno } = await import('../src/utils/escalaEvaluacion');
    const escala = escalaEfectiva(null);
    const nivel = (nota: number) => resolverDesempeno(nota, escala).nivel;
    expect(nivel(2.95)).toBe('BASICO'); // redondea a 3.0
    expect(nivel(3.95)).toBe('ALTO'); // redondea a 4.0
    expect(nivel(4.55)).toBe('SUPERIOR'); // redondea a 4.6
    expect(nivel(3.94)).toBe('BASICO'); // redondea a 3.9
    expect(nivel(2.94)).toBe('BAJO');
    expect(nivel(1)).toBe('BAJO');
    expect(nivel(5)).toBe('SUPERIOR');
    expect(resolverDesempeno(3.95, escala).nota).toBe(3.95); // la nota no se altera, solo el nivel
  });

  it('sin redondeo posible, el hueco pertenece al rango inferior', async () => {
    const { resolverDesempeno } = await import('../src/utils/escalaEvaluacion');
    const escala = {
      nota_minima: 1,
      nota_maxima: 5,
      nota_aprobatoria: 3,
      precision_decimales: 0,
      rangos: [
        { nivel: 'BAJO' as const, etiqueta: 'Bajo', valor_minimo: 1, valor_maximo: 2, es_aprobatorio: false },
        { nivel: 'BASICO' as const, etiqueta: 'Básico', valor_minimo: 3, valor_maximo: 3, es_aprobatorio: true },
        { nivel: 'ALTO' as const, etiqueta: 'Alto', valor_minimo: 5, valor_maximo: 5, es_aprobatorio: true },
        { nivel: 'SUPERIOR' as const, etiqueta: 'Superior', valor_minimo: 5, valor_maximo: 5, es_aprobatorio: true },
      ],
    };
    expect(resolverDesempeno(4, escala).nivel).toBe('BASICO');
  });
});
