import { describe, expect, it } from 'vitest';
import { PLANTILLA_BOLETIN_INICIAL } from '../src/constants/boletin';
import { AreaInforme, AsignaturaInforme, EstudianteInforme, InformeFinal } from '../src/services/informeFinal.service';
import { renderizarInformeFinal } from '../src/services/informeFinalPdf.service';

const paginasDe = (pdf: Buffer): number => (pdf.toString('latin1').match(/\/Type \/Page(?![s\w])/g) ?? []).length;

const nivel = { etiqueta: 'Desempeño básico', nivel: 'Básico', aprobado: true };

const asignatura = (i: number, descriptivo = false): AsignaturaInforme => ({
  subject_id: `s${i}`,
  nombre: `Asignatura número ${i}`,
  periodos: [1, 2, 3, 4].map((numero) => ({ numero, nota: descriptivo ? null : 3.5, exenta: false, ...(descriptivo ? { valoracion: 'ALCANZADO' as const } : {}) })),
  ...(descriptivo ? { nivel_descriptivo: 'ALCANZADO' as const } : {}),
  nota_anual: descriptivo ? null : 3.5,
  nota_recuperacion: null,
  nota_final: descriptivo ? null : 3.5,
  exenta: false,
  desempeno: descriptivo ? null : nivel,
  fallas: 2,
});

const area = (i: number, nombre: string, nAsignaturas: number, descriptivo = false): AreaInforme => ({
  area_id: `a${i}`,
  nombre,
  nota_final: descriptivo ? null : 3.5,
  desempeno: descriptivo ? null : nivel,
  asignaturas: Array.from({ length: nAsignaturas }, (_, k) => asignatura(i * 100 + k, descriptivo)),
});

const estudiante = (i: number, areas: AreaInforme[], descriptivo = false): EstudianteInforme => ({
  student_id: `e${i}`,
  nombre_completo: `Apellido Nombre ${i}`,
  documento: `10000${i}`,
  areas,
  promedio_general: descriptivo ? null : 3.5,
  desempeno_general: descriptivo ? null : nivel,
  puesto: null,
  asistencia: { justificadas: 1, injustificadas: 2, retardos: 3 },
  promocion: { codigo: 'PROMOVIDO', texto: 'Promovido', oficial: true },
  completo: true,
  descriptivo,
});

const informe = (estudiantes: EstudianteInforme[]): InformeFinal => ({
  generado_en: new Date('2026-11-05T12:00:00Z'),
  estado_datos: 'DEFINITIVO',
  leyenda: 'Definitivo',
  institucion: { nombre: 'Colegio de prueba', codigo_dane: '123456789012', nit: '900000000-1', resolucion_aprobacion: 'Res. 1' },
  anio: 2025,
  periodos: [1, 2, 3, 4].map((numero) => ({ numero, nombre: `Periodo ${numero}`, porcentaje: 25 })),
  nota_aprobatoria: 3,
  mostrar_puesto: false,
  grupo: { etiqueta: '6-A', grado: 'Sexto', sede: 'Principal', jornada: 'MANANA', director: 'Docente Director' },
  estudiantes,
});

// El informe final salía con el nombre del área montado sobre su primera asignatura, el nivel («Desempeño básico») desbordado sobre la fila de abajo y,
// en cada estudiante, una hoja en blanco con solo «Generado el…». Estas pruebas fijan el comportamiento corregido.
describe('Informe final: PDF', () => {
  const areasLargas = [
    area(1, 'Humanidades, lengua castellana e idioma extranjero y otros saberes', 2),
    area(2, 'Ciencias sociales, historia, geografía, constitución política y democracia', 1),
    area(3, 'Matemáticas', 2),
  ];

  it('un estudiante que cabe ocupa exactamente una hoja: el pie no abre una hoja en blanco', async () => {
    const pdf = await renderizarInformeFinal(informe([estudiante(1, areasLargas), estudiante(2, areasLargas), estudiante(3, areasLargas)]), null, PLANTILLA_BOLETIN_INICIAL);
    expect(paginasDe(pdf)).toBe(3);
  });

  it('un estudiante con muchas asignaturas sigue en otra hoja, pero no deja hojas de más', async () => {
    const muchas = Array.from({ length: 12 }, (_, i) => area(i, `Área ${i}`, 3));
    const pdf = await renderizarInformeFinal(informe([estudiante(1, muchas)]), null, PLANTILLA_BOLETIN_INICIAL);
    expect(paginasDe(pdf)).toBeGreaterThanOrEqual(2);
    expect(paginasDe(pdf)).toBeLessThanOrEqual(3);
  });

  it('con un tamaño de texto grande y seis periodos no deja el nombre sin ancho (antes quedaba negativo y se montaba sobre las notas)', async () => {
    const seis = { ...informe([estudiante(1, areasLargas)]), periodos: [1, 2, 3, 4, 5, 6].map((numero) => ({ numero, nombre: `P${numero}`, porcentaje: 16 })) };
    const pdf = await renderizarInformeFinal(seis, null, { ...PLANTILLA_BOLETIN_INICIAL, tamano_texto: 'GRANDE' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(paginasDe(pdf)).toBeGreaterThanOrEqual(1);
  });

  it('Preescolar se dibuja con la valoración descriptiva y también cabe en una hoja', async () => {
    const dimensiones = [area(1, 'Dimensión cognitiva', 1, true), area(2, 'Dimensión comunicativa', 1, true), area(3, 'Dimensión corporal', 1, true)];
    const pdf = await renderizarInformeFinal(informe([estudiante(1, dimensiones, true), estudiante(2, dimensiones, true)]), null, PLANTILLA_BOLETIN_INICIAL);
    expect(paginasDe(pdf)).toBe(2);
  });

  it('un grupo sin estudiantes da un PDF válido', async () => {
    const pdf = await renderizarInformeFinal(informe([]), null, PLANTILLA_BOLETIN_INICIAL);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
