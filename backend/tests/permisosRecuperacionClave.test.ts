import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { puedeAtenderSolicitudClave, rolesQueAtiendenA } from '../src/utils/permisosRecuperacionClave';

const sedeA = new Types.ObjectId();
const sedeB = new Types.ObjectId();

describe('puedeAtenderSolicitudClave', () => {
  it('la secretaría atiende estudiantes y acudientes de su sede', () => {
    const secretaria = { rol: 'SECRETARIA' as const, sedes_ids: [sedeA] };
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['ESTUDIANTE'], sedes_ids: [sedeA] })).toBe(true);
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['ACUDIENTE'], sedes_ids: [sedeA, sedeB] })).toBe(true);
  });

  it('la secretaría no atiende otra sede ni una solicitud sin sede conocida', () => {
    const secretaria = { rol: 'SECRETARIA' as const, sedes_ids: [sedeA] };
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['ESTUDIANTE'], sedes_ids: [sedeB] })).toBe(false);
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['ESTUDIANTE'], sedes_ids: [] })).toBe(false);
    expect(puedeAtenderSolicitudClave({ rol: 'SECRETARIA', sedes_ids: [] }, { roles: ['ESTUDIANTE'], sedes_ids: [sedeA] })).toBe(false);
  });

  it('la secretaría no atiende a docentes, a otra secretaría ni a una docente que además es acudiente', () => {
    const secretaria = { rol: 'SECRETARIA' as const, sedes_ids: [sedeA] };
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['DOCENTE'], sedes_ids: [sedeA] })).toBe(false);
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['SECRETARIA'], sedes_ids: [sedeA] })).toBe(false);
    expect(puedeAtenderSolicitudClave(secretaria, { roles: ['DOCENTE', 'ACUDIENTE'], sedes_ids: [sedeA] })).toBe(false);
  });

  it('coordinación atiende a docentes, secretaría, estudiantes y acudientes de cualquier sede, pero no a otro coordinador', () => {
    const coordinador = { rol: 'COORDINADOR' as const, sedes_ids: [] };
    for (const rol of ['DOCENTE', 'SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const) {
      expect(puedeAtenderSolicitudClave(coordinador, { roles: [rol], sedes_ids: [sedeB] })).toBe(true);
    }
    expect(puedeAtenderSolicitudClave(coordinador, { roles: ['ESTUDIANTE'], sedes_ids: [] })).toBe(true);
    expect(puedeAtenderSolicitudClave(coordinador, { roles: ['COORDINADOR'], sedes_ids: [] })).toBe(false);
    expect(puedeAtenderSolicitudClave(coordinador, { roles: ['ORIENTADOR'], sedes_ids: [sedeA] })).toBe(false);
  });

  it('el ADMIN atiende a cualquiera', () => {
    const admin = { rol: 'ADMIN' as const, sedes_ids: [] };
    for (const rol of ['COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE', 'ESTUDIANTE'] as const) {
      expect(puedeAtenderSolicitudClave(admin, { roles: [rol], sedes_ids: [] })).toBe(true);
    }
  });

  it('quien no es secretaría, coordinación ni ADMIN nunca atiende, aunque su rango alcance', () => {
    for (const rol of ['COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'] as const) {
      expect(puedeAtenderSolicitudClave({ rol, sedes_ids: [sedeA] }, { roles: ['ESTUDIANTE'], sedes_ids: [sedeA] })).toBe(false);
    }
  });
});

describe('rolesQueAtiendenA', () => {
  it('un estudiante con sede lo atienden secretaría, coordinación y ADMIN', () => {
    expect(rolesQueAtiendenA(['ESTUDIANTE'], true)).toEqual(['ADMIN', 'COORDINADOR', 'SECRETARIA']);
  });

  it('sin sede conocida la secretaría queda fuera del aviso', () => {
    expect(rolesQueAtiendenA(['ESTUDIANTE'], false)).toEqual(['ADMIN', 'COORDINADOR']);
  });

  it('a un docente lo atienden coordinación y ADMIN; a un coordinador, solo el ADMIN', () => {
    expect(rolesQueAtiendenA(['DOCENTE'], true)).toEqual(['ADMIN', 'COORDINADOR']);
    expect(rolesQueAtiendenA(['COORDINADOR'], true)).toEqual(['ADMIN']);
  });
});
