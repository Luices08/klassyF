import { describe, expect, it } from 'vitest';
import { PLANTILLA_BOLETIN_INICIAL } from '../src/constants/boletin';
import { completarPlantilla, rellenarTexto } from '../src/utils/plantillaBoletin';

describe('completarPlantilla', () => {
  it('sin nada guardado, es el diseño original', () => {
    expect(completarPlantilla(null)).toEqual(PLANTILLA_BOLETIN_INICIAL);
    expect(completarPlantilla({})).toEqual(PLANTILLA_BOLETIN_INICIAL);
  });

  it('conserva lo que el colegio cambió y completa el resto', () => {
    const p = completarPlantilla({ titulo: 'Boletín', escudo: { posicion: 'CENTRO' }, asignaturas: { observacion: false } });
    expect(p.titulo).toBe('Boletín');
    expect(p.escudo).toMatchObject({ posicion: 'CENTRO', mostrar: true, tamano: 52, url: null });
    expect(p.asignaturas).toMatchObject({ observacion: false, nota: true });
    expect(p.subtitulo).toBe('');
  });

  it('respeta el orden, el título y la visibilidad de las secciones guardadas', () => {
    const p = completarPlantilla({ secciones: [{ clave: 'RECLAMACIONES', titulo: 'Reclamos', visible: true }, { clave: 'AREAS', visible: false }] });
    expect(p.secciones.find((s) => s.clave === 'RECLAMACIONES')).toEqual({ clave: 'RECLAMACIONES', titulo: 'Reclamos', visible: true });
    expect(p.secciones.find((s) => s.clave === 'AREAS')).toMatchObject({ visible: false });
    // Lo guardado mantiene su orden relativo: los reclamos siguen antes que las áreas.
    const claves = p.secciones.map((s) => s.clave);
    expect(claves.indexOf('RECLAMACIONES')).toBeLessThan(claves.indexOf('AREAS'));
    expect(claves).toHaveLength(10);
  });

  it('un diseño guardado antes de que existieran las secciones nuevas las recibe en su lugar natural, no al final', () => {
    const guardadoAntes = ['DATOS_ESTUDIANTE', 'AREAS', 'ESCALA', 'ENTREGA', 'RECLAMACIONES', 'FIRMAS'].map((clave) => ({ clave, titulo: 'x', visible: true }));
    const p = completarPlantilla({ secciones: guardadoAntes as never });
    expect(p.secciones.map((s) => s.clave)).toEqual(PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => s.clave));
    // Lo que ya estaba guardado conserva su título; lo nuevo trae el de partida.
    expect(p.secciones.find((s) => s.clave === 'AREAS')?.titulo).toBe('x');
    expect(p.secciones.find((s) => s.clave === 'DIFICULTADES')).toEqual(PLANTILLA_BOLETIN_INICIAL.secciones.find((s) => s.clave === 'DIFICULTADES'));
  });


  it('descarta secciones desconocidas o repetidas', () => {
    const p = completarPlantilla({ secciones: [{ clave: 'AREAS' }, { clave: 'AREAS', titulo: 'Otra' }, { clave: 'INVENTADA' as never }] });
    expect(p.secciones.filter((s) => s.clave === 'AREAS')).toHaveLength(1);
    expect(p.secciones).toHaveLength(10);
  });

  it('corrige el tamaño del escudo, un color inválido y el exceso de firmas', () => {
    const muchas = Array.from({ length: 7 }, (_, n) => ({ cargo: `C${n}`, nombre: '', usa_director_grupo: false }));
    const p = completarPlantilla({ escudo: { tamano: 900 }, color_acento: 'rojo', firmas: muchas });
    expect(p.escudo.tamano).toBe(120);
    expect(completarPlantilla({ escudo: { tamano: 2 } }).escudo.tamano).toBe(30);
    expect(p.color_acento).toBe('#2878EA');
    expect(p.firmas).toHaveLength(4);
    expect(completarPlantilla({ color_acento: '#112233' }).color_acento).toBe('#112233');
  });

  it('una lista de firmas vacía es válida: el colegio puede no querer firmas', () => {
    expect(completarPlantilla({ firmas: [] }).firmas).toEqual([]);
  });

  it('cada texto fijo es del colegio: se cambia uno y los demás conservan su valor de partida', () => {
    const p = completarPlantilla({ textos: { promedio_general: 'Nota final' } as never });
    expect(p.textos.promedio_general).toBe('Nota final');
    expect(p.textos.documento).toBe(PLANTILLA_BOLETIN_INICIAL.textos.documento);
    expect(Object.keys(p.textos)).toEqual(Object.keys(PLANTILLA_BOLETIN_INICIAL.textos));
  });

  it('acota los renglones de compromisos y las opciones de promoción', () => {
    expect(completarPlantilla({ compromisos_lineas: 99 }).compromisos_lineas).toBe(10);
    expect(completarPlantilla({ compromisos_lineas: 0 }).compromisos_lineas).toBe(1);
    const p = completarPlantilla({ promocion_opciones: ['A', ' ', 'B', 'C', 'D', 'E', 'F'] });
    expect(p.promocion_opciones).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('las secciones de la guía de boletines están en el diseño original', () => {
    const claves = PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => s.clave);
    for (const clave of ['DIFICULTADES', 'COMPROMISOS', 'PROMOCION', 'CALENDARIO', 'RECLAMACIONES', 'ESCALA']) expect(claves).toContain(clave);
    // El grado se imprime junto al grupo, como pide la guía (sección 4.5).
    expect(PLANTILLA_BOLETIN_INICIAL.estudiante.grado).toBe(true);
  });
});

describe('rellenarTexto', () => {
  it('reemplaza las marcas conocidas y deja las desconocidas a la vista', () => {
    expect(rellenarTexto('Puesto {puesto} de {total}', { puesto: 3, total: 30 })).toBe('Puesto 3 de 30');
    expect(rellenarTexto('Hola {nadie}', {})).toBe('Hola {nadie}');
    expect(rellenarTexto('Sin marcas', { a: 1 })).toBe('Sin marcas');
  });
});
