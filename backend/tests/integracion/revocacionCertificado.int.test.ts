import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import PlantillaCertificado from '../../src/models/plantillaCertificado.model';
import TipoCertificado from '../../src/models/tipoCertificado.model';
import * as certificados from '../../src/services/certificado.service';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as pdf from '../../src/services/certificadoPdf.service';
import * as revocacion from '../../src/services/certificadoRevocacion.service';
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
// La contraseña con la que `crearUsuario` deja a cada usuario del escenario.
const CLAVE = 'Clave-segura-1';

describe('M26: anular por elemento comprometido (con base de datos)', () => {
  let e: Escenario;
  let matriculaId: string;

  const expedir = (extra: Partial<certificados.EntradaExpedicion> = {}) =>
    certificados.expedirCertificado(
      { enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO', solicitante: { tipo: 'TERCERO', nombre: 'Persona Autorizada', numero_documento: '555666', detalle: 'tía', presento_autorizacion: true }, ...extra },
      e.secretaria
    );
  const cargar = async (elemento: 'rectoria' | 'secretaria' | 'sello', semilla: string) => {
    const png = await QRCode.toBuffer(semilla, { margin: 1, width: 200 });
    return configuracion.guardarImagen(elemento, { ...imagen(`${elemento}.png`), buffer: png, size: png.length }, e.admin);
  };
  const selloDe = async () => (await revocacion.imagenesUsadas(e.admin)).filter((i) => i.elemento === 'sello');

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await fs.rm(path.join(UPLOADS_ROOT, 'certificados'), { recursive: true, force: true });
    await detenerBaseDeDatos();
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
    await configuracion.actualizarConfiguracion({ rectoria: { usuario_id: String(e.admin._id) }, secretaria: { usuario_id: String(e.secretaria._id) } }, e.admin);
    for (const elemento of ['rectoria', 'secretaria', 'sello'] as const) await cargar(elemento, `imagen-${elemento}`);
  });

  it('cambiar el sello no anula nada: lo ya expedido conserva el sello de entonces y sigue vigente', async () => {
    const antes = await expedir();
    await cargar('sello', 'sello-nuevo');
    const despues = await expedir();

    const usadas = await selloDe();
    expect(usadas.map((u) => [u.documentos, u.es_la_actual]).sort()).toEqual([[1, true], [1, false]].sort());
    expect((await CertificadoEmitido.findById(antes._id))!.estado).toBe('VIGENTE');
    expect((await verificacion.verificarCertificado({ token: antes.token_verificacion })).resultado).toBe('VALIDO');
    await expect(pdf.generarPdfDeCertificado(String(antes._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
    expect(despues.estado).toBe('VIGENTE');
  });

  it('lista las imágenes usadas, con cuántos documentos vigentes y de cuándo a cuándo', async () => {
    await expedir();
    await expedir();
    const [sello] = await selloDe();
    expect(sello).toMatchObject({ documentos: 2, es_la_actual: true, hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(sello!.huella).toBe(sello!.hash.slice(0, 12).toUpperCase());
    // La firma de Rectoría nace apagada: ningún documento la usó.
    expect((await revocacion.imagenesUsadas(e.admin)).filter((i) => i.elemento === 'rectoria')).toEqual([]);
  });

  it('solo el administrador la ve y la ejecuta', async () => {
    await expect(revocacion.imagenesUsadas(e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    const hash = 'a'.repeat(64);
    await expect(revocacion.previaDeRevocacion({ elemento: 'sello', imagen_hash: hash }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(revocacion.revocarPorElemento({ elemento: 'sello', imagen_hash: hash }, 'Sello comprometido', CLAVE, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('anula todos los documentos vigentes con esa imagen, con motivo y la contraseña, y deja los demás', async () => {
    const viejo1 = await expedir();
    const viejo2 = await expedir({ tipo: 'CERTIFICADO_MATRICULA' });
    const [antiguo] = await selloDe();
    await cargar('sello', 'sello-nuevo');
    const nuevo = await expedir();

    expect(await revocacion.previaDeRevocacion({ elemento: 'sello', imagen_hash: antiguo!.hash }, e.admin)).toEqual({ documentos: 2 });
    await expect(revocacion.revocarPorElemento({ elemento: 'sello', imagen_hash: antiguo!.hash }, 'Sello comprometido', 'otra-clave', e.admin)).rejects.toMatchObject({ statusCode: 401 });
    await expect(revocacion.revocarPorElemento({ elemento: 'sello', imagen_hash: antiguo!.hash }, 'corto', CLAVE, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    expect(await CertificadoEmitido.countDocuments({ estado: 'ANULADO' })).toBe(0);

    expect(await revocacion.revocarPorElemento({ elemento: 'sello', imagen_hash: antiguo!.hash }, 'El sello fue robado y se usó sin autorización', CLAVE, e.admin)).toEqual({ anulados: 2 });
    for (const c of [viejo1, viejo2]) {
      const guardado = await CertificadoEmitido.findById(c._id);
      expect(guardado).toMatchObject({ estado: 'ANULADO', anulacion: { motivo: 'El sello fue robado y se usó sin autorización' } });
      expect((await verificacion.verificarCertificado({ token: c.token_verificacion })).resultado).toBe('ANULADO');
      // Sigue siendo íntegro y se imprime con la marca «ANULADO».
      expect((await certificados.verificarIntegridad(String(c._id), e.secretaria)).integro).toBe(true);
    }
    expect((await CertificadoEmitido.findById(nuevo._id))!.estado).toBe('VIGENTE');
    // Ya no quedan vigentes con esa imagen: no se repite.
    await expect(revocacion.revocarPorElemento({ elemento: 'sello', imagen_hash: antiguo!.hash }, 'El sello fue robado otra vez', CLAVE, e.admin)).rejects.toMatchObject({ statusCode: 409 });

    const auditoria = await AuditLog.findOne({ accion: 'CERTIFICADOS_ANULACION_MASIVA' });
    expect(auditoria!.detalle).toContain('2 documento(s)');
    expect(auditoria!.detalle).not.toContain('robado');
  });

  it('se puede acotar por tipo de documento y por fechas', async () => {
    await expedir();
    await expedir({ tipo: 'CERTIFICADO_MATRICULA' });
    const [sello] = await selloDe();
    const base = { elemento: 'sello' as const, imagen_hash: sello!.hash };

    expect((await revocacion.previaDeRevocacion({ ...base, tipo: 'CERTIFICADO_MATRICULA' }, e.admin)).documentos).toBe(1);
    expect((await revocacion.previaDeRevocacion({ ...base, desde: new Date(Date.now() + 86_400_000) }, e.admin)).documentos).toBe(0);
    expect((await revocacion.previaDeRevocacion({ ...base, desde: new Date(Date.now() - 86_400_000), hasta: new Date(Date.now() + 86_400_000) }, e.admin)).documentos).toBe(2);

    expect(await revocacion.revocarPorElemento({ ...base, tipo: 'CERTIFICADO_MATRICULA' }, 'Solo los certificados de matrícula', CLAVE, e.admin)).toEqual({ anulados: 1 });
    expect(await CertificadoEmitido.countDocuments({ estado: 'VIGENTE' })).toBe(1);
  });
});
