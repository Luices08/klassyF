import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AdmissionRequest from '../../src/models/admissionRequest.model';
import AuditLog from '../../src/models/auditLog.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import User, { UserDocument } from '../../src/models/user.model';
import { listarDocumentosPorRevisar } from '../../src/services/enrollment.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string } };

const PDF = { contenido: '%PDF-1.4 identidad del estudiante', nombre: 'identidad.pdf', mime: 'application/pdf' };

// M04: inscripción en el mostrador. Secretaría radica la misma solicitud que la familia radica por el sitio público, con el documento del acudiente y
// los documentos que trae ese día; al aprobarla, lo recibido pasa al checklist de la matrícula y no se vuelve a pedir.
describe('M04: inscripción asistida por secretaría (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let gradoId: string;
  let grupoId: string;
  let anioId: string;
  let contador = 0;

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
    anioId = String((await AcademicYear.findOne())!._id);
  }, 120_000);

  const leer = async (r: Response): Promise<Respuesta> => ({ estado: r.status, cuerpo: (await r.json()) as Respuesta['cuerpo'] });
  const conSesion = (usuario: UserDocument | null): Record<string, string> => (usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {});
  const personal = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown, prefijo = '/admission-requests'): Promise<Respuesta> =>
    leer(await fetch(`${base}${prefijo}${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...conSesion(usuario) }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
  const subir = async (id: string, tipo: string, usuario: UserDocument | null, archivo: { contenido: string | Buffer; nombre: string; mime: string } | null = PDF): Promise<Respuesta> => {
    const form = new FormData();
    if (archivo) form.append('file', new Blob([archivo.contenido], { type: archivo.mime }), archivo.nombre);
    return leer(await fetch(`${base}/admission-requests/${id}/documentos/${tipo}`, { method: 'POST', headers: conSesion(usuario), body: form }));
  };

  const datos = (extra: Record<string, unknown> = {}) => {
    contador += 1;
    return {
      nombre_aspirante: 'Laura',
      apellido_aspirante: `López${contador}`,
      tipo_documento: 'TI',
      numero_documento: `8000${contador}`,
      fecha_nacimiento: '2014-05-10',
      grado_deseado_id: gradoId,
      acudiente_nombre: 'Marta',
      acudiente_apellido: 'Morales',
      acudiente_telefono: `310000${contador}`,
      acudiente_email: `familia${contador}@correo.com`,
      acudiente_tipo_documento: 'CC',
      acudiente_numero_documento: `5200${contador}`,
      ...extra,
    };
  };
  const inscribir = async (extra: Record<string, unknown> = {}, usuario: UserDocument = e.secretaria) => personal('POST', '', usuario, datos(extra));
  const aprobar = (id: string) => personal('PATCH', `/${id}/aprobar`, e.secretaria, { group_id: grupoId, academic_year_id: anioId });

  describe('registrar la inscripción', () => {
    it('solo la registra el personal de matrículas: sin sesión 401; docente y estudiante 403', async () => {
      expect((await personal('POST', '', null, datos())).estado).toBe(401);
      expect((await personal('POST', '', e.docenteDeClase, datos())).estado).toBe(403);
      expect((await personal('POST', '', e.estudiante, datos())).estado).toBe(403);
      for (const usuario of [e.secretaria, e.coordAcademico, e.admin]) expect((await inscribir({}, usuario)).estado).toBe(201);
    });

    it('queda PENDIENTE como cualquier solicitud, con el documento del acudiente, marcada como del mostrador y sin cuenta, matrícula ni cupo', async () => {
      const usuarios = await User.countDocuments();
      const cuerpo = datos({ acudiente_parentesco: 'MADRE' });

      const r = await personal('POST', '', e.secretaria, cuerpo);

      expect(r.estado).toBe(201);
      expect(r.cuerpo.data).toMatchObject({ estado: 'PENDIENTE', origen: 'SECRETARIA', acudiente_tipo_documento: 'CC', acudiente_numero_documento: cuerpo.acudiente_numero_documento, acudiente_parentesco: 'MADRE', documentos: [] });
      expect(String((await AdmissionRequest.findById(r.cuerpo.data._id))!.registrada_por)).toBe(String(e.secretaria._id));
      expect(await User.countDocuments()).toBe(usuarios);
      expect((await Group.findById(grupoId))!.cupos_ocupados).toBe(0);
      expect(await AuditLog.countDocuments({ accion: 'INSCRIPCION_REGISTRADA' })).toBe(1);
    });

    it('exige el documento del acudiente (la solicitud pública no lo pide, secretaría sí) y valida lo demás', async () => {
      const { acudiente_numero_documento: _a, ...sinDocumento } = datos();
      expect((await personal('POST', '', e.secretaria, sinDocumento)).estado).toBe(400);
      expect((await inscribir({ acudiente_email: 'no-es-un-correo' })).estado).toBe(400);
      expect((await inscribir({ grado_deseado_id: '64b000000000000000000000' })).estado).toBe(400);
      expect((await inscribir({ acudiente_parentesco: 'PRIMO' })).estado).toBe(400);
    });

    it('no se inscribe dos veces a quien ya está en trámite, y una rechazada sí se puede reintentar', async () => {
      const primera = await inscribir();
      const repetida = await inscribir({ numero_documento: primera.cuerpo.data.numero_documento });
      expect(repetida.estado).toBe(409);
      expect(repetida.cuerpo.message).toMatch(/en trámite/i);

      await personal('PATCH', `/${primera.cuerpo.data._id}/rechazar`, e.secretaria, { motivo: 'Documentos ilegibles' });
      expect((await inscribir({ numero_documento: primera.cuerpo.data.numero_documento })).estado).toBe(201);
    });

    it('quien ya es persona registrada en el sistema no se inscribe de nuevo: se manda a «Matricular existente»', async () => {
      const r = await inscribir({ numero_documento: e.estudiante.numero_documento });
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/Matricular existente/);
      expect(await AdmissionRequest.countDocuments()).toBe(0);
    });

    it('aparece en la bandeja de admisiones junto a las que llegan por el sitio público', async () => {
      const r = await inscribir();
      const lista = await personal('GET', '', e.secretaria);
      expect(lista.cuerpo.data.map((s: { _id: string }) => s._id)).toContain(r.cuerpo.data._id);
    });
  });

  describe('los documentos que se reciben con la inscripción', () => {
    it('recibe el documento y lo cuenta, sin devolver nunca la ruta del archivo', async () => {
      const s = (await inscribir()).cuerpo.data;

      const r = await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);

      expect(r.estado).toBe(200);
      expect(r.cuerpo.data.documentos).toHaveLength(1);
      expect(r.cuerpo.data.documentos[0]).toMatchObject({ tipo_documento: 'DOCUMENTO_IDENTIDAD' });
      expect(JSON.stringify(r.cuerpo)).not.toMatch(/archivo_path|uploads/);
      const lista = await personal('GET', '', e.secretaria);
      expect(JSON.stringify(lista.cuerpo)).not.toMatch(/archivo_path|uploads/);
      expect(await AuditLog.countDocuments({ accion: 'SOLICITUD_DOCUMENTO_CARGADO' })).toBe(1);
    });

    it('solo se reciben los documentos que el catálogo pide a un aspirante nuevo de ese grado', async () => {
      const s = (await inscribir()).cuerpo.data;
      const identidadAcudiente = await subir(s._id, 'DOCUMENTO_ACUDIENTE', e.secretaria);
      expect(identidadAcudiente.estado).toBe(200);
      const noAplica = await subir(s._id, 'CARNE_VACUNAS', e.secretaria);
      expect(noAplica.estado).toBe(400);
      expect(noAplica.cuerpo.message).toMatch(/no se pide/i);
    });

    it('confirma por su contenido que sea un PDF o una imagen, y exige el archivo', async () => {
      const s = (await inscribir()).cuerpo.data;
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria, { contenido: 'texto plano', nombre: 'x.pdf', mime: 'application/pdf' })).estado).toBe(400);
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria, null)).estado).toBe(400);
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria, { contenido: 'MZ binario', nombre: 'x.exe', mime: 'application/x-msdownload' })).estado).toBe(400);
      expect((await AdmissionRequest.findById(s._id))!.documentos).toHaveLength(0);
    });

    it('volver a subir el mismo tipo lo reemplaza: queda un solo registro y el archivo anterior se borra del disco', async () => {
      const s = (await inscribir()).cuerpo.data;
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      const anterior = path.resolve(process.cwd(), (await AdmissionRequest.findById(s._id))!.documentos[0]!.archivo_path);
      expect(fs.existsSync(anterior)).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 5));
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria, { contenido: '%PDF-1.4 versión corregida', nombre: 'identidad2.pdf', mime: 'application/pdf' });

      const documentos = (await AdmissionRequest.findById(s._id))!.documentos;
      expect(documentos).toHaveLength(1);
      expect(fs.existsSync(path.resolve(process.cwd(), documentos[0]!.archivo_path))).toBe(true);
      expect(fs.existsSync(anterior)).toBe(false);
    });

    it('se baja con sesión del personal; sin sesión 401, docente 403, y un documento que no se recibió es 404', async () => {
      const s = (await inscribir()).cuerpo.data;
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      const ruta = `${base}/admission-requests/${s._id}/documentos/DOCUMENTO_IDENTIDAD/archivo`;

      const bajado = await fetch(ruta, { headers: conSesion(e.secretaria) });
      expect(bajado.status).toBe(200);
      expect(await bajado.text()).toBe(PDF.contenido);
      expect((await fetch(ruta)).status).toBe(401);
      expect((await fetch(ruta, { headers: conSesion(e.docenteDeClase) })).status).toBe(403);
      expect((await fetch(`${base}/admission-requests/${s._id}/documentos/FOTO/archivo`, { headers: conSesion(e.secretaria) })).status).toBe(404);
    });

    it('se puede quitar un documento recibido por error: desaparece el registro y el archivo', async () => {
      const s = (await inscribir()).cuerpo.data;
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      const archivo = path.resolve(process.cwd(), (await AdmissionRequest.findById(s._id))!.documentos[0]!.archivo_path);

      const r = await personal('DELETE', `/${s._id}/documentos/DOCUMENTO_IDENTIDAD`, e.secretaria);

      expect(r.estado).toBe(200);
      expect(r.cuerpo.data.documentos).toHaveLength(0);
      expect(fs.existsSync(archivo)).toBe(false);
      expect((await personal('DELETE', `/${s._id}/documentos/DOCUMENTO_IDENTIDAD`, e.secretaria)).estado).toBe(404);
    });

    it('solo mientras está en trámite: una aprobada o rechazada ya no recibe ni pierde documentos (los de una aprobada van a su matrícula)', async () => {
      const aprobada = (await inscribir()).cuerpo.data;
      await subir(aprobada._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      await aprobar(aprobada._id);
      expect((await subir(aprobada._id, 'DOCUMENTO_ACUDIENTE', e.secretaria)).estado).toBe(409);
      expect((await personal('DELETE', `/${aprobada._id}/documentos/DOCUMENTO_IDENTIDAD`, e.secretaria)).estado).toBe(409);

      const rechazada = (await inscribir()).cuerpo.data;
      await personal('PATCH', `/${rechazada._id}/rechazar`, e.secretaria, { motivo: 'No hay cupo' });
      expect((await subir(rechazada._id, 'DOCUMENTO_IDENTIDAD', e.secretaria)).estado).toBe(409);
    });

    it('solo el personal de matrículas los sube: sin sesión 401, docente y estudiante 403', async () => {
      const s = (await inscribir()).cuerpo.data;
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', null)).estado).toBe(401);
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.docenteDeClase)).estado).toBe(403);
      expect((await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.estudiante)).estado).toBe(403);
    });
  });

  describe('al aprobarla', () => {
    it('lo recibido pasa al checklist de la matrícula como CARGADO (por revisar) y lo demás sigue pendiente', async () => {
      const s = (await inscribir()).cuerpo.data;
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      await subir(s._id, 'DOCUMENTO_ACUDIENTE', e.secretaria);

      const aprobada = await aprobar(s._id);

      expect(aprobada.estado).toBe(200);
      const matricula = (await Enrollment.findById(aprobada.cuerpo.data.enrollment_id))!;
      const item = (tipo: string) => matricula.checklist.find((c) => c.tipo_documento === tipo)!;
      expect(item('DOCUMENTO_IDENTIDAD')).toMatchObject({ estado: 'CARGADO', cargado_por_tipo: 'PERSONAL' });
      expect(item('DOCUMENTO_IDENTIDAD').archivo_path).toBeTruthy();
      expect(item('DOCUMENTO_ACUDIENTE')).toMatchObject({ estado: 'CARGADO' });
      expect(item('FOTO')).toMatchObject({ estado: 'PENDIENTE', archivo_path: null });

      const porRevisar = await listarDocumentosPorRevisar({ academic_year_id: anioId });
      expect(porRevisar.data.map((f) => f.tipo_documento).sort()).toEqual(['DOCUMENTO_ACUDIENTE', 'DOCUMENTO_IDENTIDAD']);
      expect(porRevisar.data[0]).toMatchObject({ cargado_por_tipo: 'PERSONAL' });
    });

    it('el archivo recibido se puede ver desde la matrícula', async () => {
      const s = (await inscribir()).cuerpo.data;
      await subir(s._id, 'DOCUMENTO_IDENTIDAD', e.secretaria);
      const aprobada = await aprobar(s._id);

      const r = await fetch(`${base}/enrollments/${aprobada.cuerpo.data.enrollment_id}/checklist/DOCUMENTO_IDENTIDAD/archivo`, { headers: conSesion(e.secretaria) });

      expect(r.status).toBe(200);
      expect(await r.text()).toBe(PDF.contenido);
    });

    it('la ficha del acudiente usa su documento y su parentesco reales, no el teléfono provisional de la solicitud pública', async () => {
      const s = (await inscribir({ acudiente_numero_documento: '63500100', acudiente_tipo_documento: 'CE', acudiente_parentesco: 'MADRE' })).cuerpo.data;

      const aprobada = await aprobar(s._id);

      const acudiente = (await Guardian.findOne())!;
      expect(acudiente).toMatchObject({ numero_documento: '63500100', tipo_documento: 'CE' });
      expect(await StudentGuardian.findOne({ student_id: aprobada.cuerpo.data.student_user_id })).toMatchObject({ parentesco: 'MADRE', es_principal: true });
    });

    it('sin parentesco registrado queda como tutor legal, como siempre', async () => {
      const s = (await inscribir()).cuerpo.data;
      const aprobada = await aprobar(s._id);
      expect(await StudentGuardian.findOne({ student_id: aprobada.cuerpo.data.student_user_id })).toMatchObject({ parentesco: 'TUTOR_LEGAL' });
    });

    it('dos hermanos con el mismo acudiente (mismo documento) comparten una sola ficha', async () => {
      const uno = (await inscribir({ acudiente_numero_documento: '63500100', acudiente_telefono: '3105550001', acudiente_email: 'madre@correo.com' })).cuerpo.data;
      const dos = (await inscribir({ acudiente_numero_documento: '63500100', acudiente_telefono: '3105550002', acudiente_email: 'otra@correo.com' })).cuerpo.data;

      await aprobar(uno._id);
      await aprobar(dos._id);

      expect(await Guardian.countDocuments()).toBe(1);
      expect(await StudentGuardian.countDocuments()).toBe(2);
    });
  });

  describe('lo que el formulario necesita saber antes de elegir grupo', () => {
    it('los documentos que se piden a un aspirante nuevo se listan por grado, sin grupo', async () => {
      const r = await personal('GET', `/documentos-previstos?grade_id=${gradoId}&tipo_ingreso=NUEVO`, e.secretaria, undefined, '/enrollments');
      expect(r.estado).toBe(200);
      const claves = r.cuerpo.data.map((d: { tipo_documento: string }) => d.tipo_documento);
      expect(claves).toEqual(expect.arrayContaining(['DOCUMENTO_IDENTIDAD', 'DOCUMENTO_ACUDIENTE']));
      expect(claves).not.toContain('CARNE_VACUNAS');
    });
  });
});
