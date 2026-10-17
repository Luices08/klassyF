import { describe, expect, it } from 'vitest';
import { PLANTILLA_BOLETIN_INICIAL } from '../src/constants/boletin';
import { renderizarBoletines } from '../src/services/reportCardPdf.service';
import { completarPlantilla } from '../src/utils/plantillaBoletin';
import type { ReportCardAsignatura, ReportCardResult } from '../src/services/reportCard.service';

const asignatura = (n: number, sobre: Partial<ReportCardAsignatura> = {}): ReportCardAsignatura => ({
  subject_id: `s${n}`,
  nombre: `Asignatura ${n}`,
  porcentaje_en_area: 50,
  nota_asignatura: 4.2,
  estado: 'CERRADO',
  desempeno: { nota: 4.2, nivel: 'ALTO', etiqueta: 'Alto', aprobado: true },
  fallas_asignatura: 0,
  componentes: [],
  descripcion: 'Alcanza los desempeños esperados con solidez y muestra buen dominio de los aprendizajes del periodo.',
  recomendacion: '',
  observacion_docente: null,
  ...sobre,
});

function boletin(areas: number, sobre: Partial<ReportCardResult> = {}): ReportCardResult {
  return {
    estudiante: { id: 'e1', nombre_completo: 'Ana María Pérez', documento: '1001', grado: 'Sexto', grupo: '6A', jornada: 'MANANA', sede: 'Sede principal' },
    periodo: 2,
    nombre_periodo: 'Segundo periodo',
    academic_year: 2026,
    institucion: { nombre: 'Colegio de Prueba', codigo_dane: '1100', nit: '900.1', resolucion_aprobacion: '123 de 2020' },
    completo: true,
    pendientes: [],
    puesto_grupo: 3,
    mostrar_puesto: true,
    total_estudiantes_grupo: 30,
    promedio_general_periodo: 4.1,
    desempeno_general: { nota: 4.1, nivel: 'ALTO', etiqueta: 'Alto', aprobado: true },
    asistencia_periodo: { total_fallas_justificadas: 1, total_fallas_injustificadas: 0, total_retardos: 2 },
    areas: Array.from({ length: areas }, (_, i) => ({
      area_id: `a${i}`,
      nombre: `Área ${i + 1}`,
      nota_area: 4.2,
      desempeno_area: { nota: 4.2, nivel: 'ALTO' as const, etiqueta: 'Alto', aprobado: true },
      asignaturas: [asignatura(i * 2), asignatura(i * 2 + 1, { recomendacion: 'Reforzar los temas del periodo.', observacion_docente: 'Participa con entusiasmo en clase.' })],
    })),
    escala: [
      { nivel: 'BAJO', etiqueta: 'Bajo', valor_minimo: 1, valor_maximo: 2.9, es_aprobatorio: false },
      { nivel: 'BASICO', etiqueta: 'Básico', valor_minimo: 3, valor_maximo: 3.9, es_aprobatorio: true },
      { nivel: 'ALTO', etiqueta: 'Alto', valor_minimo: 4, valor_maximo: 4.5, es_aprobatorio: true },
      { nivel: 'SUPERIOR', etiqueta: 'Superior', valor_minimo: 4.6, valor_maximo: 5, es_aprobatorio: true },
    ],
    fecha_entrega: new Date('2026-07-10T00:00:00.000Z'),
    canal_reclamaciones: 'Escriba a coordinación académica dentro de los 5 días hábiles siguientes a la entrega.',
    director_grupo: 'Marta Gómez',
    promocion: null,
    calendario_entregas: [
      { periodo: 'Periodo 1', fecha: new Date('2026-04-10T00:00:00.000Z') },
      { periodo: 'Periodo 2', fecha: null },
    ],
    ...sobre,
  };
}

