import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { ROLES, puedeGestionarRoles } from '../src/constants/roles';
import User, { UserDocument } from '../src/models/user.model';
import { generarTokenSeleccionPerfil, generateToken, verificarTokenSeleccionPerfil, verifyToken } from '../src/services/token.service';
import { matriculaVigente } from '../src/utils/portalAcudiente';

// `config/env` exige JWT_SECRET al importarse (antes que cualquier beforeAll).
vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
});

function usuarioDe(roles: string[], extra: Record<string, unknown> = {}): UserDocument {
  return new User({
    tipo_documento: 'CC',
    numero_documento: '123456',
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ana@example.com',
    password_hash: 'x'.repeat(20),
    roles,
    sedes_ids: [new Types.ObjectId()],
    ...extra,
  });
}

describe('User.roles (varios perfiles en un solo registro)', () => {
  it('un docente puede ser también acudiente', () => {
    const u = usuarioDe([ROLES.DOCENTE, ROLES.ACUDIENTE]);
    expect(u.validateSync()?.errors.roles).toBeUndefined();
    expect(u.rol).toBe(ROLES.DOCENTE);
  });

  it('el perfil activo es el primero hasta que se elige otro, y se refleja en el JSON', () => {
    const u = usuarioDe([ROLES.DOCENTE, ROLES.ACUDIENTE]);
    u.rol = ROLES.ACUDIENTE;
    expect(u.rol).toBe(ROLES.ACUDIENTE);
    expect((u.toJSON() as { rol?: string }).rol).toBe(ROLES.ACUDIENTE);
    expect(u.toJSON().roles).toEqual([ROLES.DOCENTE, ROLES.ACUDIENTE]);
  });

  it('exige al menos un rol y no admite repetidos', () => {
    expect(usuarioDe([]).validateSync()?.errors.roles).toBeDefined();
    expect(usuarioDe([ROLES.DOCENTE, ROLES.DOCENTE]).validateSync()?.errors.roles).toBeDefined();
  });

  it('el estudiante no se combina con otros roles', () => {
    expect(usuarioDe([ROLES.ESTUDIANTE, ROLES.ACUDIENTE], { sedes_ids: [] }).validateSync()?.errors.roles).toBeDefined();
  });

  it('crear con `rol` (atajo) deja ese rol en `roles`', async () => {
    const u = new User({ rol: ROLES.ACUDIENTE });
    await u.validate().catch(() => undefined); // faltan otros campos: solo importa lo que dejó el hook
    expect(u.roles).toEqual([ROLES.ACUDIENTE]);
  });
});

describe('puedeGestionarRoles', () => {
  it('exige poder gestionar TODOS los roles de la persona', () => {
    expect(puedeGestionarRoles(ROLES.SECRETARIA, [ROLES.ACUDIENTE])).toBe(true);
    expect(puedeGestionarRoles(ROLES.SECRETARIA, [ROLES.DOCENTE, ROLES.ACUDIENTE])).toBe(false);
    expect(puedeGestionarRoles(ROLES.ADMIN, [ROLES.DOCENTE, ROLES.ACUDIENTE])).toBe(true);
    expect(puedeGestionarRoles(ROLES.COORDINADOR, [ROLES.DOCENTE, ROLES.ACUDIENTE])).toBe(true);
  });
});

describe('tokens de sesión y de selección de perfil', () => {
  it('la sesión lleva el perfil elegido', () => {
    const u = usuarioDe([ROLES.DOCENTE, ROLES.ACUDIENTE]);
    expect(verifyToken(generateToken(u)).rol).toBe(ROLES.DOCENTE);
    expect(verifyToken(generateToken(u, ROLES.ACUDIENTE)).rol).toBe(ROLES.ACUDIENTE);
  });

  it('el token de selección identifica a la persona y no sirve como sesión (no trae rol)', () => {
    const u = usuarioDe([ROLES.DOCENTE, ROLES.ACUDIENTE]);
    const token = generarTokenSeleccionPerfil(u);
    expect(verificarTokenSeleccionPerfil(token).sub).toBe(String(u._id));
    expect(verifyToken(token).rol).toBeUndefined();
  });

  it('un token de sesión no vale como token de selección', () => {
    const u = usuarioDe([ROLES.DOCENTE, ROLES.ACUDIENTE]);
    expect(() => verificarTokenSeleccionPerfil(generateToken(u))).toThrow(/inválido/);
  });

  it('un token vencido o adulterado se rechaza', () => {
    expect(() => verificarTokenSeleccionPerfil('basura')).toThrow(/expir/);
    const vencido = jwt.sign({ sub: 'x', proposito: 'seleccion_perfil', ver: 0 }, process.env.JWT_SECRET as string, { expiresIn: -10 });
    expect(() => verificarTokenSeleccionPerfil(vencido)).toThrow(/expir/);
  });
});

describe('matriculaVigente (portal del acudiente)', () => {
  it('prefiere la más reciente que no esté retirada ni anulada', () => {
    const lista = [{ estado: 'RETIRADO' as const, id: 1 }, { estado: 'MATRICULADO_DEFINITIVO' as const, id: 2 }, { estado: 'PREINSCRITO' as const, id: 3 }];
    expect(matriculaVigente(lista)?.id).toBe(2);
  });

  it('si todas están cerradas, usa la más reciente; sin matrículas, null', () => {
    expect(matriculaVigente([{ estado: 'ANULADO' as const, id: 1 }, { estado: 'RETIRADO' as const, id: 2 }])?.id).toBe(1);
    expect(matriculaVigente([])).toBeNull();
  });
});
