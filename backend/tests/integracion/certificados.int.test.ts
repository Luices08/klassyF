import fs from 'fs/promises';
import mongoose from 'mongoose';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as certificados from '../../src/services/certificado.service';
import * as pdf from '../../src/services/certificadoPdf.service';
import * as verificacion from '../../src/services/certificadoVerificacion.service';
import { claveCorta } from '../../src/utils/certificados';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

// `config/env` lee las variables al importarse: se fijan antes que cualquier import.
vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  process.env.CERT_HMAC_SECRET = 'secreto-de-certificados-de-pruebas';
});

const imagen = (nombre: string) => ({ buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png', originalname: nombre }) as unknown as Express.Multer.File;

describe('M26 certificados (con base de datos)', () => {
  let e: Escenario;
  let secretariaAcademica: Awaited<ReturnType<typeof crearUsuario>>;
  let matriculaId: string;

  const expedir = (extra: Partial<certificados.EntradaExpedicion> = {}, quien = e.secretaria) =>
    certificados.expedirCertificado({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO', ...extra }, quien);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await fs.rm(path.join(process.cwd(), 'uploads', 'certificados'), { recursive: true, force: true });
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CertificadoEmitido.syncIndexes();
    e = await armarEscenario();
    secretariaAcademica = e.secretaria;
    matriculaId = String((await Enrollment.findOne({ student_id: e.estudiante._id }))!._id);

    await configuracion.actualizarConfiguracion({ rectoria: { usuario_id: String(e.admin._id) }, secretaria: { usuario_id: String(secretariaAcademica._id) } }, e.admin);
    for (const elemento of ['rectoria', 'secretaria', 'sello'] as const) {
      const png = await QRCode.toBuffer(`imagen-${elemento}`, { margin: 1, width: 200 });
      await configuracion.guardarImagen(elemento, { ...imagen(`${elemento}.png`), buffer: png, size: png.length }, e.admin);
    }
  });

  it('expide con los datos que el sistema ya conoce y un consecutivo sin huecos', async () => {
    const primero = await expedir();
    const segundo = await expedir();
    const anio = new Date().getFullYear();
    expect(primero.codigo).toBe(`CE-${anio}-0001`);
    expect(segundo.codigo).toBe(`CE-${anio}-0002`);
    const s = primero.snapshot as { encabezado: { institucion: string; codigo_dane: string }; estudiante: { numero_documento: string }; matricula: { grado: string; grupo: string; folio_matricula: string } };
    expect(s.encabezado).toMatchObject({ institucion: 'Colegio de prueba', codigo_dane: '123456789012' });
    expect(s.estudiante.numero_documento).toBe(e.estudiante.numero_documento);
    expect(s.matricula).toMatchObject({ grado: 'Sexto', grupo: '601', folio_matricula: `F-${e.estudiante.numero_documento}` });
    expect(primero.token_verificacion).toHaveLength(22);
  });

  it('expide en paralelo sin repetir consecutivos', async () => {
    const codigos = (await Promise.all([expedir(), expedir(), expedir(), expedir()])).map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(4);
  });

  it('cada documento lleva sus propios consecutivos por tipo', async () => {
    const anio = new Date().getFullYear();
    const matricula = await expedir({ tipo: 'CERTIFICADO_MATRICULA' });
    expect(matricula.codigo).toBe(`CM-${anio}-0001`);
  });

  it('solo Secretaría y el administrador expiden', async () => {
    await expect(expedir({}, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(expedir({}, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(expedir({}, e.admin)).resolves.toBeDefined();
  });

  it('el switch decide qué se estampa y queda congelado en el documento', async () => {
    const porDefecto = (await expedir()).snapshot as { firmas: { rectoria: { aplicada: boolean }; secretaria: { aplicada: boolean }; sello: { aplicado: boolean } } };
    expect([porDefecto.firmas.rectoria.aplicada, porDefecto.firmas.secretaria.aplicada, porDefecto.firmas.sello.aplicado]).toEqual([false, true, true]);

    const apagado = (await expedir({ firmas: { secretaria: false, sello: false, rectoria: true } })).snapshot as typeof porDefecto;
    expect([apagado.firmas.rectoria.aplicada, apagado.firmas.secretaria.aplicada, apagado.firmas.sello.aplicado]).toEqual([true, false, false]);
  });

  it('la secretaría estampa la firma de rectoría solo mientras el administrador lo permita', async () => {
    await expect(expedir({ firmas: { rectoria: true } })).resolves.toBeDefined();
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: false }, e.admin);
    await expect(expedir({ firmas: { rectoria: true } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(expedir({ firmas: { rectoria: true } }, e.admin)).resolves.toBeDefined();
  });

  it('un elemento obligatorio sin imagen bloquea la expedición', async () => {
    await configuracion.actualizarConfiguracion({ politica: { CONSTANCIA_ESTUDIO: { sello: 'OBLIGATORIO' } } }, e.admin);
    await expect(expedir({ firmas: { sello: false } })).rejects.toMatchObject({ statusCode: 409 });
    await configuracion.quitarImagen('sello', e.admin);
    await expect(expedir()).rejects.toThrow(/imagen/);
  });

  it('solo el administrador configura firmas y sellos', async () => {
    await expect(configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: false }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.guardarImagen('sello', undefined, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rechaza imágenes que no lo son aunque declaren ser PNG', async () => {
    const falso = Buffer.from('esto no es una imagen');
    await expect(configuracion.guardarImagen('sello', { ...imagen('x.png'), buffer: falso, size: falso.length }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('el firmante tiene el rol que corresponde', async () => {
    await expect(configuracion.actualizarConfiguracion({ rectoria: { usuario_id: String(e.docenteDeClase._id) } }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('respeta el estado de la matrícula', async () => {
    await Enrollment.updateOne({ _id: matriculaId }, { estado: 'RETIRADO' });
    await expect(expedir()).rejects.toMatchObject({ statusCode: 409 });
    const certificado = await expedir({ tipo: 'CERTIFICADO_MATRICULA' });
    expect((certificado.snapshot as { matricula: { estado: string } }).matricula.estado).toBe('RETIRADO');
  });

  it('lo expedido es inmutable en el modelo', async () => {
    const c = await expedir();
    c.set('snapshot', { cualquier: 'cosa' });
    await expect(c.save()).rejects.toThrow(/no se puede modificar/);
  });

  it('verifica por el token del QR y por código + clave, mostrando lo mínimo', async () => {
    const c = await expedir();
    const porToken = await verificacion.verificarCertificado({ token: c.token_verificacion });
    expect(porToken).toMatchObject({ resultado: 'VALIDO', codigo: c.codigo, institucion: 'Colegio de prueba' });
    expect(JSON.stringify(porToken)).not.toContain(e.estudiante.numero_documento);
    expect((porToken as { documento: string }).documento).toMatch(/^•+\d{3}$/);

    const porCodigo = await verificacion.verificarCertificado({ codigo: c.codigo.toLowerCase(), clave: claveCorta(c.hash).toLowerCase() });
    expect(porCodigo).toMatchObject({ resultado: 'VALIDO', codigo: c.codigo });
  });

  it('un código con la clave equivocada o un token inventado responden igual: no existe', async () => {
    const c = await expedir();
    await expect(verificacion.verificarCertificado({ codigo: c.codigo, clave: 'AAAAAAAAAAAA' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(verificacion.verificarCertificado({ token: 'x'.repeat(22) })).rejects.toMatchObject({ statusCode: 404 });
    await expect(verificacion.verificarCertificado({ codigo: c.codigo })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('una alteración directa en la base se detecta: no verifica ni se imprime', async () => {
    const c = await expedir();
    await mongoose.connection.db!.collection('certificadoemitidos').updateOne({ _id: c._id }, { $set: { 'snapshot.estudiante.nombre': 'Otro' } });
    expect(await certificados.verificarIntegridad(String(c._id), e.secretaria)).toMatchObject({ integro: false });
    expect(await verificacion.verificarCertificado({ token: c.token_verificacion })).toMatchObject({ resultado: 'NO_VERIFICABLE' });
    await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('un certificado anulado sigue verificándose, pero como anulado; solo el administrador anula', async () => {
    const c = await expedir();
    await expect(certificados.anularCertificado(String(c._id), 'Datos mal expedidos', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await certificados.anularCertificado(String(c._id), 'Datos mal expedidos', e.admin);
    expect(await verificacion.verificarCertificado({ token: c.token_verificacion })).toMatchObject({ resultado: 'ANULADO' });
    await expect(certificados.anularCertificado(String(c._id), 'otra vez', e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('genera el PDF expedido (con QR) y la vista previa, sin guardar nada', async () => {
    const c = await expedir({ destinatario: 'la EPS', firmas: { rectoria: true } });
    const { buffer, nombreArchivo } = await pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(nombreArchivo).toBe(`${c.codigo}.pdf`);

    const antes = await CertificadoEmitido.countDocuments();
    const previa = await pdf.generarVistaPreviaPdf({ enrollment_id: matriculaId, tipo: 'CERTIFICADO_MATRICULA' }, e.secretaria);
    expect(previa.subarray(0, 4).toString()).toBe('%PDF');
    expect(await CertificadoEmitido.countDocuments()).toBe(antes);
  });

  it('audita la expedición, la descarga y la anulación sin guardar contenido', async () => {
    const c = await expedir();
    await pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria);
    await certificados.anularCertificado(String(c._id), 'Datos mal expedidos', e.admin);
    const acciones = (await AuditLog.find({ entidad: 'CertificadoEmitido' })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(['CERTIFICADO_EMITIDO', 'CERTIFICADO_DESCARGADO', 'CERTIFICADO_ANULADO']));
    const detalles = (await AuditLog.find({ entidad: 'CertificadoEmitido' })).map((a) => a.detalle ?? '');
    expect(detalles.join(' ')).not.toContain('Datos mal expedidos');
  });

  it('lista las matrículas del estudiante con los documentos que aplican a cada una', async () => {
    const r = await certificados.matriculasExpedibles(String(e.estudiante._id), e.secretaria);
    expect(r.matriculas).toHaveLength(1);
    expect(r.matriculas[0]!.tipos).toEqual(['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA']);
    await expect(certificados.matriculasExpedibles(String(e.estudiante._id), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });
});
