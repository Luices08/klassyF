import { describe, expect, it } from 'vitest';
import { situacionDeEstudiante } from '../src/utils/situacionEstudiante';

describe('situacionDeEstudiante', () => {
  const base = { tieneMatriculaViva: false, usuarioActivo: true };

  it('sin matrícula y activo (con o sin perfil) está disponible', () => {
    expect(situacionDeEstudiante(base)).toBe('DISPONIBLE');
    expect(situacionDeEstudiante({ ...base, estadoPerfil: 'ACTIVO' })).toBe('DISPONIBLE');
  });

  it('la matrícula viva manda sobre cualquier estado del expediente', () => {
    expect(situacionDeEstudiante({ ...base, tieneMatriculaViva: true, estadoPerfil: 'RETIRADO' })).toBe('MATRICULADO');
  });

  it('retirado o inactivo en M03 es reingreso', () => {
    expect(situacionDeEstudiante({ ...base, estadoPerfil: 'RETIRADO' })).toBe('REINGRESO');
    expect(situacionDeEstudiante({ ...base, estadoPerfil: 'INACTIVO' })).toBe('REINGRESO');
  });

  it('una matrícula retirada en el año es reingreso aunque el expediente siga ACTIVO (retiros anteriores al módulo de salidas)', () => {
    expect(situacionDeEstudiante({ ...base, estadoPerfil: 'ACTIVO', retiradoEnElAnio: true })).toBe('REINGRESO');
    expect(situacionDeEstudiante({ ...base, retiradoEnElAnio: true, tieneMatriculaViva: true })).toBe('MATRICULADO');
  });

  it('el graduado y el usuario inactivo no entran a disponibles ni a reingreso', () => {
    expect(situacionDeEstudiante({ ...base, estadoPerfil: 'GRADUADO' })).toBe('GRADUADO');
    expect(situacionDeEstudiante({ ...base, usuarioActivo: false, estadoPerfil: 'RETIRADO' })).toBe('USUARIO_INACTIVO');
  });
});
