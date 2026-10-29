import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DOCUMENTOS_TERMINOS } from '../../src/constants/terminos';
import AceptacionTerminos from '../../src/models/aceptacionTerminos.model';
import AuditLog from '../../src/models/auditLog.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { crearUsuario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string } };

const version = (tipo: keyof typeof DOCUMENTOS_TERMINOS) => DOCUMENTOS_TERMINOS[tipo].version;

// Términos y condiciones: los textos son públicos y cada persona deja constancia, en el servidor, de lo que aceptó con su perfil.
describe('Términos y condiciones (capa HTTP)', () => {
  let base: string;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  }, 60_000);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
  }, 60_000);

  const pedir = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Navegador de pruebas', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Respuesta['cuerpo'] };
  };

  it('los cuatro documentos se leen sin sesión', async () => {
    const { estado, cuerpo } = await pedir('GET', '/public/terminos', null);
    expect(estado).toBe(200);
    expect((cuerpo.data as Array<{ tipo: string }>).map((d) => d.tipo).sort()).toEqual(['ADMINISTRATIVO', 'DOCENTE', 'ESTUDIANTE', 'GENERAL']);
  }, 60_000);

  it('sin sesión no se consultan pendientes ni se acepta nada', async () => {
    expect((await pedir('GET', '/terminos/pendientes', null)).estado).toBe(401);
    expect((await pedir('POST', '/terminos/aceptar', null, { terminos: [{ tipo: 'GENERAL', version: version('GENERAL') }] })).estado).toBe(401);
  }, 60_000);

  it('cada perfil tiene pendientes los generales y los suyos; el acudiente, los de estudiantes', async () => {
    const casos: Array<[UserDocument['rol'], string]> = [
      ['DOCENTE', 'DOCENTE'],
      ['ESTUDIANTE', 'ESTUDIANTE'],
      ['ACUDIENTE', 'ESTUDIANTE'],
      ['SECRETARIA', 'ADMINISTRATIVO'],
      ['ADMIN', 'ADMINISTRATIVO'],
    ];
    for (const [rol, tipo] of casos) {
      const usuario = await crearUsuario(rol);
      const pendientes = (await pedir('GET', '/terminos/pendientes', usuario)).cuerpo.data as Array<{ tipo: string }>;
      expect(pendientes.map((p) => p.tipo)).toEqual(['GENERAL', tipo]);
    }
  }, 60_000);

  it('aceptar deja una constancia por documento, con perfil, IP y navegador, y nada en el historial de acciones', async () => {
    const docente = await crearUsuario('DOCENTE');
    const terminos = [
      { tipo: 'GENERAL', version: version('GENERAL') },
      { tipo: 'DOCENTE', version: version('DOCENTE') },
    ];
    const respuesta = await pedir('POST', '/terminos/aceptar', docente, { terminos });
    expect(respuesta.estado).toBe(200);
    expect(respuesta.cuerpo.data).toEqual([]);
    expect((await pedir('GET', '/terminos/pendientes', docente)).cuerpo.data).toEqual([]);

    // Repetir no duplica la constancia.
    expect((await pedir('POST', '/terminos/aceptar', docente, { terminos })).estado).toBe(200);
    const constancias = await AceptacionTerminos.find({ usuario_id: docente._id }).lean();
    expect(constancias).toHaveLength(2);
    expect(constancias[0]).toMatchObject({ rol: 'DOCENTE', navegador: 'Navegador de pruebas' });
    expect(constancias[0].ip).toBeTruthy();
    expect(await AuditLog.countDocuments({ usuario_id: docente._id })).toBe(0);
  }, 60_000);

  it('no se aceptan los términos de otro perfil ni una versión que ya no es la vigente', async () => {
    const estudiante = await crearUsuario('ESTUDIANTE');
    expect((await pedir('POST', '/terminos/aceptar', estudiante, { terminos: [{ tipo: 'DOCENTE', version: version('DOCENTE') }] })).estado).toBe(400);
    expect((await pedir('POST', '/terminos/aceptar', estudiante, { terminos: [{ tipo: 'GENERAL', version: '0.1' }] })).estado).toBe(409);
    expect((await pedir('POST', '/terminos/aceptar', estudiante, { terminos: [{ tipo: 'OTRO', version: '1.0' }] })).estado).toBe(400);
    expect(await AceptacionTerminos.countDocuments()).toBe(0);
  }, 60_000);

  it('una persona con dos perfiles acepta los del segundo al entrar con él, sin repetir los generales', async () => {
    const docenteAcudiente = await crearUsuario('DOCENTE', { roles: ['DOCENTE', 'ACUDIENTE'] } as Partial<UserDocument>);
    await pedir('POST', '/terminos/aceptar', docenteAcudiente, {
      terminos: [
        { tipo: 'GENERAL', version: version('GENERAL') },
        { tipo: 'DOCENTE', version: version('DOCENTE') },
      ],
    });
    docenteAcudiente.rol = 'ACUDIENTE';
    expect((await pedir('GET', '/terminos/pendientes', docenteAcudiente)).cuerpo.data).toEqual([{ tipo: 'ESTUDIANTE', version: version('ESTUDIANTE') }]);
  }, 60_000);
});
