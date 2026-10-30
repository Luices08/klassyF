import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TAMANOS_MOSAICO } from '../../src/constants/noticias';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// El estudiante ve su propio grado y grupo en el inicio: solo lee, solo lo suyo y solo él.
describe('GET /enrollments/mia (capa HTTP)', () => {
  let e: Escenario;
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
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
  }, 120_000);

  const pedir = (usuario: Escenario['estudiante']) => fetch(`${base}/enrollments/mia`, { headers: { Authorization: `Bearer ${generateToken(usuario)}` } });

  it('el estudiante recibe el grado y el grupo de su matrícula vigente', async () => {
    const respuesta = await pedir(e.estudiante);
    expect(respuesta.status).toBe(200);
    const { data } = (await respuesta.json()) as { data: { grupo: string; grado: string; estado: string } };
    expect(data).toMatchObject({ grupo: '601', estado: 'MATRICULADO_DEFINITIVO' });
    expect(data.grado).toEqual(expect.any(String));
  });

  it('un estudiante sin matrícula recibe null, y los demás roles no entran', async () => {
    const { default: User } = await import('../../src/models/user.model');
    const { default: Enrollment } = await import('../../src/models/enrollment.model');
    await Enrollment.collection.deleteMany({ student_id: e.estudiante._id });
    expect(((await (await pedir(e.estudiante)).json()) as { data: unknown }).data).toBeNull();
    expect(await User.exists({ _id: e.estudiante._id })).toBeTruthy();

    for (const otro of [e.admin, e.docenteDeClase, e.secretaria]) expect((await pedir(otro)).status).toBe(403);
  });
});

describe('Tamaños del mosaico de noticias', () => {
  it('incluye la banda de ancho completo', () => {
    expect(TAMANOS_MOSAICO).toContain('BANDA');
  });
});
