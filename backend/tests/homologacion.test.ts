import { describe, expect, it } from 'vitest';
import { areaExenta, calcularNotaArea, calcularPromedioGeneral, porcentajesEnArea } from '../src/utils/calculoNotas';
import { armarTablaValoraciones, notaDefinitiva } from '../src/utils/certificadoEstudios';
import {
  convertirNota,
  EscalaExternaCalculo,
  notaDesdeFuentes,
  sugerirCorrespondencia,
  validarEscalaExterna,
} from '../src/utils/homologacion';
import { contarReprobadas, notaAnual } from '../src/utils/recuperaciones';

const destino = { nota_minima: 1, nota_maxima: 5, nota_aprobatoria: 3, precision_decimales: 1 };

const uno_a_diez: EscalaExternaCalculo = {
  nombre: '1 a 10',
  tipo: 'NUMERICA',
  valor_minimo: 1,
  valor_maximo: 10,
  valor_aprobatorio: 6,
  metodo: 'LINEAL',
  rangos: [],
  conceptos: [],
};

describe('convertirNota', () => {
  it('lineal anclada en la aprobatoria: aprobar allá es aprobar aquí', () => {
    expect(convertirNota(uno_a_diez, '6', destino)).toEqual({ ok: true, nota: 3 });
    expect(convertirNota(uno_a_diez, '10', destino)).toEqual({ ok: true, nota: 5 });
    expect(convertirNota(uno_a_diez, '1', destino)).toEqual({ ok: true, nota: 1 });
    expect(convertirNota(uno_a_diez, '8,0', destino)).toEqual({ ok: true, nota: 4 });
  });

  it('lo que reprueba allá nunca se redondea hasta aprobar', () => {
    const r = convertirNota(uno_a_diez, '5.99', destino);
    expect(r.ok && r.nota).toBe(2.9);
  });

  it('lineal sin aprobatoria conocida: proporción simple entre extremos', () => {
    const r = convertirNota({ ...uno_a_diez, valor_minimo: 0, valor_maximo: 100, valor_aprobatorio: null }, 50, destino);
    expect(r).toEqual({ ok: true, nota: 3 });
  });

  it('por rangos y conceptual, con la tabla del colegio', () => {
    const rangos: EscalaExternaCalculo = {
      ...uno_a_diez,
      metodo: 'RANGOS',
      rangos: [
        { desde: 1, hasta: 5.9, nota: 2 },
        { desde: 6, hasta: 8.9, nota: 3.8 },
        { desde: 9, hasta: 10, nota: 4.8 },
      ],
    };
    expect(convertirNota(rangos, '9.5', destino)).toEqual({ ok: true, nota: 4.8 });
    const conceptual: EscalaExternaCalculo = {
      nombre: 'Conceptual',
      tipo: 'CONCEPTUAL',
      valor_minimo: null,
      valor_maximo: null,
      valor_aprobatorio: null,
      metodo: 'LINEAL',
      rangos: [],
      conceptos: [
        { concepto: 'Excelente', abreviatura: 'E', nota: 4.8 },
        { concepto: 'Aceptable', abreviatura: 'A', nota: 3.2 },
        { concepto: 'Insuficiente', abreviatura: 'I', nota: 2 },
      ],
    };
    expect(convertirNota(conceptual, 'excelente', destino)).toEqual({ ok: true, nota: 4.8 });
    expect(convertirNota(conceptual, 'A', destino)).toEqual({ ok: true, nota: 3.2 });
    expect(convertirNota(conceptual, 'Sobresaliente', destino).ok).toBe(false);
  });

  it('rechaza lo que no es de la escala o se sale de la del año', () => {
    expect(convertirNota(uno_a_diez, '11', destino).ok).toBe(false);
    expect(convertirNota(uno_a_diez, 'ocho', destino).ok).toBe(false);
    const malConfigurada = { ...uno_a_diez, metodo: 'RANGOS' as const, rangos: [{ desde: 1, hasta: 10, nota: 7 }] };
    expect(convertirNota(malConfigurada, '5', destino).ok).toBe(false);
  });
});

describe('validarEscalaExterna', () => {
  it('exige extremos coherentes, rangos sin traslapes y conceptos únicos', () => {
    expect(validarEscalaExterna(uno_a_diez)).toBeNull();
    expect(validarEscalaExterna({ ...uno_a_diez, valor_aprobatorio: 10 })).toMatch(/aprobatoria/);
    expect(
      validarEscalaExterna({ ...uno_a_diez, metodo: 'RANGOS', rangos: [{ desde: 1, hasta: 6, nota: 2 }, { desde: 6, hasta: 10, nota: 4 }] })
    ).toMatch(/traslapan/);
    expect(
      validarEscalaExterna({ ...uno_a_diez, tipo: 'CONCEPTUAL', conceptos: [{ concepto: 'Bueno', abreviatura: 'B', nota: 4 }, { concepto: 'Básico', abreviatura: 'b', nota: 3 }] })
    ).toMatch(/repetido/);
  });
});