const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe('renderizarBoletines', () => {
  it('genera un PDF válido de una hoja para un boletín corto', async () => {
    const pdf = await renderizarBoletines([boletin(2)], null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
  });

  it('sigue en otra hoja cuando el boletín no cabe, en vez de cortarlo', async () => {
    expect(paginas(await renderizarBoletines([boletin(12)], null))).toBeGreaterThan(1);
  });

  it('un boletín por estudiante: cada uno empieza en hoja nueva', async () => {
    expect(paginas(await renderizarBoletines([boletin(2), boletin(2), boletin(2)], null))).toBe(3);
  });

  it('un grupo sin estudiantes sale como PDF con un aviso, no como error', async () => {
    const pdf = await renderizarBoletines([], null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
  });

  it('no falla con boletín parcial, sin puesto, sin fecha ni canal de reclamaciones y sin áreas', async () => {
    const pdf = await renderizarBoletines(
      [boletin(0, { completo: false, pendientes: ['Matemáticas'], mostrar_puesto: false, puesto_grupo: null, fecha_entrega: null, canal_reclamaciones: '', promedio_general_periodo: null, desempeno_general: null })],
      null
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  describe('con el diseño del colegio', () => {
    // Un PNG real de 1×1 píxel: pdfkit lo incrusta de verdad (un escudo falso lo haría fallar en silencio).
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const dataUri = `data:image/png;base64,${PNG.toString('base64')}`;
    const conPlantilla = (cambios: Parameters<typeof completarPlantilla>[0]) => ({ plantilla: completarPlantilla(cambios) });

    it.each(['IZQUIERDA', 'CENTRO', 'DERECHA', 'MARCA_DE_AGUA'] as const)('dibuja el escudo propio en la posición %s sin fallar', async (posicion) => {
      const pdf = await renderizarBoletines([boletin(2)], null, conPlantilla({ escudo: { posicion, url: dataUri, tamano: 70 } }));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(paginas(pdf)).toBe(1);
      // Con escudo propio el PDF lleva la imagen incrustada; sin escudo no.
      expect(pdf.toString('latin1')).toContain('/Subtype /Image');
    });

    it('sin escudo no incrusta ninguna imagen, aunque haya logo de la institución', async () => {
      const pdf = await renderizarBoletines([boletin(2)], PNG, conPlantilla({ escudo: { mostrar: false } }));
      expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
    });

    it('usa el logo de la institución cuando el escudo propio no está definido', async () => {
      const pdf = await renderizarBoletines([boletin(2)], PNG, conPlantilla({}));
      expect(pdf.toString('latin1')).toContain('/Subtype /Image');
    });

    it('la marca de agua se pinta tenue en cada hoja del boletín', async () => {
      const pdf = await renderizarBoletines([boletin(12)], null, conPlantilla({ escudo: { posicion: 'MARCA_DE_AGUA', url: dataUri } }));
      expect(paginas(pdf)).toBeGreaterThan(1);
      expect((pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
      expect(pdf.toString('latin1')).toContain('0.07');
    });

    it('respeta el tamaño de papel: carta o A4', async () => {
      const carta = (await renderizarBoletines([boletin(1)], null, conPlantilla({ papel: 'LETTER' }))).toString('latin1');
      const a4 = (await renderizarBoletines([boletin(1)], null, conPlantilla({ papel: 'A4' }))).toString('latin1');
      expect(carta).toContain('/MediaBox [0 0 612 792]');
      expect(a4).toContain('/MediaBox [0 0 595.28 841.89]');
    });

    it('con todas las secciones apagadas queda solo el encabezado, en una hoja', async () => {
      const secciones = PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: false }));
      const pdf = await renderizarBoletines([boletin(12)], null, conPlantilla({ secciones }));
      expect(paginas(pdf)).toBe(1);
    });

    it('apagar las opciones de cada asignatura achica el boletín', async () => {
      const completo = paginas(await renderizarBoletines([boletin(14)], null, conPlantilla({})));
      const sinTextos = paginas(
        await renderizarBoletines([boletin(14)], null, conPlantilla({ asignaturas: { descripcion: false, recomendacion: false, observacion: false } }))
      );
      expect(sinTextos).toBeLessThanOrEqual(completo);
    });

    it('dibuja las firmas, el pie y los títulos propios sin fallar, también con el director sin nombre', async () => {
      const plantilla = completarPlantilla({
        titulo: 'Boletín de calificaciones',
        subtitulo: 'Educar para la vida',
        pie_texto: 'Este informe es oficial.',
        secciones: PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: true, titulo: s.titulo || 'Sección' })),
        firmas: [
          { cargo: 'Rector(a)', nombre: 'Ana Ruiz', usa_director_grupo: false },
          { cargo: 'Director(a) de grupo', nombre: '', usa_director_grupo: true },
        ],
      });
      const pdf = await renderizarBoletines([boletin(2), boletin(2, { director_grupo: null })], null, { plantilla });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      // Con las diez secciones activas cada boletín ocupa más de una hoja, y el siguiente empieza en hoja nueva.
      expect(paginas(pdf)).toBeGreaterThanOrEqual(2);
    });

    it('la sección de promoción dibuja el resultado de M19 cuando existe y las casillas en blanco cuando no', async () => {
      const secciones = PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: s.clave === 'PROMOCION' }));
      const plantilla = conPlantilla({ secciones });
      const conResultado = await renderizarBoletines([boletin(1, { promocion: { resultado: 'PROMOVIDO', texto: 'Promovido al grado siguiente', acta: 'ACE-2026-001' } })], null, plantilla);
      const enBlanco = await renderizarBoletines([boletin(1)], null, plantilla);
      expect(conResultado.subarray(0, 5).toString()).toBe('%PDF-');
      expect(enBlanco.subarray(0, 5).toString()).toBe('%PDF-');
      expect(conResultado.equals(enBlanco)).toBe(false);
    });

    it('sin firmas definidas, la sección de firmas no dibuja nada', async () => {
      const secciones = PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: s.clave === 'FIRMAS' }));
      const pdf = await renderizarBoletines([boletin(1)], null, conPlantilla({ secciones, firmas: [] }));
      expect(paginas(pdf)).toBe(1);
    });
  });
});

