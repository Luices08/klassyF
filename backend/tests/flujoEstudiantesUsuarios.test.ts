import { describe, expect, it } from 'vitest';
import { ROLES, ROLES_STAFF } from '../src/constants/roles';
import { crearEstudianteCompleto } from '../src/validators/student.validator';

describe('Flujo Estudiantes y Acudientes - Roles Staff', () => {
  it('ROLES_STAFF excluye explícitamente a ESTUDIANTE y ACUDIENTE', () => {
    expect(ROLES_STAFF).not.toContain(ROLES.ESTUDIANTE);
    expect(ROLES_STAFF).not.toContain(ROLES.ACUDIENTE);
    expect(ROLES_STAFF).toContain(ROLES.ADMIN);
    expect(ROLES_STAFF).toContain(ROLES.DOCENTE);
    expect(ROLES_STAFF).toContain(ROLES.COORDINADOR);
    expect(ROLES_STAFF).toContain(ROLES.SECRETARIA);
    expect(ROLES_STAFF).toContain(ROLES.ORIENTADOR);
  });
});

describe('Validador crearEstudianteCompleto', () => {
  it('permite registrar estudiante sin email y sin password', () => {
    const payload = {
      tipo_documento: 'TI',
      numero_documento: '1098765432',
      nombre: 'Juanito',
      apellido: 'Pérez',
      fecha_nacimiento: '2012-05-15',
    };

    const { error, value } = crearEstudianteCompleto.body!.validate(payload);
    expect(error).toBeUndefined();
    expect(value.numero_documento).toBe('1098765432');
    expect(value.grupo_etnico).toBe('NINGUNO');
    expect(value.victima_conflicto).toBe(false);
  });

  it('permite registrar estudiante con datos completos de acudiente opcional', () => {
    const payload = {
      tipo_documento: 'TI',
      numero_documento: '1098765432',
      nombre: 'Juanito',
      apellido: 'Pérez',
      fecha_nacimiento: '2012-05-15',
      acudiente_tipo_documento: 'CC',
      acudiente_numero_documento: '52123456',
      acudiente_nombre: 'María',
      acudiente_apellido: 'González',
      acudiente_telefono_principal: '3001234567',
      acudiente_parentesco: 'MADRE',
    };

    const { error, value } = crearEstudianteCompleto.body!.validate(payload);
    expect(error).toBeUndefined();
    expect(value.acudiente_nombre).toBe('María');
    expect(value.acudiente_parentesco).toBe('MADRE');
  });

  it('falla si falta un campo requerido como apellido o fecha_nacimiento', () => {
    const payloadIncompleto = {
      tipo_documento: 'TI',
      numero_documento: '1098765432',
      nombre: 'Juanito',
    };

    const { error } = crearEstudianteCompleto.body!.validate(payloadIncompleto);
    expect(error).toBeDefined();
  });
});
