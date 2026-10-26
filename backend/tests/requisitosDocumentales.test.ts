import { describe, expect, it } from 'vitest';
import { NIVELES_EDUCATIVOS, TIPOS_INGRESO } from '../src/constants/enums';
import { generarChecklistMatricula } from '../src/constants/matriculaChecklist';
import { REQUISITOS_INICIALES, categoriaInicial, indicacionInicial } from '../src/constants/requisitosDocumentales';
import { RequisitoDelCatalogo, seleccionarRequisitos } from '../src/utils/requisitosDocumentales';

const catalogoInicial: RequisitoDelCatalogo[] = REQUISITOS_INICIALES.map((r) => ({ ...r, indicacion: indicacionInicial(r.clave), categoria: categoriaInicial(r.clave) }));

// Un nivel por grado, como el catálogo de grados: -2..-1 y 0 preescolar, 1..5 primaria, 6..9 secundaria, 10..11 media.
const nivelDe = (n: number) => (n <= 0 ? 'PREESCOLAR' : n <= 5 ? 'PRIMARIA' : n <= 9 ? 'SECUNDARIA' : 'MEDIA') as (typeof NIVELES_EDUCATIVOS)[number];

describe('el catálogo sembrado pide exactamente lo mismo que las reglas de siempre', () => {
  const grados = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  for (const numero of grados) {
    for (const tipoIngreso of TIPOS_INGRESO) {
      for (const tieneDiscapacidad of [false, true]) {
        for (const parentescoAcudiente of ['MADRE', 'PADRE', 'TUTOR_LEGAL', undefined]) {
          it(`grado ${numero} · ${tipoIngreso} · discapacidad ${tieneDiscapacidad} · ${parentescoAcudiente ?? 'sin acudiente'}`, () => {
            const contexto = { nivel: nivelDe(numero), numeroGrado: numero, tipoIngreso, tieneDiscapacidad, parentescoAcudiente };
            const antes = generarChecklistMatricula(contexto).map((i) => ({ tipo: i.tipo_documento, obligatorio: i.obligatorio, nombre: i.nombre_personalizado }));
            const ahora = seleccionarRequisitos(catalogoInicial, contexto).map((i) => ({ tipo: i.tipo_documento, obligatorio: i.obligatorio, nombre: i.nombre_personalizado }));
            expect(ahora.map((i) => [i.tipo, i.obligatorio])).toEqual(antes.map((i) => [i.tipo, i.obligatorio]));
            // El nombre con el grado anterior es el de siempre, salvo el sufijo «(cierra la básica…)» de 10° (ahora el colegio lo puede escribir)
            // y la redacción «Certificado o boletín» con que el colegio actualizó el texto de partida.
            const sinBoletin = (n: string) => n.replace('Certificado o boletín', 'Certificado');
            for (const item of ahora) {
              const previo = antes.find((a) => a.tipo === item.tipo);
              if (previo?.nombre) expect(previo.nombre.startsWith(sinBoletin(item.nombre))).toBe(true);
            }
          });
        }
      }
    }
  }
});

describe('seleccionarRequisitos', () => {
  const doc = (extra: Partial<RequisitoDelCatalogo>): RequisitoDelCatalogo => ({
    clave: 'X',
    nombre: 'X',
    indicacion: '',
    categoria: 'INSTITUCIONAL',
    obligatorio: true,
    niveles: [],
    grados_numeros: [],
    tipos_ingreso: [],
    condicion_especial: 'NINGUNA',
    orden: 1,
    ...extra,
  });
  const ctx = { nivel: 'SECUNDARIA' as const, numeroGrado: 7, tipoIngreso: 'NUEVO' as const };

  it('sin grados ni tipos marcados se pide a todos', () => {
    expect(seleccionarRequisitos([doc({})], ctx)).toHaveLength(1);
  });

  it('un documento de un grado nuevo que el colegio crea se pide solo a ese grado', () => {
    const c = [doc({ clave: 'CARTA', grados_numeros: [7] })];
    expect(seleccionarRequisitos(c, ctx)).toHaveLength(1);
    expect(seleccionarRequisitos(c, { ...ctx, numeroGrado: 8 })).toHaveLength(0);
  });

  it('respeta el tipo de ingreso, la condición y que sea opcional', () => {
    const c = [doc({ clave: 'A', tipos_ingreso: ['ANTIGUO'] }), doc({ clave: 'B', condicion_especial: 'CON_DISCAPACIDAD', obligatorio: false })];
    expect(seleccionarRequisitos(c, ctx)).toHaveLength(0);
    expect(seleccionarRequisitos(c, { ...ctx, tieneDiscapacidad: true }).map((i) => [i.tipo_documento, i.obligatorio])).toEqual([['B', false]]);
    expect(seleccionarRequisitos(c, { ...ctx, tipoIngreso: 'ANTIGUO' }).map((i) => i.tipo_documento)).toEqual(['A']);
  });

  it('reemplaza {grado_anterior} por el número del grado anterior', () => {
    const [item] = seleccionarRequisitos([doc({ nombre: 'Certificado de {grado_anterior}° aprobado' })], ctx);
    expect(item?.nombre_personalizado).toBe('Certificado de 6° aprobado');
  });
});