describe('secciones que pide la guía de boletines, fuente y tamaño de letra', () => {
  const conPlantilla = (cambios: Parameters<typeof completarPlantilla>[0]) => ({ plantilla: completarPlantilla(cambios) });
  const bajo = (n: number): ReportCardAsignatura =>
    asignatura(n, { nota_asignatura: 2.1, desempeno: { nota: 2.1, nivel: 'BAJO', etiqueta: 'Bajo', aprobado: false }, recomendacion: 'Asistir a las actividades de apoyo.' });
  const conDificultades = (): ReportCardResult => {
    const b = boletin(1);
    b.areas[0]!.asignaturas = [bajo(1), bajo(2), asignatura(3)];
    return b;
  };
  const solo = (...visibles: string[]) => PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: visibles.includes(s.clave) }));

  it('dibuja dificultades (con y sin asignaturas bajas), apoyo, compromisos, promoción y calendario sin fallar', async () => {
    const plantilla = completarPlantilla({
      secciones: solo('DATOS_ESTUDIANTE', 'DIFICULTADES', 'COMPROMISOS', 'PROMOCION', 'CALENDARIO'),
      texto_apoyo: 'Las actividades de apoyo se programan durante la semana de nivelación.',
      compromisos_lineas: 5,
      promocion_opciones: ['Promovido', 'No promovido', 'Pendiente de plan de apoyo'],
    });
    for (const b of [conDificultades(), boletin(2)]) {
      const pdf = await renderizarBoletines([b], null, { plantilla });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(paginas(pdf)).toBe(1);
    }
  });

  it('una sección de promoción sin opciones, o un calendario sin periodos, no dibuja nada y no falla', async () => {
    const plantilla = completarPlantilla({ secciones: solo('PROMOCION', 'CALENDARIO'), promocion_opciones: [] });
    const pdf = await renderizarBoletines([boletin(1, { calendario_entregas: [] })], null, { plantilla });
    expect(paginas(pdf)).toBe(1);
  });

  it('muestra el grado y los componentes de la valoración cuando el colegio los activa', async () => {
    const b = boletin(1);
    b.areas[0]!.asignaturas[0]!.componentes = [
      { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, nota: 4 },
      { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, nota: 5 },
    ];
    const pdf = await renderizarBoletines([b], null, conPlantilla({ asignaturas: { componentes: true } }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it.each([
    ['SANS', 'Helvetica'],
    ['SERIF', 'Times-Roman'],
    ['MONO', 'Courier'],
  ] as const)('la fuente %s usa %s en todo el documento', async (fuente, base) => {
    const texto = (await renderizarBoletines([boletin(2)], null, conPlantilla({ fuente }))).toString('latin1');
    expect(texto).toContain(`/BaseFont /${base}`);
    for (const otra of ['Helvetica', 'Times-Roman', 'Courier'].filter((f) => f !== base)) expect(texto).not.toContain(`/BaseFont /${otra}`);
  });

  it('un tamaño de letra más grande ocupa más hojas que uno pequeño', async () => {
    const pequeno = paginas(await renderizarBoletines([boletin(10)], null, conPlantilla({ tamano_texto: 'PEQUENO' })));
    const grande = paginas(await renderizarBoletines([boletin(10)], null, conPlantilla({ tamano_texto: 'GRANDE' })));
    expect(grande).toBeGreaterThan(pequeno);
  });

  it('la fuente y el tamaño de un boletín no se filtran al siguiente que se dibuja con otro diseño', async () => {
    await renderizarBoletines([boletin(1)], null, conPlantilla({ fuente: 'MONO', tamano_texto: 'GRANDE' }));
    const normal = (await renderizarBoletines([boletin(2)], null, conPlantilla({}))).toString('latin1');
    expect(normal).toContain('/BaseFont /Helvetica');
    expect(normal).not.toContain('/BaseFont /Courier');
  });

  it('con el diseño original, todo cabe en una hoja para un boletín corto, incluso con las secciones nuevas', async () => {
    expect(paginas(await renderizarBoletines([boletin(2)], null))).toBe(1);
  });
});
