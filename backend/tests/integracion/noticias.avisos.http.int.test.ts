import type { AddressInfo } from 'net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import Insignia from '../../src/models/insignia.model';
import Noticia from '../../src/models/noticia.model';
import Notificacion from '../../src/models/notificacion.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import { procesarNoticiasPendientes } from '../../src/services/noticiaAvisos.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string } };

/** Un PNG mínimo: lo que importa para la firma son sus primeros 8 bytes; el resto es relleno. */
const png = (bytes = 64) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(bytes, 1)]);

// Avisos (campanita y punto del menú), publicación programada e imagen de las noticias, contra la capa HTTP real.
describe('Noticias: avisos, programación e imagen (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let grupoId: string;
  let categoria: string;
  let acudiente: UserDocument;

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
    grupoId = String((await Group.findOne())!._id);
    acudiente = await crearUsuario('ACUDIENTE');
    const ficha = await Guardian.create({ tipo_documento: 'CC', numero_documento: '777', nombre: 'Marta', apellido: 'Morales', telefono_principal: '3000000000', user_id: acudiente._id });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: ficha._id, parentesco: 'MADRE', es_principal: true });
    categoria = (await pedir('GET', '/categorias', e.admin)).cuerpo.data.find((c: { nombre: string }) => c.nombre === 'Cultural').id;
  }, 120_000);

  const encabezado = (u: UserDocument | null): Record<string, string> => (u ? { Authorization: `Bearer ${generateToken(u)}` } : {});

  const pedir = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> => {
    const respuesta = await fetch(`${base}/noticias${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...encabezado(usuario) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Respuesta['cuerpo'] };
  };

  const publicar = (usuario: UserDocument, extra: Record<string, unknown> = {}) =>
    pedir('POST', '', usuario, { titulo: 'Feria de ciencias', descripcion: 'Proyectos de todos los grados en el coliseo.', categoria_id: categoria, ...extra });

  const subir = async (id: string, usuario: UserDocument, archivo: Buffer, tipo = 'image/png', nombre = 'afiche.png'): Promise<Respuesta> => {
    const formulario = new FormData();
    formulario.append('file', new Blob([new Uint8Array(archivo)], { type: tipo }), nombre);
    const respuesta = await fetch(`${base}/noticias/${id}/imagen`, { method: 'POST', headers: encabezado(usuario), body: formulario });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Respuesta['cuerpo'] };
  };

  const imagen = (id: string, usuario: UserDocument) => fetch(`${base}/noticias/${id}/imagen`, { headers: encabezado(usuario) });

  const alertas = async (usuario: UserDocument) => Notificacion.find({ usuario_id: usuario._id, rol: usuario.rol, evento: 'NOTICIA_NUEVA' });
  const puntos = async (usuario: UserDocument) => Insignia.findOne({ usuario_id: usuario._id, rol: usuario.rol, ruta: '/noticias' });
  const lista = async (usuario: UserDocument) => (await fetch(`${base}/notificaciones`, { headers: encabezado(usuario) }).then((r) => r.json())) as { data: Array<{ evento: string; titulo: string; mensaje: string; contador: number; ruta: string }> };
  const pasado = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000);

  describe('avisos', () => {
    it('al publicar para la institución avisa a docentes, estudiantes y acudientes (campanita y punto del menú), no al autor ni al personal', async () => {
      expect((await publicar(e.admin)).estado).toBe(201);
      for (const u of [e.docenteDeClase, e.docenteAjeno, e.estudiante, e.otroEstudiante, acudiente]) {
        expect((await alertas(u)).length, u.rol).toBe(1);
        expect((await puntos(u))?.contador, u.rol).toBe(1);
      }
      for (const u of [e.admin, e.coordAcademico, e.secretaria, e.orientador]) {
        expect((await alertas(u)).length, u.rol).toBe(0);
        expect(await puntos(u), u.rol).toBeNull();
      }
    });

    it('la alerta lleva a /noticias y dice cuál es la noticia, con la categoría y la fecha', async () => {
      await publicar(e.admin, { fecha_inicio: '2026-11-12T00:00:00.000Z', hora: '08:00' });
      const { data } = await lista(e.estudiante);
      expect(data[0]).toMatchObject({ evento: 'NOTICIA_NUEVA', ruta: '/noticias', titulo: 'Nuevo: Cultural', contador: 1 });
      expect(data[0]?.mensaje).toBe('«Feria de ciencias» · 12 de noviembre, 08:00.');
    });

    it('las noticias nuevas se acumulan en una sola alerta, y el punto del menú suma', async () => {
      await publicar(e.admin, { titulo: 'Primera' });
      await publicar(e.admin, { titulo: 'Segunda' });
      await publicar(e.admin, { titulo: 'Tercera' });
      const alertasDelEstudiante = await alertas(e.estudiante);
      expect(alertasDelEstudiante).toHaveLength(1);
      expect(alertasDelEstudiante[0]?.contador).toBe(3);
      expect((await puntos(e.estudiante))?.contador).toBe(3);
      const { data } = await lista(e.estudiante);
      expect(data[0]?.mensaje).toBe('Hay 3 noticias y eventos nuevos. El último: «Tercera».');
    });

    it('una noticia por grupo avisa solo a quien está en el grupo: estudiantes, sus acudientes y los docentes que lo dictan', async () => {
      await publicar(e.admin, { grupos_ids: [grupoId] });
      for (const u of [e.estudiante, e.otroEstudiante, acudiente, e.docenteDeClase]) expect((await alertas(u)).length, u.rol).toBe(1);
      expect((await alertas(e.docenteAjeno)).length).toBe(0);
    });

    it('solo avisa a los perfiles a los que se dirige', async () => {
      await publicar(e.admin, { roles_destino: ['ESTUDIANTE'] });
      expect((await alertas(e.estudiante)).length).toBe(1);
      expect((await alertas(acudiente)).length).toBe(0);
      expect((await alertas(e.docenteDeClase)).length).toBe(0);
    });

    it('el docente habilitado que publica no se avisa a sí mismo, pero sí a los demás', async () => {
      await pedir('POST', '/habilitaciones', e.admin, { docente_id: String(e.docenteDeClase._id), alcance_maximo: 'GRUPOS' });
      await publicar(e.docenteDeClase, { grupos_ids: [grupoId] });
      expect((await alertas(e.docenteDeClase)).length).toBe(0);
      expect((await alertas(e.estudiante)).length).toBe(1);
    });
  });

  describe('publicación programada', () => {
    it('una noticia programada no se ve ni avisa hasta que le llega la hora; entonces aparece y avisa una sola vez', async () => {
      const r = await publicar(e.admin, { publicar_desde: futuro(2).toISOString() });
      expect(r.estado).toBe(201);
      const id = r.cuerpo.data.id as string;
      expect(r.cuerpo.data.programada).toBe(true);

      expect((await alertas(e.estudiante)).length).toBe(0);
      expect(((await pedir('GET', '/mias', e.estudiante)).cuerpo.data as unknown[]).length).toBe(0);
      // Quien la publicó sí la ve entre sus publicaciones, marcada como programada.
      expect(((await pedir('GET', '/gestion', e.admin)).cuerpo.data as Array<{ id: string; programada: boolean }>).find((n) => n.id === id)?.programada).toBe(true);
      expect(await procesarNoticiasPendientes()).toBe(0);

      // Le llega la hora (se mueve la fecha directamente: el planificador es quien reacciona al reloj).
      await Noticia.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { publicar_desde: pasado(0.01) } });
      expect(await procesarNoticiasPendientes()).toBe(1);
      expect((await alertas(e.estudiante)).length).toBe(1);
      expect((await puntos(e.estudiante))?.contador).toBe(1);
      expect(((await pedir('GET', '/mias', e.estudiante)).cuerpo.data as unknown[]).length).toBe(1);

      // Revisar otra vez no la vuelve a avisar.
      expect(await procesarNoticiasPendientes()).toBe(0);
      expect((await alertas(e.estudiante))[0]?.contador).toBe(1);
    });

    it('si se adelanta la hora de una programada, sale y avisa al guardar', async () => {
      const id = (await publicar(e.admin, { publicar_desde: futuro(3).toISOString() })).cuerpo.data.id as string;
      expect((await alertas(e.estudiante)).length).toBe(0);
      const r = await pedir('PATCH', `/${id}`, e.admin, { publicar_desde: new Date().toISOString() });
      expect(r.cuerpo.data.programada).toBe(false);
      expect((await alertas(e.estudiante)).length).toBe(1);
    });

    it('una programada archivada antes de su hora nunca avisa', async () => {
      const id = (await publicar(e.admin, { publicar_desde: futuro(1).toISOString() })).cuerpo.data.id as string;
      await pedir('POST', `/${id}/archivar`, e.admin);
      await Noticia.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { publicar_desde: pasado(0.01) } });
      expect(await procesarNoticiasPendientes()).toBe(0);
      expect((await alertas(e.estudiante)).length).toBe(0);
    });

    it('rechaza que venza antes de publicarse', async () => {
      const r = await publicar(e.admin, { publicar_desde: futuro(5).toISOString(), vence_el: futuro(2).toISOString() });
      expect(r.estado).toBe(400);
    });

    it('un docente habilitado también puede programar, y se avisa a su hora', async () => {
      await pedir('POST', '/habilitaciones', e.admin, { docente_id: String(e.docenteDeClase._id), alcance_maximo: 'GRUPOS' });
      const id = (await publicar(e.docenteDeClase, { grupos_ids: [grupoId], publicar_desde: futuro(1).toISOString() })).cuerpo.data.id as string;
      expect((await alertas(e.estudiante)).length).toBe(0);
      await Noticia.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { publicar_desde: pasado(0.01) } });
      await procesarNoticiasPendientes();
      expect((await alertas(e.estudiante)).length).toBe(1);
    });
  });

  describe('imagen', () => {
    it('administración sube una imagen; la ven los destinatarios con sesión y la versión cambia al reemplazarla', async () => {
      const id = (await publicar(e.admin, { grupos_ids: [grupoId] })).cuerpo.data.id as string;
      const primera = await subir(id, e.admin, png());
      expect(primera.estado).toBe(200);
      expect(primera.cuerpo.data.imagen_version).toEqual(expect.any(Number));

      const vista = await imagen(id, e.estudiante);
      expect(vista.status).toBe(200);
      expect(vista.headers.get('content-type')).toBe('image/png');
      expect(vista.headers.get('cache-control')).toMatch(/private/);
      expect(Buffer.from(await vista.arrayBuffer()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect((await imagen(id, acudiente)).status).toBe(200);

      const segunda = await subir(id, e.admin, png(128));
      expect(segunda.cuerpo.data.imagen_version).toBeGreaterThanOrEqual(primera.cuerpo.data.imagen_version);
      expect(((await pedir('GET', '/mias', e.estudiante)).cuerpo.data as Array<{ imagen_version: number | null }>)[0]?.imagen_version).toBe(segunda.cuerpo.data.imagen_version);
    });

    it('nunca es pública: sin sesión 401, y quien no ve la noticia recibe 404', async () => {
      const id = (await publicar(e.admin, { grupos_ids: [grupoId] })).cuerpo.data.id as string;
      await subir(id, e.admin, png());
      expect((await fetch(`${base}/noticias/${id}/imagen`)).status).toBe(401);
      expect((await imagen(id, e.docenteAjeno)).status).toBe(404);
      expect((await imagen(id, e.tercerEstudiante)).status).toBe(200);
      expect((await imagen(String(new Types.ObjectId()), e.admin)).status).toBe(404);
    });

    it('una noticia programada aún no la ve nadie fuera de quien gestiona', async () => {
      const id = (await publicar(e.admin, { publicar_desde: futuro(2).toISOString() })).cuerpo.data.id as string;
      await subir(id, e.admin, png());
      expect((await imagen(id, e.estudiante)).status).toBe(404);
      expect((await imagen(id, e.coordAcademico)).status).toBe(200);
    });

    it('rechaza lo que no es una imagen verdadera, lo que pesa de más y un formato no admitido', async () => {
      const id = (await publicar(e.admin)).cuerpo.data.id as string;
      const falsa = await subir(id, e.admin, Buffer.from('esto no es un png, solo lo dice el navegador'));
      expect(falsa.estado).toBe(400);
      expect(falsa.cuerpo.message).toMatch(/PNG, JPG o WEBP válido/);
      expect((await subir(id, e.admin, png(), 'application/pdf', 'afiche.pdf')).estado).toBe(400);
      const grande = await subir(id, e.admin, png(3 * 1024 * 1024));
      expect(grande.estado).toBe(400);
      expect(((await pedir('GET', '/gestion', e.admin)).cuerpo.data as Array<{ imagen_version: number | null }>)[0]?.imagen_version).toBeNull();
    });

    it('se puede quitar; quitada ya no se sirve', async () => {
      const id = (await publicar(e.admin)).cuerpo.data.id as string;
      await subir(id, e.admin, png());
      const r = await pedir('DELETE', `/${id}/imagen`, e.admin);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data.imagen_version).toBeNull();
      expect((await imagen(id, e.admin)).status).toBe(404);
    });

    it('un docente habilitado cambia la imagen de lo suyo; al revocarle el permiso ya no, ni la de otro, ni una archivada', async () => {
      const h = (await pedir('POST', '/habilitaciones', e.admin, { docente_id: String(e.docenteDeClase._id), alcance_maximo: 'GRUPOS' })).cuerpo.data.id as string;
      const suya = (await publicar(e.docenteDeClase, { grupos_ids: [grupoId] })).cuerpo.data.id as string;
      const deAdmin = (await publicar(e.admin)).cuerpo.data.id as string;

      expect((await subir(suya, e.docenteDeClase, png())).estado).toBe(200);
      expect((await subir(deAdmin, e.docenteDeClase, png())).estado).toBe(404);

      await pedir('POST', `/habilitaciones/${h}/revocar`, e.admin);
      expect((await subir(suya, e.docenteDeClase, png())).estado).toBe(403);
      expect((await pedir('DELETE', `/${suya}/imagen`, e.docenteDeClase)).estado).toBe(403);

      await pedir('POST', `/${deAdmin}/archivar`, e.admin);
      expect((await subir(deAdmin, e.admin, png())).estado).toBe(409);
    });

    it('subir, reemplazar y quitar quedan en la auditoría', async () => {
      const id = (await publicar(e.admin)).cuerpo.data.id as string;
      await subir(id, e.admin, png());
      await pedir('DELETE', `/${id}/imagen`, e.admin);
      expect(await AuditLog.countDocuments({ accion: 'NOTICIA_IMAGEN_ACTUALIZADA' })).toBe(1);
      expect(await AuditLog.countDocuments({ accion: 'NOTICIA_IMAGEN_QUITADA' })).toBe(1);
    });
  });
});
