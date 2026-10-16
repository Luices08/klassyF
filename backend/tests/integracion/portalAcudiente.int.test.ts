import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import User, { UserDocument } from '../../src/models/user.model';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as portal from '../../src/services/portalAcudiente.service';
import { perfilesDisponibles } from '../../src/services/accesoPerfil.service';
import { actualizarTipo } from '../../src/services/tipoCertificado.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  process.env.CERT_HMAC_SECRET = 'secreto-de-certificados-de-pruebas';
});

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const imagen = (nombre: string, buffer: Buffer) => ({ buffer, size: buffer.length, mimetype: 'image/png', originalname: nombre }) as unknown as Express.Multer.File;

// M27: portal del acudiente. Lo que se prueba es lo que no se ve en una sola pieza: el vínculo con cada hijo, el perfil dual
// docente+acudiente, la subida de documentos hacia la bandeja de secretaría y el certificado de autoservicio sobre el motor del M26.
describe('M27: portal del acudiente (con base de datos)', () => {
  let e: Escenario;
  let acudiente: UserDocument;
  let ajeno: UserDocument;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await fs.rm(path.join(UPLOADS_ROOT, 'certificados'), { recursive: true, force: true });
    await detenerBaseDeDatos();
  });

  async function vincular(usuario: UserDocument, estudiante: UserDocument, documento: string) {
    const guardian = await Guardian.create({ tipo_documento: 'CC', numero_documento: documento, nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233', user_id: usuario._id });
    await StudentGuardian.create({ student_id: estudiante._id, guardian_id: guardian._id, parentesco: 'PADRE', es_principal: true });
    return guardian;
  }

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CertificadoEmitido.syncIndexes();
    e = await armarEscenario();
    // Una docente que además es madre: un solo registro con dos roles.
    acudiente = await crearUsuario('DOCENTE', { sedes_ids: [(await Campus.findOne({ es_principal: true }))!._id] });
    acudiente.roles = ['DOCENTE', 'ACUDIENTE'];
    await acudiente.save();
    acudiente.rol = 'ACUDIENTE';
    ajeno = await crearUsuario('ACUDIENTE');
    await vincular(acudiente, e.estudiante, '79111222');
    await vincular(ajeno, e.otroEstudiante, '79333444');
  });

  it('ofrece los dos perfiles de quien es docente y acudiente', async () => {
    expect(await perfilesDisponibles(acudiente)).toEqual(['DOCENTE', 'ACUDIENTE']);
  });

  it('el selector trae solo los hijos vinculados, con su matrícula', async () => {
    const hijos = await portal.listarHijos(acudiente);
    expect(hijos.map((h) => h.student_id)).toEqual([String(e.estudiante._id)]);
    expect(hijos[0]).toMatchObject({ parentesco: 'PADRE', matricula: { estado: 'MATRICULADO_DEFINITIVO', grado: 'Sexto', grupo: '601' } });
  });

  it('un estudiante que no es de la familia responde igual que uno que no existe (404)', async () => {
    await expect(portal.notasDelHijo(acudiente, String(e.otroEstudiante._id), 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(portal.inasistenciasDelHijo(acudiente, String(e.otroEstudiante._id))).rejects.toMatchObject({ statusCode: 404 });
    await expect(portal.convivenciaDelHijo(acudiente, String(e.otroEstudiante._id))).rejects.toMatchObject({ statusCode: 404 });
    await expect(portal.documentosDelHijo(acudiente, String(e.otroEstudiante._id))).rejects.toMatchObject({ statusCode: 404 });
    await expect(portal.certificadosDelHijo(acudiente, String(e.otroEstudiante._id))).rejects.toMatchObject({ statusCode: 404 });
    await expect(portal.notasDelHijo(acudiente, 'no-es-un-id', 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('un acudiente inactivo no consulta nada', async () => {
    await Guardian.updateMany({ user_id: acudiente._id }, { estado: 'inactivo' });
    await expect(portal.listarHijos(acudiente)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('las notas, las inasistencias y la convivencia salen del id del hijo elegido', async () => {
    const notas = await portal.notasDelHijo(acudiente, String(e.estudiante._id), 1);
    expect(notas.periodo.numero).toBe(1);
    const inasistencias = await portal.inasistenciasDelHijo(acudiente, String(e.estudiante._id));
    expect(inasistencias.resumen).toEqual({ total: 0, justificadas: 0, injustificadas: 0 });
    expect(await portal.convivenciaDelHijo(acudiente, String(e.estudiante._id), '10.0.0.1')).toEqual([]);
  });

  it('consultar la convivencia del hijo se audita a nombre del acudiente y sobre el estudiante', async () => {
    await portal.convivenciaDelHijo(acudiente, String(e.estudiante._id), '10.0.0.1');
    const registro = await AuditLog.findOne({ accion: 'CONVIVENCIA_OBSERVADOR_CONSULTADO_POR_ACUDIENTE' });
    expect(String(registro?.usuario_id)).toBe(String(acudiente._id));
    expect(String(registro?.entidad_id)).toBe(String(e.estudiante._id));
  });

  describe('documentos pendientes de la matrícula', () => {
    beforeEach(async () => {
      await Enrollment.updateOne({ student_id: e.estudiante._id }, { estado: 'MATRICULADO_CONDICIONAL', checklist: [{ tipo_documento: 'FOTO', obligatorio: true, estado: 'PENDIENTE' }, { tipo_documento: 'CARNE_EPS', obligatorio: true, estado: 'APROBADO' }] });
    });

    it('lista lo que falta y marca qué se puede subir', async () => {
      const docs = await portal.documentosDelHijo(acudiente, String(e.estudiante._id));
      expect(docs?.pendientes).toBe(1);
      expect(docs?.documentos.find((d) => d.tipo_documento === 'FOTO')).toMatchObject({ estado: 'PENDIENTE', puede_subir: true });
      expect(docs?.documentos.find((d) => d.tipo_documento === 'CARNE_EPS')).toMatchObject({ estado: 'APROBADO', puede_subir: false });
    });

    it('al subir un archivo queda CARGADO para que secretaría lo revise', async () => {
      const docs = await portal.subirDocumentoDelHijo(acudiente, String(e.estudiante._id), 'FOTO', { buffer: PDF, mimetype: 'application/pdf' });
      expect(docs?.documentos.find((d) => d.tipo_documento === 'FOTO')?.estado).toBe('CARGADO');
      const matricula = await Enrollment.findOne({ student_id: e.estudiante._id });
      expect(matricula?.checklist.find((c) => c.tipo_documento === 'FOTO')?.archivo_path).toBeTruthy();
      expect(await AuditLog.countDocuments({ accion: 'DOCUMENTO_CARGADO', usuario_id: acudiente._id })).toBe(1);
    });

    it('rechaza un archivo que no es lo que dice ser, un documento aprobado y una matrícula ya definitiva', async () => {
      await expect(portal.subirDocumentoDelHijo(acudiente, String(e.estudiante._id), 'FOTO', { buffer: Buffer.from('no soy un pdf'), mimetype: 'application/pdf' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(portal.subirDocumentoDelHijo(acudiente, String(e.estudiante._id), 'CARNE_EPS', { buffer: PDF, mimetype: 'application/pdf' })).rejects.toMatchObject({ statusCode: 409 });
      await Enrollment.updateOne({ student_id: e.estudiante._id }, { estado: 'MATRICULADO_DEFINITIVO' });
      await expect(portal.subirDocumentoDelHijo(acudiente, String(e.estudiante._id), 'FOTO', { buffer: PDF, mimetype: 'application/pdf' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('no sube documentos de un estudiante ajeno', async () => {
      await expect(portal.subirDocumentoDelHijo(acudiente, String(e.otroEstudiante._id), 'FOTO', { buffer: PDF, mimetype: 'application/pdf' })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('certificado de autoservicio', () => {
    beforeEach(async () => {
      const campus = (await Campus.findOne({ es_principal: true }))!;
      e.secretaria.sedes_ids = [campus._id];
      await e.secretaria.save();
      await configuracion.actualizarConfiguracion({ rectoria: { usuario_id: String(e.admin._id) }, secretaria: { usuario_id: String(e.secretaria._id) } }, e.admin);
      for (const elemento of ['rectoria', 'secretaria', 'sello'] as const) {
        const png = await QRCode.toBuffer(`imagen-${elemento}`, { margin: 1, width: 200 });
        await configuracion.guardarImagen(elemento, imagen(`${elemento}.png`, png), e.admin);
      }
    });

    const generar = (tipo = 'CONSTANCIA_ESTUDIO') => portal.generarCertificadoDelHijo(acudiente, String(e.estudiante._id), { tipo }, '10.0.0.1');

    it('mientras el ADMIN no lo active, el portal no ofrece ni genera nada', async () => {
      expect((await portal.certificadosDelHijo(acudiente, String(e.estudiante._id))).tipos).toEqual([]);
      await expect(generar()).rejects.toMatchObject({ statusCode: 403 });
    });

    it('solo el ADMIN decide qué documentos son de autoservicio, y no el paz y salvo', async () => {
      await expect(actualizarTipo('CONSTANCIA_ESTUDIO', { autoservicio_acudiente: true }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(actualizarTipo('PAZ_Y_SALVO', { autoservicio_acudiente: true }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('genera el PDF al instante con el acudiente como solicitante y deja el documento en el historial de secretaría', async () => {
      await actualizarTipo('CONSTANCIA_ESTUDIO', { autoservicio_acudiente: true }, e.admin);
      const ofrecidos = (await portal.certificadosDelHijo(acudiente, String(e.estudiante._id))).tipos;
      expect(ofrecidos.map((t) => t.clave)).toEqual(['CONSTANCIA_ESTUDIO']);
      expect(ofrecidos[0]).toMatchObject({ disponible: true, motivo: null });

      const creado = await generar();
      expect(creado.codigo).toMatch(/^CE-\d{4}-0001$/);
      const guardado = await CertificadoEmitido.findById(creado._id);
      expect(guardado?.solicitante).toMatchObject({ tipo: 'ACUDIENTE', numero_documento: '79111222' });
      expect(String(guardado?.emitido_por)).toBe(String(acudiente._id));

      const { buffer } = await portal.pdfDelCertificadoDelHijo(acudiente, String(e.estudiante._id), creado._id, 'http://localhost', '10.0.0.1');
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect((await portal.certificadosDelHijo(acudiente, String(e.estudiante._id))).emitidos).toHaveLength(1);
    });

    it('limita cuántos puede generar el acudiente por día', async () => {
      await actualizarTipo('CONSTANCIA_ESTUDIO', { autoservicio_acudiente: true }, e.admin);
      for (let i = 0; i < 3; i += 1) await generar();
      await expect(generar()).rejects.toMatchObject({ statusCode: 429 });
      const oferta = (await portal.certificadosDelHijo(acudiente, String(e.estudiante._id))).tipos[0];
      expect(oferta?.disponible).toBe(false);
    });

    it('no descarga el documento de otro estudiante aunque conozca su id', async () => {
      await actualizarTipo('CONSTANCIA_ESTUDIO', { autoservicio_acudiente: true }, e.admin);
      const ajenoDoc = await portal.generarCertificadoDelHijo(ajeno, String(e.otroEstudiante._id), { tipo: 'CONSTANCIA_ESTUDIO' });
      await expect(portal.pdfDelCertificadoDelHijo(acudiente, String(e.estudiante._id), ajenoDoc._id, 'http://localhost')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it('el modelo guarda un solo registro por documento aunque tenga dos roles', async () => {
    await expect(User.create({ ...acudiente.toObject(), _id: undefined, email: 'otro@colegio.test', password_hash: 'x'.repeat(20), roles: ['ACUDIENTE'] })).rejects.toBeDefined();
    expect(await User.countDocuments({ numero_documento: acudiente.numero_documento })).toBe(1);
  });
});
