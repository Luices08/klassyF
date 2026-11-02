import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// Un usuario nuevo sin contraseña escrita entra con su número de documento; los que ya existían no se tocan.
describe('Contraseña inicial = documento (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let sedeId: string;
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
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const { default: Campus } = await import('../../src/models/campus.model');
    sedeId = String((await Campus.findOne({ es_principal: true }))!._id);
  }, 120_000);

  const como = (usuario: Escenario['admin'], ruta: string, cuerpo: unknown) =>
    fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(usuario)}` },
      body: JSON.stringify(cuerpo),
    });

  const iniciarSesion = (numero_documento: string, password: string, rol: string) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero_documento, password, rol }),
    });

  it('un docente creado sin contraseña entra con su documento y debe cambiarla', async () => {
    const creado = await como(e.admin, '/users', {
      tipo_documento: 'CC',
      numero_documento: '1098765432',
      nombre: 'Laura',
      apellido: 'Prueba',
      email: 'laura.prueba@colegio.edu.co',
      rol: 'DOCENTE',
      sedes_ids: [sedeId],
    });
    expect(creado.status).toBe(201);

    const sesion = await iniciarSesion('1098765432', '1098765432', 'DOCENTE');
    expect(sesion.status).toBe(200);
    expect(((await sesion.json()) as { user: { debe_cambiar_password: boolean } }).user.debe_cambiar_password).toBe(true);
  });

  it('con contraseña vacía en el formulario también usa el documento, y una escrita manda', async () => {
    const vacia = await como(e.admin, '/users', {
      tipo_documento: 'CC', numero_documento: '1098765433', nombre: 'Ana', apellido: 'Vacía',
      email: 'ana.vacia@colegio.edu.co', rol: 'DOCENTE', sedes_ids: [sedeId], password: '',
    });
    expect(vacia.status).toBe(201);
    expect((await iniciarSesion('1098765433', '1098765433', 'DOCENTE')).status).toBe(200);

    const propia = await como(e.admin, '/users', {
      tipo_documento: 'CC', numero_documento: '1098765434', nombre: 'Eva', apellido: 'Propia',
      email: 'eva.propia@colegio.edu.co', rol: 'DOCENTE', sedes_ids: [sedeId], password: 'ClaveEscrita9',
    });
    expect(propia.status).toBe(201);
    expect((await iniciarSesion('1098765434', '1098765434', 'DOCENTE')).status).toBe(401);
    expect((await iniciarSesion('1098765434', 'ClaveEscrita9', 'DOCENTE')).status).toBe(200);
  });

  it('un estudiante creado sin contraseña queda con su documento como clave', async () => {
    const creado = await como(e.admin, '/students', {
      tipo_documento: 'TI',
      numero_documento: '1200300400',
      primer_nombre: 'Mateo',
      primer_apellido: 'Nuevo',
      fecha_nacimiento: '2012-05-10',
    });
    expect(creado.status).toBe(201);

    const { default: User } = await import('../../src/models/user.model');
    const estudiante = await User.findOne({ numero_documento: '1200300400' }).select('+password_hash');
    expect(await estudiante!.comparePassword('1200300400')).toBe(true);
    expect(estudiante!.debe_cambiar_password).toBe(true);
  });

  it('no cambia la contraseña de quien ya existía: crear con su documento da 409', async () => {
    const repetido = await como(e.admin, '/users', {
      tipo_documento: 'CC', numero_documento: e.docenteDeClase.numero_documento, nombre: 'Otra', apellido: 'Vez',
      email: 'otra.vez@colegio.edu.co', rol: 'DOCENTE', sedes_ids: [sedeId],
    });
    expect(repetido.status).toBe(409);
  });
});
