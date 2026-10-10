import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import Guardian from '../../src/models/guardian.model';
import Institution from '../../src/models/institution.model';
import PlantillaCertificado from '../../src/models/plantillaCertificado.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import StudentProfile from '../../src/models/studentProfile.model';
import TipoCertificado from '../../src/models/tipoCertificado.model';
import * as certificados from '../../src/services/certificado.service';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as verificacion from '../../src/services/certificadoVerificacion.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// `config/env` lee las variables al importarse: se fijan antes que cualquier import.
vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  process.env.CERT_HMAC_SECRET = 'secreto-de-certificados-de-pruebas';
});

const imagen = (nombre: string) => ({ buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png', originalname: nombre }) as unknown as Express.Multer.File;

describe('M26: ficha del estudiante, solicitante, EPS y vigencia (con base de datos)', () => {
  let e: Escenario;
  let matriculaId: string;
  let guardianPrincipal: string;

  const ficha = () => certificados.matriculasExpedibles(String(e.estudiante._id), e.secretaria);
  const expedir = (extra: Partial<certificados.EntradaExpedicion> = {}) =>
    certificados.expedirCertificado({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO', solicitante: { tipo: 'ACUDIENTE', guardian_id: guardianPrincipal }, ...extra }, e.secretaria);
  const perfil = (extra: Record<string, unknown> = {}) =>
    StudentProfile.create({ user_id: e.estudiante._id, fecha_nacimiento: new Date('2014-03-02'), lugar_expedicion: 'Bogotá D.C.', ...extra });
  const conAutorizacion = { autorizacion_datos_sensibles: { otorgada: true, otorgado_por_nombre: 'Luis Pérez', fecha: new Date() } };

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await fs.rm(path.join(UPLOADS_ROOT, 'certificados'), { recursive: true, force: true });
    await detenerBaseDeDatos();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CertificadoEmitido.syncIndexes();
    await PlantillaCertificado.syncIndexes();
    await TipoCertificado.syncIndexes();
    e = await armarEscenario();
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    matriculaId = String((await Enrollment.findOne({ student_id: e.estudiante._id }))!._id);

    // Dos acudientes activos (uno principal), uno inactivo y un tercero ajeno al estudiante.
    const padre = await Guardian.create({ tipo_documento: 'CC', numero_documento: '79000111', nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233' });
    const madre = await Guardian.create({ tipo_documento: 'CC', numero_documento: '52000222', nombre: 'Marta', apellido: 'Gómez', telefono_principal: '3004445566' });
    const retirado = await Guardian.create({ tipo_documento: 'CC', numero_documento: '80000333', nombre: 'Pedro', apellido: 'Inactivo', telefono_principal: '3007778899', estado: 'inactivo' });
    await StudentGuardian.create([
      { student_id: e.estudiante._id, guardian_id: madre._id, parentesco: 'MADRE', es_principal: false },
      { student_id: e.estudiante._id, guardian_id: padre._id, parentesco: 'PADRE', es_principal: true },
      { student_id: e.estudiante._id, guardian_id: retirado._id, parentesco: 'TUTOR_LEGAL', es_principal: false },
    ]);
    guardianPrincipal = String(padre._id);

    await configuracion.actualizarConfiguracion({ rectoria: { usuario_id: String(e.admin._id) }, secretaria: { usuario_id: String(e.secretaria._id) } }, e.admin);
    for (const elemento of ['rectoria', 'secretaria', 'sello'] as const) {
      const png = await QRCode.toBuffer(`imagen-${elemento}`, { margin: 1, width: 200 });
      await configuracion.guardarImagen(elemento, { ...imagen(`${elemento}.png`), buffer: png, size: png.length }, e.admin);
    }
  });

  describe('la ficha del estudiante', () => {
    it('trae sede, jornada, horario, folio y los acudientes activos con el principal primero', async () => {
      await perfil();
      const r = await ficha();
      expect(r.estudiante).toMatchObject({ nombre: e.estudiante.nombre, tipo_documento: 'CC', lugar_expedicion: 'Bogotá D.C.', mayor_de_edad: false });
      expect(r.acudientes.map((a) => [a.nombre, a.parentesco, a.es_principal])).toEqual([
        ['Luis Pérez', 'PADRE', true],
        ['Marta Gómez', 'MADRE', false],
      ]);
      expect(r.acudientes[0]).toMatchObject({ numero_documento: '79000111', telefono: '3001112233' });
      expect(r.matriculas[0]).toMatchObject({ grado: 'Sexto', grupo: '601', estado: 'MATRICULADO_DEFINITIVO', folio_matricula: `F-${e.estudiante.numero_documento}`, tipo_ingreso: 'NUEVO' });
      expect(r.matriculas[0]!.sede).toBeTruthy();
      expect(r.matriculas[0]!.jornada).toBeTruthy();
      expect(r.matriculas[0]!.horario).toMatchObject({ inicio: expect.any(String), fin: expect.any(String) });
    });

    it('avisa qué le falta al sistema antes de que falle al expedir', async () => {
      const sinDatos = await ficha();
      expect(sinDatos.faltantes.join(' ')).toMatch(/lugar de expedición/);
      expect(sinDatos.faltantes.join(' ')).toMatch(/ciudad del colegio/);
      await perfil();
      await Institution.updateOne({}, { ciudad: 'Bogotá D.C.' });
      expect((await ficha()).faltantes).toEqual([]);

      await StudentGuardian.updateMany({ student_id: e.estudiante._id }, { es_principal: false });
      expect((await ficha()).faltantes.join(' ')).toMatch(/Ningún acudiente está marcado/);
      await StudentGuardian.deleteMany({ student_id: e.estudiante._id });
      expect((await ficha()).faltantes.join(' ')).toMatch(/no tiene acudiente registrado/);
    });

    it('la EPS solo se ofrece con la autorización del responsable legal, y nunca el régimen', async () => {
      await perfil({ eps: 'SANITAS', regimen_salud: 'CONTRIBUTIVO', ...conAutorizacion });
      const con = (await ficha()).estudiante.eps;
      expect(con).toEqual({ valor: 'SANITAS', disponible: true, motivo: null });
      expect(JSON.stringify(await ficha())).not.toMatch(/CONTRIBUTIVO/);

      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { 'autorizacion_datos_sensibles.otorgada': false });
      expect((await ficha()).estudiante.eps).toMatchObject({ valor: null, disponible: false, motivo: expect.stringMatching(/falta la autorización/) });
      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { $unset: { eps: 1 } });
      expect((await ficha()).estudiante.eps).toMatchObject({ valor: null, motivo: expect.stringMatching(/No hay una EPS registrada/) });
    });

    it('la consulta se audita sin guardar contenido', async () => {
      await ficha();
      const registros = await AuditLog.find({ accion: 'CERTIFICADO_FICHA_CONSULTADA' });
      expect(registros).toHaveLength(1);
      expect(registros[0]!.detalle).toBeNull();
    });
  });

  describe('quién solicita el documento', () => {
    it('es obligatorio al expedir, no en la vista previa', async () => {
      await expect(certificados.expedirCertificado({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO' }, e.secretaria)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/quién solicita/) });
      await expect(certificados.prepararVistaPrevia({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO' }, e.secretaria)).resolves.toBeDefined();
    });

    it('un acudiente vinculado queda registrado, sin imprimirse en el documento', async () => {
      const c = await expedir();
      expect(c.solicitante).toMatchObject({ tipo: 'ACUDIENTE', nombre: 'Luis Pérez', numero_documento: '79000111', detalle: 'PADRE' });
      expect(JSON.stringify(c.snapshot)).not.toContain('Luis Pérez');
      expect(certificados.vistaCertificado(c).solicitante).toEqual({ tipo: 'ACUDIENTE', nombre: 'Luis Pérez', detalle: 'PADRE' });
      const auditoria = await AuditLog.findOne({ accion: 'CERTIFICADO_EMITIDO' });
      expect(auditoria!.detalle).toContain('solicitante: ACUDIENTE');
      expect(auditoria!.detalle).not.toContain('Luis');
    });

    it('un acudiente inactivo o ajeno al estudiante no sirve: se registra como tercero con autorización', async () => {
      const ajeno = await Guardian.create({ tipo_documento: 'CC', numero_documento: '91000444', nombre: 'Ajeno', apellido: 'Persona', telefono_principal: '3000000000' });
      const inactivo = (await Guardian.findOne({ numero_documento: '80000333' }))!;
      for (const g of [ajeno, inactivo]) {
        await expect(expedir({ solicitante: { tipo: 'ACUDIENTE', guardian_id: String(g._id) } })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no está vinculado/) });
      }
      await expect(expedir({ solicitante: { tipo: 'TERCERO', nombre: 'Ajeno Persona', numero_documento: '91000444', detalle: 'tío' } })).rejects.toMatchObject({ statusCode: 400 });
      const c = await expedir({ solicitante: { tipo: 'TERCERO', nombre: 'Ajeno Persona', numero_documento: '91000444', detalle: 'tío', presento_autorizacion: true } });
      expect(c.solicitante).toMatchObject({ tipo: 'TERCERO', nombre: 'Ajeno Persona', detalle: 'tío' });
    });

    it('un menor no pide sus propios documentos; uno mayor de edad sí', async () => {
      await perfil({ fecha_nacimiento: new Date('2014-03-02') });
      await expect(expedir({ solicitante: { tipo: 'ESTUDIANTE' } })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/menor de edad/) });
      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { fecha_nacimiento: new Date('2000-03-02') });
      expect((await expedir({ solicitante: { tipo: 'ESTUDIANTE' } })).solicitante).toMatchObject({ tipo: 'ESTUDIANTE' });
    });

    it('una autoridad deja su oficio', async () => {
      await expect(expedir({ solicitante: { tipo: 'AUTORIDAD', nombre: 'Juzgado 4 de Familia' } })).rejects.toMatchObject({ statusCode: 400 });
      const c = await expedir({ solicitante: { tipo: 'AUTORIDAD', nombre: 'Juzgado 4 de Familia', detalle: 'Oficio 123' } });
      expect(c.solicitante).toMatchObject({ tipo: 'AUTORIDAD', detalle: 'Oficio 123' });
    });

    it('lo registrado no se edita en el modelo', async () => {
      const c = await expedir();
      c.set('solicitante.nombre', 'Otra persona');
      await expect(c.save()).rejects.toThrow(/no se puede modificar/);
    });
  });

  describe('la EPS como destinatario', () => {
    const conEps = () => expedir({ destinatario: { clave: 'EPS' } });

    it('sin EPS registrada, o sin la autorización, no se expide y explica por qué', async () => {
      await perfil();
      await expect(conEps()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/autorización de datos sensibles/) });
      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { eps: 'SANITAS', ...conAutorizacion });
      await StudentProfile.updateOne({ user_id: e.estudiante._id }, { 'autorizacion_datos_sensibles.otorgada': false }, { runValidators: false });
      await expect(conEps()).rejects.toMatchObject({ statusCode: 409 });
    });

    it('con EPS y autorización, el nombre real queda en el documento y se audita de dónde salió, sin el régimen', async () => {
      await perfil({ eps: 'SANITAS', regimen_salud: 'CONTRIBUTIVO', ...conAutorizacion });
      const c = await conEps();
      const s = c.snapshot as { destinatario: string; destino: { frase: string }; contenido: { bloques: Array<{ texto: string }> } };
      expect(s.destinatario).toBe('SANITAS');
      expect(s.destino.frase).toBe('Se expide para presentar ante la Entidad Promotora de Salud (EPS) SANITAS');
      expect(s.contenido.bloques.map((b) => b.texto).join(' ')).toContain('presentar ante la Entidad Promotora de Salud (EPS) SANITAS.');
      expect(JSON.stringify(c.snapshot)).not.toMatch(/CONTRIBUTIVO/);
      const auditoria = await AuditLog.findOne({ accion: 'CERTIFICADO_EMITIDO' });
      expect(auditoria!.detalle).toContain('entidad de EPS (M03)');
      expect(auditoria!.detalle).not.toContain('SANITAS');
    });

    it('las demás opciones no leen la EPS aunque exista', async () => {
      await perfil({ eps: 'SANITAS', ...conAutorizacion });
      const c = await expedir({ destinatario: { clave: 'CAJA_COMPENSACION' } });
      expect(JSON.stringify(c.snapshot)).not.toContain('SANITAS');
      expect((await AuditLog.findOne({ accion: 'CERTIFICADO_EMITIDO' }))!.detalle).not.toContain('entidad de');
    });
  });

  describe('la vigencia al verificar', () => {
    it('una constancia con vigencia de 30 días sale válida hasta que se cumple y luego «vigencia cumplida»', async () => {
      const c = await expedir();
      expect(await verificacion.verificarCertificado({ token: c.token_verificacion })).toMatchObject({ resultado: 'VALIDO', vigencia: { dias: 30 } });

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 29 * 24 * 60 * 60 * 1000);
      expect((await verificacion.verificarCertificado({ token: c.token_verificacion })).resultado).toBe('VALIDO');
      vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const vencida = await verificacion.verificarCertificado({ token: c.token_verificacion });
      expect(vencida).toMatchObject({ resultado: 'VIGENCIA_CUMPLIDA', codigo: c.codigo });
      expect(vencida.vigencia?.hasta).toBeTruthy();
    });

    it('un documento sin vigencia no vence, y uno anulado sigue anulado aunque no haya vencido', async () => {
      const sinVigencia = await expedir({ tipo: 'CERTIFICADO_MATRICULA' });
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 400 * 24 * 60 * 60 * 1000);
      expect((await verificacion.verificarCertificado({ token: sinVigencia.token_verificacion })).resultado).toBe('VALIDO');
      vi.useRealTimers();

      const c = await expedir();
      await certificados.anularCertificado(String(c._id), 'Se expidió por error', e.admin);
      expect((await verificacion.verificarCertificado({ token: c.token_verificacion })).resultado).toBe('ANULADO');
    });
  });
});
