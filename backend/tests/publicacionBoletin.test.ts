import { describe, expect, it } from 'vitest';
import { accesoFamilia, type PublicacionPlana } from '../src/utils/publicacionBoletin';

const publicacion = (publicado: boolean, ...excepciones: Array<[string, boolean]>): PublicacionPlana => ({
  publicado,
  excepciones: excepciones.map(([student_id, permitir]) => ({ student_id, permitir })),
});

describe('accesoFamilia', () => {
  it('sin publicación, o sin publicar, la familia no lo ve', () => {
    expect(accesoFamilia(null, 'e1')).toEqual({ visible: false, origen: 'SIN_PUBLICAR' });
    expect(accesoFamilia(publicacion(false), 'e1')).toEqual({ visible: false, origen: 'SIN_PUBLICAR' });
  });

  it('con el grupo publicado lo ve todo el grupo', () => {
    expect(accesoFamilia(publicacion(true), 'e1')).toEqual({ visible: true, origen: 'GRUPO' });
  });

  it('una excepción que bloquea manda sobre un grupo publicado', () => {
    const p = publicacion(true, ['e1', false]);
    expect(accesoFamilia(p, 'e1')).toEqual({ visible: false, origen: 'EXCEPCION' });
    expect(accesoFamilia(p, 'e2')).toEqual({ visible: true, origen: 'GRUPO' });
  });

  it('una excepción que permite deja ver a ese estudiante aunque el grupo no esté publicado', () => {
    const p = publicacion(false, ['e1', true]);
    expect(accesoFamilia(p, 'e1')).toEqual({ visible: true, origen: 'EXCEPCION' });
    expect(accesoFamilia(p, 'e2')).toEqual({ visible: false, origen: 'SIN_PUBLICAR' });
  });
});
