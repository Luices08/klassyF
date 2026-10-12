import { describe, expect, it } from 'vitest';
import * as teacherAssignmentValidator from '../src/validators/teacherAssignment.validator';

describe('teacherAssignment validators para asignación en lote', () => {
  it('valida payload correcto de guardarCargaDocenteLote', () => {
    const validData = {
      docente_id: '507f1f77bcf86cd799439011',
      academic_year_id: '507f1f77bcf86cd799439012',
      direccion_grupo_id: '507f1f77bcf86cd799439013',
      horas_direccion: 2,
      clases: [
        {
          group_id: '507f1f77bcf86cd799439013',
          subject_id: '507f1f77bcf86cd799439014',
          observaciones: 'Matemáticas 6-A',
        },
        {
          group_id: '507f1f77bcf86cd799439015',
          subject_id: '507f1f77bcf86cd799439014',
        },
      ],
      proyectos: [
        {
          proyecto_nombre: 'PRAE Ambiental',
          horas_semanales: 2,
        },
      ],
    };

    const { error, value } = teacherAssignmentValidator.guardarCargaDocenteLote.body.validate(validData);
    expect(error).toBeUndefined();
    expect(value.clases).toHaveLength(2);
    expect(value.proyectos).toHaveLength(1);
    expect(value.horas_direccion).toBe(2);
  });

  it('permite guardarCargaDocenteLote sin dirección de grupo ni proyectos', () => {
    const validData = {
      docente_id: '507f1f77bcf86cd799439011',
      academic_year_id: '507f1f77bcf86cd799439012',
      clases: [
        {
          group_id: '507f1f77bcf86cd799439013',
          subject_id: '507f1f77bcf86cd799439014',
        },
      ],
    };

    const { error, value } = teacherAssignmentValidator.guardarCargaDocenteLote.body.validate(validData);
    expect(error).toBeUndefined();
    expect(value.clases).toHaveLength(1);
    expect(value.proyectos).toEqual([]);
    expect(value.horas_direccion).toBe(0);
  });

  it('rechaza guardarCargaDocenteLote con IDs inválidos', () => {
    const invalidData = {
      docente_id: 'invalid-id',
      academic_year_id: '507f1f77bcf86cd799439012',
      clases: [],
    };

    const { error } = teacherAssignmentValidator.guardarCargaDocenteLote.body.validate(invalidData);
    expect(error).toBeDefined();
  });

  it('valida payload correcto de guardarMallaGrupoLote', () => {
    const validData = {
      group_id: '507f1f77bcf86cd799439013',
      academic_year_id: '507f1f77bcf86cd799439012',
      director_grupo_id: '507f1f77bcf86cd799439011',
      horas_direccion: 1,
      asignaciones: [
        {
          subject_id: '507f1f77bcf86cd799439014',
          docente_id: '507f1f77bcf86cd799439011',
        },
        {
          subject_id: '507f1f77bcf86cd799439016',
          docente_id: null, // Desasignada
        },
      ],
    };

    const { error, value } = teacherAssignmentValidator.guardarMallaGrupoLote.body.validate(validData);
    expect(error).toBeUndefined();
    expect(value.asignaciones).toHaveLength(2);
    expect(value.director_grupo_id).toBe('507f1f77bcf86cd799439011');
  });

  it('rechaza guardarMallaGrupoLote sin array de asignaciones', () => {
    const invalidData = {
      group_id: '507f1f77bcf86cd799439013',
      academic_year_id: '507f1f77bcf86cd799439012',
    };

    const { error } = teacherAssignmentValidator.guardarMallaGrupoLote.body.validate(invalidData);
    expect(error).toBeDefined();
  });
});
