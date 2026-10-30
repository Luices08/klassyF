import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// Un PNG de 1x1 píxel (firma de bytes real: el servidor no se fía del tipo que declara el navegador).
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Imágenes de la institución (capa HTTP)', () => {
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

  const subir = (clave: string, archivo: Buffer = PNG_1X1, tipo = 'image/png') => {
    const datos = new FormData();
    datos.append('file', new Blob([archivo], { type: tipo }), 'foto.png');
    return fetch(`${base}/institution/imagenes/${clave}`, { method: 'POST', headers: { Authorization: `Bearer ${generateToken(e.admin)}` }, body: datos });
  };

  it('la foto del login se guarda, aparece en la información pública y se sirve sin sesión', async () => {
    expect((await subir('login')).status).toBe(200);

    const info = (await (await fetch(`${base}/public/institution-info`)).json()) as { data: { imagen_login_version: number | null } };
    expect(info.data.imagen_login_version).toEqual(expect.any(Number));

    const imagen = await fetch(`${base}/public/institution-imagen/login?v=${info.data.imagen_login_version}`);
    expect(imagen.status).toBe(200);
    expect(imagen.headers.get('content-type')).toContain('image/png');
    // Con el frontend en otro origen (desarrollo), sin esto el navegador bloquea la foto aunque se haya guardado bien.
    expect(imagen.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('solo el administrador sube la foto y un archivo que no es imagen se rechaza', async () => {
    const datos = new FormData();
    datos.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'foto.png');
    const sinPermiso = await fetch(`${base}/institution/imagenes/login`, { method: 'POST', headers: { Authorization: `Bearer ${generateToken(e.docenteDeClase)}` }, body: datos });
    expect(sinPermiso.status).toBe(403);

    expect((await subir('login', Buffer.from('no soy una imagen, aunque lo diga el navegador'), 'image/png')).status).toBe(400);
  });
});
