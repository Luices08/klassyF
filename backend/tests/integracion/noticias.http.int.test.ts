import type { AddressInfo } from 'net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Noticia from '../../src/models/noticia.model';
import Campus from '../../src/models/campus.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { PORTADA_PNG } from './portadaDePrueba';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string } };

// Noticias y eventos (módulo propio) contra la capa HTTP real: quién publica, con qué alcance, quién lee qué y las categorías y habilitaciones del colegio.
describe('Noticias y eventos (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let grupoId: string;
  let sedePrincipal: string;
  let sedeRural: string;
  let gradoId: string;
  let acudiente: UserDocument;
  let categoria: string;

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
    const grupo = (await Group.findOne())!;
    grupoId = String(grupo._id);
    gradoId = String(grupo.grade_id);
    sedePrincipal = String((await Campus.findOne({ es_principal: true }))!._id);
    sedeRural = String((await Campus.findOne({ es_principal: { $ne: true } }))!._id);
    // Un acudiente con cuenta de portal, vinculado al estudiante del grupo 601.
    acudiente = await crearUsuario('ACUDIENTE');
    const acudienteFicha = await Guardian.create({ tipo_documento: 'CC', numero_documento: '777', nombre: 'Marta', apellido: 'Morales', telefono_principal: '3000000000', user_id: acudiente._id });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: acudienteFicha._id, parentesco: 'MADRE', es_principal: true });
    categoria = (await pedir('GET', '/categorias', e.admin)).cuerpo.data.find((c: { nombre: string }) => c.nombre === 'Pastoral').id;
  }, 120_000);

  const pedir = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> => {
    const respuesta = await fetch(`${base}/noticias${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as Respuesta['cuerpo'] };
  };

  const publicar = (usuario: UserDocument, extra: Record<string, unknown> = {}) =>
    pedir('POST', '', usuario, { titulo: 'Día de la Virgen', descripcion: 'Eucaristía y acto cultural en el patio.', categoria_id: categoria, portada: PORTADA_PNG, ...extra });
  const mias = async (usuario: UserDocument): Promise<Array<{ id: string; titulo: string }>> => (await pedir('GET', '/mias', usuario)).cuerpo.data;
  const habilitar = (docente: UserDocument, alcance_maximo: string, categorias_ids: string[] = [], quien: UserDocument = e.coordAcademico) =>
    pedir('POST', '/habilitaciones', quien, { docente_id: String(docente._id), alcance_maximo, categorias_ids });

  describe('categorías del colegio', () => {
    it('se siembran la primera vez y cualquiera las lee; solo administración, coordinación y secretaría las gestionan', async () => {
      const lista = (await pedir('GET', '/categorias', e.estudiante)).cuerpo.data as Array<{ nombre: string }>;
      expect(lista.map((c) => c.nombre)).toEqual(expect.arrayContaining(['Académico', 'Cultural', 'Deportivo', 'Ambiental', 'Pastoral']));
      expect((await pedir('POST', '/categorias', e.docenteDeClase, { nombre: 'Feria' })).estado).toBe(403);
      expect((await pedir('POST', '/categorias', e.secretaria, { nombre: 'Feria de ciencias', tono: 'orange' })).estado).toBe(201);
      expect((await pedir('POST', '/categorias', e.admin, { nombre: 'feria de ciencias' })).estado).toBe(409);
    });

    it('una categoría usada se desactiva; una sin uso se elimina; y desactivada ya no se ofrece', async () => {
      expect((await publicar(e.admin)).estado).toBe(201);
      expect((await pedir('DELETE', `/categorias/${categoria}`, e.admin)).estado).toBe(409);
      expect((await pedir('PATCH', `/categorias/${categoria}`, e.admin, { estado: 'inactivo' })).estado).toBe(200);
      expect(((await pedir('GET', '/categorias', e.admin)).cuerpo.data as Array<{ id: string }>).some((c) => c.id === categoria)).toBe(false);
      expect(((await pedir('GET', '/categorias?todas=true', e.admin)).cuerpo.data as Array<{ id: string }>).some((c) => c.id === categoria)).toBe(true);
      expect((await publicar(e.admin)).estado).toBe(400);

      const nueva = (await pedir('POST', '/categorias', e.admin, { nombre: 'Temporal' })).cuerpo.data.id;
      expect((await pedir('DELETE', `/categorias/${nueva}`, e.admin)).estado).toBe(200);
    });
  });

  describe('quién publica', () => {
    it('administración y coordinación publican para toda la institución', async () => {
      expect((await publicar(e.admin)).estado).toBe(201);
      const r = await publicar(e.coordAcademico, { fijada: true });
      expect(r.estado).toBe(201);
      expect(r.cuerpo.data).toMatchObject({ alcance: 'INSTITUCION', fijada: true, categoria: { nombre: 'Pastoral' } });
    });

    it('estudiantes, acudientes, orientación y convivencia no publican', async () => {
      for (const u of [e.estudiante, acudiente, e.orientador, e.coordConvivencia]) expect((await publicar(u)).estado, u.rol).toBe(403);
      expect((await pedir('GET', '/permisos', e.estudiante)).cuerpo.data.puede_publicar).toBe(false);
    });

    it('un docente sin habilitación no publica y su pantalla no le ofrece el botón', async () => {
      const r = await publicar(e.docenteDeClase, { grupos_ids: [grupoId] });
      expect(r.estado).toBe(403);
      expect(r.cuerpo.message).toMatch(/No tienes permiso/);
      expect((await pedir('GET', '/permisos', e.docenteDeClase)).cuerpo.data).toMatchObject({ puede_publicar: false, puede_administrar: false });
    });

    it('un docente habilitado publica solo dentro de su alcance máximo y de sus grupos', async () => {
      expect((await habilitar(e.docenteDeClase, 'GRUPOS')).estado).toBe(201);
      expect((await pedir('GET', '/permisos', e.docenteDeClase)).cuerpo.data).toMatchObject({ puede_publicar: true, alcance_maximo: 'GRUPOS', categorias_ids: null });

      expect((await publicar(e.docenteDeClase, { grupos_ids: [grupoId] })).estado).toBe(201);
      const alInstitucion = await publicar(e.docenteDeClase);
      expect(alInstitucion.estado).toBe(403);
      expect(alInstitucion.cuerpo.message).toMatch(/hasta sus grupos/);

      // Un docente con la misma habilitación pero que no dicta en ese grupo no puede publicar para él.
      await habilitar(e.docenteAjeno, 'GRUPOS');
      const ajeno = await publicar(e.docenteAjeno, { grupos_ids: [grupoId] });
      expect(ajeno.estado).toBe(403);
      expect(ajeno.cuerpo.message).toMatch(/dictas clase o diriges/);
    });

    it('la habilitación puede limitarse a categorías, y un docente no fija noticias', async () => {
      const otra = (await pedir('GET', '/categorias', e.admin)).cuerpo.data.find((c: { nombre: string }) => c.nombre === 'Deportivo').id;
      await habilitar(e.docenteDeClase, 'INSTITUCION', [categoria]);
      expect((await publicar(e.docenteDeClase)).estado).toBe(201);
      const fuera = await publicar(e.docenteDeClase, { categoria_id: otra });
      expect(fuera.estado).toBe(403);
      expect(fuera.cuerpo.message).toMatch(/no cubre esa categoría/);
      expect((await publicar(e.docenteDeClase, { fijada: true })).estado).toBe(403);
    });

    it('secretaría publica solo para sus sedes', async () => {
      const sinSede = await publicar(e.secretaria);
      expect(sinSede.estado).toBe(403);
      expect(sinSede.cuerpo.message).toMatch(/al menos una sede/);

      e.secretaria.sedes_ids = [(await Campus.findById(sedePrincipal))!._id];
      await e.secretaria.save();
      expect((await publicar(e.secretaria, { sedes_ids: [sedePrincipal] })).estado).toBe(201);
      const ajena = await publicar(e.secretaria, { sedes_ids: [sedeRural] });
      expect(ajena.estado).toBe(403);
      expect(ajena.cuerpo.message).toMatch(/no es de las que tienes/);
      expect((await pedir('GET', '/permisos', e.secretaria)).cuerpo.data).toMatchObject({ puede_publicar: true, puede_administrar: true, puede_fijar: false });
    });
  });

  describe('habilitaciones', () => {
    it('administración, coordinación y secretaría las otorgan; no se repiten; se pueden editar y revocar', async () => {
      const r = await habilitar(e.docenteDeClase, 'SEDES', [categoria]);
      expect(r.estado).toBe(201);
      expect(r.cuerpo.data).toMatchObject({ alcance_maximo: 'SEDES', categorias: [{ nombre: 'Pastoral' }], docente: { _id: String(e.docenteDeClase._id) } });
      expect((await habilitar(e.docenteDeClase, 'GRADOS')).estado).toBe(409);
      expect((await habilitar(e.estudiante, 'GRUPOS')).estado).toBe(404);
      expect((await pedir('POST', '/habilitaciones', e.docenteDeClase, { docente_id: String(e.docenteAjeno._id), alcance_maximo: 'GRUPOS' })).estado).toBe(403);

      const editada = await pedir('PATCH', `/habilitaciones/${r.cuerpo.data.id}`, e.admin, { alcance_maximo: 'INSTITUCION', categorias_ids: [] });
      expect(editada.cuerpo.data).toMatchObject({ alcance_maximo: 'INSTITUCION', categorias: [] });
      expect(((await pedir('GET', '/habilitaciones', e.coordAcademico)).cuerpo.data as unknown[]).length).toBe(1);

      expect((await pedir('POST', `/habilitaciones/${r.cuerpo.data.id}/revocar`, e.admin)).estado).toBe(200);
      expect(((await pedir('GET', '/habilitaciones', e.coordAcademico)).cuerpo.data as unknown[]).length).toBe(0);
      // Revocada, se puede volver a otorgar.
      expect((await habilitar(e.docenteDeClase, 'GRUPOS')).estado).toBe(201);
    });

    it('secretaría solo habilita a docentes de sus sedes', async () => {
      expect((await habilitar(e.docenteDeClase, 'GRUPOS', [], e.secretaria)).estado).toBe(404);
      e.secretaria.sedes_ids = [(await Campus.findById(sedePrincipal))!._id];
      await e.secretaria.save();
      expect((await habilitar(e.docenteDeClase, 'GRUPOS', [], e.secretaria)).estado).toBe(201);
    });

    it('revocada, el docente ya no publica ni edita, pero sigue pudiendo archivar lo suyo y lo publicado se conserva', async () => {
      const h = (await habilitar(e.docenteDeClase, 'GRUPOS')).cuerpo.data.id;
      const noticia = (await publicar(e.docenteDeClase, { grupos_ids: [grupoId] })).cuerpo.data.id;
      await pedir('POST', `/habilitaciones/${h}/revocar`, e.admin);

      expect((await publicar(e.docenteDeClase, { grupos_ids: [grupoId] })).estado).toBe(403);
      expect((await pedir('PATCH', `/${noticia}`, e.docenteDeClase, { titulo: 'Otro título' })).estado).toBe(403);
      expect((await mias(e.estudiante)).map((n) => n.id)).toContain(noticia);
      expect((await pedir('POST', `/${noticia}/archivar`, e.docenteDeClase)).estado).toBe(200);
      expect((await mias(e.estudiante)).map((n) => n.id)).not.toContain(noticia);
    });
  });

  describe('quién lee qué', () => {
    it('una noticia de toda la institución le llega a docentes, estudiantes y acudientes, y no a quien no se nombró', async () => {
      const id = (await publicar(e.admin, { roles_destino: ['ESTUDIANTE', 'ACUDIENTE'] })).cuerpo.data.id;
      expect((await mias(e.estudiante)).map((n) => n.id)).toContain(id);
      expect((await mias(acudiente)).map((n) => n.id)).toContain(id);
      expect((await mias(e.docenteDeClase)).map((n) => n.id)).not.toContain(id);
      // Administración y coordinación ven todo; el personal por sede, lo de sus sedes aunque no se le nombre.
      expect((await mias(e.coordAcademico)).map((n) => n.id)).toContain(id);
      expect((await mias(e.orientador)).map((n) => n.id)).toContain(id);
    });

    it('por grupo llega a quien está en él (estudiante, acudiente de un estudiante del grupo y el docente que lo dicta) y a nadie más', async () => {
      const id = (await publicar(e.admin, { grupos_ids: [grupoId] })).cuerpo.data.id;
      for (const u of [e.estudiante, e.otroEstudiante, acudiente, e.docenteDeClase]) expect((await mias(u)).map((n) => n.id), u.rol).toContain(id);
      expect((await mias(e.docenteAjeno)).map((n) => n.id)).not.toContain(id);
      expect((await mias(e.tercerEstudiante)).map((n) => n.id)).toContain(id);
    });

    it('por grado y por sede', async () => {
      const porGrado = (await publicar(e.admin, { grados_ids: [gradoId] })).cuerpo.data.id;
      const sedeAjena = (await publicar(e.admin, { sedes_ids: [sedeRural] })).cuerpo.data.id;
      const sedePropia = (await publicar(e.admin, { sedes_ids: [sedePrincipal] })).cuerpo.data.id;
      const delEstudiante = (await mias(e.estudiante)).map((n) => n.id);
      expect(delEstudiante).toContain(porGrado);
      expect(delEstudiante).toContain(sedePropia);
      expect(delEstudiante).not.toContain(sedeAjena);
      // La orientadora de otra sede solo ve lo de la suya.
      const deOtraSede = (await mias(e.orientadorOtraSede)).map((n) => n.id);
      expect(deOtraSede).toContain(sedeAjena);
      expect(deOtraSede).not.toContain(sedePropia);
    });

    it('lo archivado, lo que aún no empieza y lo vencido no se ve; una noticia con evento vence al terminar ese día', async () => {
      const archivada = (await publicar(e.admin)).cuerpo.data.id;
      await pedir('POST', `/${archivada}/archivar`, e.admin);
      const futura = (await publicar(e.admin, { publicar_desde: new Date(Date.now() + 5 * 86_400_000).toISOString() })).cuerpo.data.id;
      const vencida = (await publicar(e.admin, { publicar_desde: new Date(Date.now() - 5 * 86_400_000).toISOString(), vence_el: new Date(Date.now() - 86_400_000).toISOString() })).cuerpo.data.id;
      const vigente = (await publicar(e.admin)).cuerpo.data.id;
      const visibles = (await mias(e.estudiante)).map((n) => n.id);
      expect(visibles).toContain(vigente);
      for (const oculta of [archivada, futura, vencida]) expect(visibles).not.toContain(oculta);

      const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const evento = await publicar(e.admin, { fecha_inicio: `${manana}T00:00:00.000Z`, hora: '09:30', lugar: 'Coliseo', afecta_clases: true });
      expect(evento.cuerpo.data).toMatchObject({ hora: '09:30', lugar: 'Coliseo', afecta_clases: true });
      const gestionada = (await pedir('GET', '/gestion', e.admin)).cuerpo.data.find((n: { id: string }) => n.id === evento.cuerpo.data.id);
      expect(new Date(gestionada.vence_el).getTime()).toBeGreaterThan(new Date(`${manana}T00:00:00.000Z`).getTime());
    });

    it('los eventos próximos salen antes que las noticias sin fecha, y lo fijado primero', async () => {
      const lejos = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const cerca = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const sinFecha = (await publicar(e.admin, { titulo: 'Sin fecha' })).cuerpo.data.id;
      const eventoLejano = (await publicar(e.admin, { titulo: 'Lejano', fecha_inicio: `${lejos}T00:00:00.000Z` })).cuerpo.data.id;
      const eventoCercano = (await publicar(e.admin, { titulo: 'Cercano', fecha_inicio: `${cerca}T00:00:00.000Z` })).cuerpo.data.id;
      const fijada = (await publicar(e.admin, { titulo: 'Fijada', fijada: true })).cuerpo.data.id;
      expect((await mias(e.estudiante)).map((n) => n.id)).toEqual([fijada, eventoCercano, eventoLejano, sinFecha]);
    });
  });

  describe('gestión de lo publicado', () => {
    it('administración y coordinación editan y archivan cualquiera; un docente, solo lo suyo; el resto ni la ve', async () => {
      await habilitar(e.docenteDeClase, 'INSTITUCION');
      await habilitar(e.docenteAjeno, 'INSTITUCION');
      const delDocente = (await publicar(e.docenteDeClase)).cuerpo.data.id;
      const delAdmin = (await publicar(e.admin)).cuerpo.data.id;

      expect((await pedir('PATCH', `/${delDocente}`, e.admin, { titulo: 'Corregido por rectoría' })).cuerpo.data.titulo).toBe('Corregido por rectoría');
      expect((await pedir('PATCH', `/${delAdmin}`, e.docenteDeClase, { titulo: 'No es mía' })).estado).toBe(404);
      expect((await pedir('PATCH', `/${delDocente}`, e.docenteAjeno, { titulo: 'No es mía' })).estado).toBe(404);
      expect((await pedir('POST', `/${delAdmin}/archivar`, e.docenteDeClase)).estado).toBe(404);

      const propias = (await pedir('GET', '/gestion', e.docenteDeClase)).cuerpo.data as Array<{ id: string; es_mia: boolean }>;
      expect(propias.map((n) => n.id)).toEqual([delDocente]);
      expect(propias[0]?.es_mia).toBe(true);
      expect(((await pedir('GET', '/gestion', e.admin)).cuerpo.data as unknown[]).length).toBe(2);
      expect((await pedir('GET', '/gestion', e.estudiante)).estado).toBe(403);

      expect((await pedir('POST', `/${delDocente}/archivar`, e.coordAcademico)).estado).toBe(200);
      expect((await pedir('PATCH', `/${delDocente}`, e.admin, { titulo: 'Ya archivada' })).estado).toBe(409);
    });

    it('rechaza fechas incoherentes, perfiles repetidos y alcances que no existen', async () => {
      expect((await publicar(e.admin, { fecha_inicio: '2026-11-10T00:00:00.000Z', fecha_fin: '2026-11-05T00:00:00.000Z' })).estado).toBe(400);
      expect((await publicar(e.admin, { roles_destino: ['ESTUDIANTE', 'ESTUDIANTE'] })).estado).toBe(400);
      expect((await publicar(e.admin, { roles_destino: ['ADMIN'] })).estado).toBe(400);
      expect((await publicar(e.admin, { hora: '25:00' })).estado).toBe(400);
      expect((await publicar(e.admin, { grupos_ids: [categoria] })).estado).toBe(400);
      expect((await publicar(e.admin, { titulo: 'x' })).estado).toBe(400);
      expect((await pedir('POST', '', null, {})).estado).toBe(401);
    });

  describe('portada obligatoria, cuerpo con formato y mosaico', () => {
    const detalle = (id: string, usuario: UserDocument | null) => pedir('GET', `/${id}`, usuario);

    it('toda noticia lleva fotografía: sin portada, o con algo que no es una imagen, no se publica', async () => {
      const sin = await pedir('POST', '', e.admin, { titulo: 'Feria de ciencias', descripcion: 'Proyectos en el coliseo.', categoria_id: categoria });
      expect(sin.estado).toBe(400);
      expect(sin.cuerpo.message).toMatch(/portada/i);
      // Dice ser PNG pero no lo es: el servidor mira la firma de bytes, no lo que declara el navegador.
      const falsa = await publicar(e.admin, { portada: 'data:image/png;base64,AAAAAAAAAAAAAAAA' });
      expect(falsa.estado).toBe(400);
      expect(falsa.cuerpo.message).toMatch(/PNG, JPG o WEBP/);
      expect((await publicar(e.admin, { portada: 'data:application/pdf;base64,AAAA' })).estado).toBe(400);
      expect(await Noticia.countDocuments()).toBe(0);
    });

    it('la portada se guarda junto con la noticia y se sirve con sesión', async () => {
      const r = await publicar(e.admin, { grupos_ids: [grupoId] });
      expect(r.estado).toBe(201);
      expect(r.cuerpo.data.imagen_version).toEqual(expect.any(Number));
      const id = r.cuerpo.data.id as string;
      const imagen = await fetch(`${base}/noticias/${id}/imagen`, { headers: { Authorization: `Bearer ${generateToken(e.estudiante)}` } });
      expect(imagen.status).toBe(200);
      expect(imagen.headers.get('content-type')).toBe('image/png');
    });

    it('guarda bajada, tamaño y punto de enfoque, y la descripción se deriva del cuerpo', async () => {
      const r = await publicar(e.admin, {
        descripcion: undefined,
        subtitulo: 'Todos los grados presentan sus proyectos',
        contenido_html: '<p class="letra-capital">Proyectos de <strong>ciencias</strong> en el coliseo.</p><blockquote>La ciencia es de todos</blockquote>',
        tamano_mosaico: 'PRINCIPAL',
        enfoque_x: 20,
        enfoque_y: 70,
      });
      expect(r.estado).toBe(201);
      expect(r.cuerpo.data).toMatchObject({
        subtitulo: 'Todos los grados presentan sus proyectos',
        tamano_mosaico: 'PRINCIPAL',
        enfoque_x: 20,
        enfoque_y: 70,
        descripcion: 'Proyectos de ciencias en el coliseo. La ciencia es de todos',
        autor: `${e.admin.nombre} ${e.admin.apellido}`,
      });
    });

    it('sin tamaño ni enfoque quedan los de partida (Estándar, centro)', async () => {
      const r = await publicar(e.admin);
      expect(r.cuerpo.data).toMatchObject({ tamano_mosaico: 'ESTANDAR', enfoque_x: 50, enfoque_y: 50, subtitulo: '' });
    });

    it('el servidor limpia el cuerpo: deja la letra capital y las citas, y quita scripts, estilos y cualquier otra clase', async () => {
      const id = (
        await publicar(e.admin, {
          grupos_ids: [grupoId],
          descripcion: undefined,
          contenido_html:
            '<p class="letra-capital otra" style="color:red" onclick="robar()">Hola</p><blockquote>cita</blockquote><script>alert(1)</script><img src="https://malo.example/x.png"><a href="javascript:alert(1)">clic</a>',
        })
      ).cuerpo.data.id as string;
      const html = (await detalle(id, e.estudiante)).cuerpo.data.contenido_html as string;
      expect(html).toContain('<p class="letra-capital">Hola</p>');
      expect(html).toContain('<blockquote>cita</blockquote>');
      for (const peligro of ['script', 'onclick', 'style', 'otra', 'malo.example', 'javascript:']) expect(html, peligro).not.toContain(peligro);
    });

    it('exige cuerpo (con formato o texto) y valida tamaño y enfoque', async () => {
      expect((await publicar(e.admin, { descripcion: undefined })).estado).toBe(400);
      expect((await publicar(e.admin, { descripcion: undefined, contenido_html: '<p>   </p>' })).estado).toBe(400);
      expect((await publicar(e.admin, { tamano_mosaico: 'GIGANTE' })).estado).toBe(400);
      expect((await publicar(e.admin, { enfoque_x: 101 })).estado).toBe(400);
      expect((await publicar(e.admin, { enfoque_y: -1 })).estado).toBe(400);
      expect((await publicar(e.admin, { subtitulo: 'x'.repeat(201) })).estado).toBe(400);
    });

    it('el detalle trae el cuerpo; los listados no', async () => {
      const id = (await publicar(e.admin, { grupos_ids: [grupoId], contenido_html: '<p>Cuerpo con <em>formato</em>.</p>', descripcion: undefined })).cuerpo.data.id as string;
      const d = (await detalle(id, e.estudiante)).cuerpo.data;
      expect(d.contenido_html).toBe('<p>Cuerpo con <em>formato</em>.</p>');
      expect(d.autor).toBe(`${e.admin.nombre} ${e.admin.apellido}`);
      const delListado = (await pedir('GET', '/mias', e.estudiante)).cuerpo.data[0];
      expect(delListado).not.toHaveProperty('contenido_html');
      expect(delListado.autor).toBe(`${e.admin.nombre} ${e.admin.apellido}`);
      expect((await pedir('GET', '/gestion', e.admin)).cuerpo.data[0]).not.toHaveProperty('contenido_html');
    });

    it('el detalle respeta quién puede ver la noticia: sin sesión 401, a quien no le toca 404, y lo programado solo lo ve quien gestiona', async () => {
      const deGrupo = (await publicar(e.admin, { grupos_ids: [grupoId] })).cuerpo.data.id as string;
      expect((await detalle(deGrupo, null)).estado).toBe(401);
      expect((await detalle(deGrupo, e.docenteAjeno)).estado).toBe(404);
      expect((await detalle(deGrupo, e.estudiante)).estado).toBe(200);
      expect((await detalle(deGrupo, acudiente)).estado).toBe(200);
      expect((await detalle(String(new Types.ObjectId()), e.admin)).estado).toBe(404);

      const programada = (await publicar(e.admin, { publicar_desde: new Date(Date.now() + 2 * 86_400_000).toISOString() })).cuerpo.data.id as string;
      expect((await detalle(programada, e.estudiante)).estado).toBe(404);
      expect((await detalle(programada, e.coordAcademico)).estado).toBe(200);

      await pedir('POST', `/${deGrupo}/archivar`, e.admin);
      expect((await detalle(deGrupo, e.estudiante)).estado).toBe(404);
      expect((await detalle(deGrupo, e.admin)).estado).toBe(200);
    });

    it('una noticia anterior sin portada pide una al editarla, pero se puede fijar sin ella', async () => {
      const anterior = await Noticia.create({
        titulo: 'Reunión de padres',
        descripcion: 'Cita general en el coliseo.',
        categoria_id: categoria,
        categoria_nombre: 'Pastoral',
        roles_destino: ['ACUDIENTE'],
        alcance: 'INSTITUCION',
        creada_por: e.admin._id,
      });
      const id = String(anterior._id);

      const sinPortada = await pedir('PATCH', `/${id}`, e.admin, { titulo: 'Reunión general de padres' });
      expect(sinPortada.estado).toBe(400);
      expect(sinPortada.cuerpo.message).toMatch(/portada/i);
      expect((await pedir('PATCH', `/${id}`, e.admin, { fijada: true })).estado).toBe(200);

      const conPortada = await pedir('PATCH', `/${id}`, e.admin, { titulo: 'Reunión general de padres', portada: PORTADA_PNG });
      expect(conPortada.estado).toBe(200);
      expect(conPortada.cuerpo.data.imagen_version).toEqual(expect.any(Number));
      // Lo anterior sigue leyéndose con su tamaño de partida.
      expect(conPortada.cuerpo.data.tamano_mosaico).toBe('ESTANDAR');
    });

    it('al editar se puede cambiar el cuerpo, el tamaño y el enfoque sin volver a subir la portada', async () => {
      const id = (await publicar(e.admin)).cuerpo.data.id as string;
      const r = await pedir('PATCH', `/${id}`, e.admin, { contenido_html: '<p>Nuevo cuerpo</p>', tamano_mosaico: 'BREVE', enfoque_x: 10, enfoque_y: 90 });
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ descripcion: 'Nuevo cuerpo', tamano_mosaico: 'BREVE', enfoque_x: 10, enfoque_y: 90, imagen_version: expect.any(Number) });
    });
  });

    it('lo que se publica, archiva y habilita queda en la auditoría', async () => {
      const id = (await publicar(e.admin)).cuerpo.data.id;
      await pedir('PATCH', `/${id}`, e.admin, { lugar: 'Capilla' });
      await pedir('POST', `/${id}/archivar`, e.admin);
      const h = (await habilitar(e.docenteDeClase, 'GRUPOS')).cuerpo.data.id;
      await pedir('POST', `/habilitaciones/${h}/revocar`, e.admin);
      for (const accion of ['NOTICIA_CREADA', 'NOTICIA_ACTUALIZADA', 'NOTICIA_ARCHIVADA', 'NOTICIA_HABILITACION_OTORGADA', 'NOTICIA_HABILITACION_REVOCADA']) {
        expect(await AuditLog.countDocuments({ accion }), accion).toBeGreaterThan(0);
      }
    });
  });
});
