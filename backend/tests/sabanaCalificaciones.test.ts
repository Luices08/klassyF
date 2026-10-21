import { describe, expect, it } from 'vitest';
import { EstudianteSabanaEntrada, armarSabana } from '../src/utils/sabanaCalificaciones';

const asignaturas = [
  { subject_id: 'mat', nombre: 'Matemáticas', abreviatura: 'MAT' },
  { subject_id: 'len', nombre: 'Lenguaje', abreviatura: 'LEN' },
];

const estudiante = (id: string, apellidos: string, nombres: string, mat: number | null, len: number | null, promedio: number | null): EstudianteSabanaEntrada => ({
  student_id: id,
  numero_documento: id,
  nombres,
  apellidos,
  notas: { mat: { nota: mat, exenta: false, recuperada: false }, len: { nota: len, exenta: false, recuperada: false } },
  promedio,
  fallas: 0,
  promocion: null,
});

const base = { asignaturas, notaAprobatoria: 3, decimales: 2, mostrarPuesto: true };

describe('armarSabana', () => {
  it('ordena alfabéticamente por apellidos y luego nombres', () => {
    const s = armarSabana({ ...base, estudiantes: [estudiante('3', 'Zapata', 'Ana', 4, 4, 4), estudiante('1', 'Álvarez', 'Luis', 4, 4, 4), estudiante('2', 'Álvarez', 'Beatriz', 4, 4, 4)] });
    expect(s.filas.map((f) => f.student_id)).toEqual(['2', '1', '3']);
  });

  it('cuenta reprobadas y no cuenta una exenta como perdida', () => {
    const e = estudiante('1', 'A', 'A', 2.5, 4, 3.25);
    e.notas.len = { nota: null, exenta: true, recuperada: false };
    const s = armarSabana({ ...base, estudiantes: [e] });
    expect(s.filas[0].reprobadas).toBe(1);
    expect(s.filas[0].sin_nota).toBe(0);
  });

  it('el puesto lo comparten los empatados y el siguiente salta; sin todas las notas no hay puesto', () => {
    const s = armarSabana({
      ...base,
      estudiantes: [estudiante('1', 'A', 'a', 5, 5, 5), estudiante('2', 'B', 'b', 5, 5, 5), estudiante('3', 'C', 'c', 4, 4, 4), estudiante('4', 'D', 'd', 5, null, null)],
    });
    expect(s.filas.map((f) => f.puesto)).toEqual([1, 1, 3, null]);
  });

  it('no calcula puesto si el colegio no lo muestra', () => {
    const s = armarSabana({ ...base, mostrarPuesto: false, estudiantes: [estudiante('1', 'A', 'a', 5, 5, 5)] });
    expect(s.filas[0].puesto).toBeNull();
  });

  it('el resumen por asignatura promedia solo lo calificado y separa aprobaron, reprobaron y sin nota', () => {
    const s = armarSabana({ ...base, estudiantes: [estudiante('1', 'A', 'a', 5, 2, 3.5), estudiante('2', 'B', 'b', 3, null, null), estudiante('3', 'C', 'c', 2, 4, 3)] });
    expect(s.resumen[0]).toMatchObject({ subject_id: 'mat', promedio: 3.33, aprobaron: 2, reprobaron: 1, sin_nota: 0 });
    expect(s.resumen[1]).toMatchObject({ subject_id: 'len', promedio: 3, aprobaron: 1, reprobaron: 1, sin_nota: 1 });
  });
});