describe('esquemas de periodos', () => {
  it('3 trimestres → 4 periodos, por partes iguales del año', () => {
    const c = sugerirCorrespondencia([1, 2, 3, 4].map((numero) => ({ numero })), [{ nombre: 'T1' }, { nombre: 'T2' }, { nombre: 'T3' }]);
    expect(c[0]?.fuentes).toEqual([{ indice_origen: 0, peso: 100 }]);
    expect(c[1]?.fuentes).toEqual([
      { indice_origen: 0, peso: 33.3 },
      { indice_origen: 1, peso: 66.7 },
    ]);
  });

  it('con fechas en ambos esquemas cruza por fechas', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const c = sugerirCorrespondencia(
      [
        { numero: 1, fecha_inicio: d('2026-01-01'), fecha_fin: d('2026-04-01') },
        { numero: 2, fecha_inicio: d('2026-04-01'), fecha_fin: d('2026-07-01') },
      ],
      [
        { nombre: 'S1', fecha_inicio: d('2026-01-01'), fecha_fin: d('2026-07-01') },
        { nombre: 'S2', fecha_inicio: d('2026-07-01'), fecha_fin: d('2026-12-01') },
      ]
    );
    expect(c[0]?.fuentes).toEqual([{ indice_origen: 0, peso: 100 }]);
    expect(c[1]?.fuentes).toEqual([{ indice_origen: 0, peso: 100 }]);
  });

  it('la nota del periodo local pondera sus fuentes', () => {
    expect(notaDesdeFuentes([{ nota_convertida: 3, peso: 33.3 }, { nota_convertida: 4.5, peso: 66.7 }], 1)).toBe(4);
    expect(notaDesdeFuentes([], 1)).toBeNull();
  });
});

describe('exentas por traslado en el cálculo', () => {
  it('el área redistribuye el peso de la exenta y no castiga con cero', () => {
    const asignaturas = [
      { nota: 4, porcentaje: 60 },
      { nota: null, porcentaje: 40, exenta: true },
    ];
    expect(calcularNotaArea(asignaturas, 'PONDERADO')).toBe(4);
    expect(porcentajesEnArea(asignaturas, 'PONDERADO')).toEqual([100, 0]);
    expect(calcularNotaArea(asignaturas, 'ARITMETICO')).toBe(4);
  });

  it('sin exentas es exactamente la ponderación de M06', () => {
    expect(calcularNotaArea([{ nota: 4, porcentaje: 60 }, { nota: 3, porcentaje: 40 }], 'PONDERADO')).toBe(3.6);
    expect(calcularNotaArea([{ nota: 4, porcentaje: 60 }, { nota: null, porcentaje: 40 }], 'PONDERADO')).toBeNull();
  });

  it('un área toda exenta no tiene nota y no entra al promedio', () => {
    const exentas = [{ nota: null, porcentaje: 100, exenta: true }];
    expect(calcularNotaArea(exentas, 'PONDERADO')).toBeNull();
    expect(areaExenta(exentas)).toBe(true);
    expect(calcularPromedioGeneral([4, 3])).toBe(3.5);
  });

  it('la definitiva anual promedia solo los periodos cursados o evaluados', () => {
    const periodos = [
      { porcentaje: 25, nota: null, exento: true },
      { porcentaje: 25, nota: 4 },
      { porcentaje: 25, nota: 3 },
      { porcentaje: 25, nota: 5 },
    ];
    expect(notaAnual(periodos, 1)).toBe(4);
    expect(notaAnual(periodos.map((p) => ({ ...p, exento: true })), 1)).toBeNull();
    expect(notaDefinitiva([null, 4, 3, 5], [25, 25, 25, 25], [true, false, false, false])).toBe(4);
  });

  it('una exenta nunca cuenta como reprobada', () => {
    expect(contarReprobadas([{ nota: 2, exenta: false }, { nota: null, exenta: true }, { nota: 4, exenta: false }], 3)).toBe(1);
  });

  it('el certificado marca lo homologado (H) y lo exento (E) con su convención al pie', () => {
    const periodos = [1, 2].map((numero) => ({ numero, nombre: `P${numero}`, porcentaje: 50 }));
    const boletines = [
      {
        numero: 1,
        areas: [
          {
            area_id: 'a',
            nombre: 'Ciencias',
            nota_area: 4,
            asignaturas: [
              { subject_id: 'q', nombre: 'Química', nota_asignatura: 4, homologada: true },
              { subject_id: 'f', nombre: 'Filosofía', nota_asignatura: null, exenta: true },
            ],
          },
        ],
      },
      {
        numero: 2,
        areas: [
          {
            area_id: 'a',
            nombre: 'Ciencias',
            nota_area: 3.5,
            asignaturas: [
              { subject_id: 'q', nombre: 'Química', nota_asignatura: 3 },
              { subject_id: 'f', nombre: 'Filosofía', nota_asignatura: 4 },
            ],
          },
        ],
      },
    ];
    const tabla = armarTablaValoraciones(periodos, boletines, new Map(), null, 1, () => 'Alto');
    expect(tabla.completo).toBe(true);
    expect(tabla.tabla.filas[1]?.celdas[3]).toBe('3.5 (H)');
    // Filosofía solo se cursó en el P2: su final es esa nota, no un promedio con cero.
    expect(tabla.tabla.filas[2]?.celdas[3]).toBe('4.0');
    expect(tabla.tabla.pie).toMatch(/\(H\)/);
    expect(tabla.tabla.pie).toMatch(/exenta por traslado/);
  });
});
