import fs from 'fs/promises';
import mongoose from 'mongoose';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaveCertificado } from '../../src/constants/certificados';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import Institution from '../../src/models/institution.model';
import PlantillaCertificado from '../../src/models/plantillaCertificado.model';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as certificados from '../../src/services/certificado.service';
import * as pdf from '../../src/services/certificadoPdf.service';
import * as plantillaServicio from '../../src/services/certificadoPlantilla.service';
import * as verificacion from '../../src/services/certificadoVerificacion.service';
import { cargarEscudoCongelado } from '../../src/services/encabezadoInstitucional.service';
import { existeImagen } from '../../src/utils/almacenImagenes';
import { claveCorta } from '../../src/utils/certificados';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { plantillaVigente, contenidoDe } from '../../src/services/certificadoPlantilla.service';
import { UPLOADS_ROOT, rutaImagenAutenticacion } from '../../src/utils/uploadPaths';

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
    certificados.expedirCertificado({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO', solicitante: { tipo: 'TERCERO', nombre: 'Persona Autorizada', numero_documento: '555666', detalle: 'tía', presento_autorizacion: true } as const, ...extra }, quien);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await fs.rm(path.join(UPLOADS_ROOT, 'certificados'), { recursive: true, force: true });
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CertificadoEmitido.syncIndexes();
    await PlantillaCertificado.syncIndexes();
    e = await armarEscenario();
    // La secretaria solo trabaja con las sedes que tiene asignadas.
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
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
    // La firma de Rectoría nace sin delegar en la secretaría: para estamparla desde su cuenta el administrador lo permite.
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: true }, e.admin);
    const porDefecto = (await expedir()).snapshot as { firmas: { rectoria: { aplicada: boolean }; secretaria: { aplicada: boolean }; sello: { aplicado: boolean } } };
    expect([porDefecto.firmas.rectoria.aplicada, porDefecto.firmas.secretaria.aplicada, porDefecto.firmas.sello.aplicado]).toEqual([false, true, true]);

    const apagado = (await expedir({ firmas: { secretaria: false, sello: false, rectoria: true } })).snapshot as typeof porDefecto;
    expect([apagado.firmas.rectoria.aplicada, apagado.firmas.secretaria.aplicada, apagado.firmas.sello.aplicado]).toEqual([true, false, false]);
  });

  it('la firma de Rectoría nace sin delegar: la secretaría solo la estampa mientras el administrador lo permita', async () => {
    expect((await configuracion.vistaConfiguracion(e.admin)).permitir_firma_rectoria_a_secretaria).toBe(false);
    await expect(expedir({ firmas: { rectoria: true } })).rejects.toMatchObject({ statusCode: 409 });
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: true }, e.admin);
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

  it('la delegación, la política, el rector y las dependencias son solo del administrador', async () => {
    await expect(configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: false }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.actualizarConfiguracion({ politica: { PAZ_SALVO: { sello: 'NO_APLICA' } } }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.actualizarConfiguracion({ rectoria: { cargo: 'Rectora' } }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.actualizarConfiguracion({ paz_y_salvo: { dependencias: [{ nombre: 'Cafetería', activa: true }] } }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: false }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('secretaría carga su firma, el sello y designa a su firmante', async () => {
    const png = await QRCode.toBuffer('firma-nueva', { margin: 1, width: 200 });
    const archivo = { ...imagen('nueva.png'), buffer: png, size: png.length };
    const vista = await configuracion.guardarImagen('secretaria', archivo, e.secretaria);
    expect(vista.secretaria.tiene_imagen).toBe(true);
    await expect(configuracion.guardarImagen('sello', archivo, e.secretaria)).resolves.toBeDefined();
    await expect(configuracion.actualizarConfiguracion({ secretaria: { usuario_id: String(e.secretaria._id), cargo: 'Secretaria Académica' } }, e.secretaria)).resolves.toBeDefined();
    await expect(configuracion.quitarImagen('secretaria', e.secretaria)).resolves.toBeDefined();
    const auditadas = await AuditLog.countDocuments({ accion: 'CERTIFICADOS_IMAGEN_ACTUALIZADA', usuario_id: e.secretaria._id });
    expect(auditadas).toBe(3);
  });

  it('secretaría carga la firma de Rectoría solo mientras el administrador mantenga la delegación', async () => {
    const png = await QRCode.toBuffer('firma-rector', { margin: 1, width: 200 });
    const archivo = { ...imagen('rector.png'), buffer: png, size: png.length };
    await expect(configuracion.guardarImagen('rectoria', archivo, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: true }, e.admin);
    await expect(configuracion.guardarImagen('rectoria', archivo, e.secretaria)).resolves.toBeDefined();
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: false }, e.admin);
    await expect(configuracion.guardarImagen('rectoria', archivo, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.quitarImagen('rectoria', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.rutaImagenVigente('rectoria', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.rutaImagenVigente('rectoria', e.admin)).resolves.toMatch(/\.png$/);
  });

  it('otros roles no ven ni cargan firmas', async () => {
    await expect(configuracion.guardarImagen('sello', undefined, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.rutaImagenVigente('sello', e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('la vista de configuración dice qué puede hacer cada usuario', async () => {
    const delAdmin = await configuracion.vistaConfiguracion(e.admin);
    expect(delAdmin.puede.ajustes).toBe(true);
    const delaSecretaria = await configuracion.vistaConfiguracion(e.secretaria);
    expect(delaSecretaria.puede).toEqual({ imagen: { rectoria: false, secretaria: true, sello: true }, designar: { rectoria: false, secretaria: true }, ajustes: false });
    expect(delaSecretaria.tipos.map((t) => t.clave)).toEqual(['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA', 'PAZ_SALVO', 'CERTIFICADO_ESTUDIOS']);
    expect(delaSecretaria.tipos[0]!.destinatarios.at(-1)).toMatchObject({ clave: 'OTRO' });
  });

  it('no se puede encender una firma si nadie está designado como firmante', async () => {
    await configuracion.actualizarConfiguracion({ secretaria: { usuario_id: null } }, e.admin);
    await expect(expedir({ firmas: { secretaria: true } })).rejects.toThrow(/designar quién firma/);
    await expect(expedir({ firmas: { secretaria: false } })).resolves.toBeDefined();
  });

  it('una configuración guardada antes de los tipos nuevos sigue siendo válida', async () => {
    await mongoose.connection.db!.collection('configuracioncertificados').updateMany({}, { $unset: { paz_y_salvo: '', 'politica.PAZ_SALVO': '', 'politica.CERTIFICADO_ESTUDIOS': '' } });
    const vista = await configuracion.vistaConfiguracion(e.admin);
    expect(vista.paz_y_salvo.dependencias.map((d) => d.clave)).toEqual(['academica', 'biblioteca', 'financiera', 'inventario']);
    await expect(configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: true }, e.admin)).resolves.toBeDefined();
  });

  it('el administrador configura las dependencias del paz y salvo', async () => {
    const vista = await configuracion.actualizarConfiguracion({ paz_y_salvo: { dependencias: [{ clave: 'biblioteca', nombre: 'Biblioteca', activa: false }, { nombre: 'Cafetería', activa: true }] } }, e.admin);
    expect(vista.paz_y_salvo.dependencias).toHaveLength(2);
    expect(vista.paz_y_salvo.dependencias[0]).toEqual({ clave: 'biblioteca', nombre: 'Biblioteca', activa: false });
    expect(vista.paz_y_salvo.dependencias[1]!.clave).toMatch(/^dep-/);
    await expect(configuracion.actualizarConfiguracion({ paz_y_salvo: { dependencias: [{ nombre: 'Cafetería', activa: true }, { nombre: 'cafetería', activa: true }] } }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('el destinatario sale del selector y queda congelado con su frase', async () => {
    const porDefecto = (await expedir()).snapshot as { destinatario: string; destino: { clave: string; frase: string } };
    expect(porDefecto).toMatchObject({ destinatario: 'A quien interese', destino: { clave: 'A_QUIEN_INTERESE' } });
    const caja = (await expedir({ destinatario: { clave: 'CAJA_COMPENSACION' } })).snapshot as typeof porDefecto;
    expect(caja.destino.frase).toContain('Caja de Compensación Familiar');
    // La opción de EPS toma el nombre de M03: sin EPS registrada no se puede elegir (ver fichaCertificado.int.test.ts).
    await expect(expedir({ destinatario: { clave: 'EPS' } })).rejects.toMatchObject({ statusCode: 409 });
    const otro = (await expedir({ destinatario: { clave: 'OTRO', otro: 'Compensar' } })).snapshot as typeof porDefecto;
    expect(otro).toMatchObject({ destinatario: 'Compensar', destino: { frase: 'Se expide para presentar ante Compensar' } });
    await expect(expedir({ destinatario: { clave: 'RETIRO_TRASLADO' } })).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('paz y salvo', () => {
    const pazYSalvo = (extra: Partial<certificados.EntradaExpedicion> = {}) => expedir({ tipo: 'PAZ_SALVO', ...extra });
    const todas = ['academica', 'biblioteca', 'financiera', 'inventario'];

    it('se expide con todas las dependencias confirmadas y las congela', async () => {
      const c = await pazYSalvo({ dependencias: todas, destinatario: { clave: 'GRADUACION' } });
      expect(c.codigo).toBe(`PS-${new Date().getFullYear()}-0001`);
      const s = c.snapshot as { paz_y_salvo: { dependencias: string[]; verificado_por: string }; destino: { clave: string } };
      expect(s.paz_y_salvo.dependencias).toEqual(['Académica', 'Biblioteca', 'Financiera / Administrativa', 'Inventario y recursos']);
      expect(s.paz_y_salvo.verificado_por).toContain(e.secretaria.nombre);
      expect(s.destino.clave).toBe('GRADUACION');
    });

    it('sin confirmar todas las dependencias activas no se expide, y dice cuáles faltan', async () => {
      await expect(pazYSalvo({ dependencias: ['academica'] })).rejects.toThrow(/Biblioteca/);
      await expect(pazYSalvo()).rejects.toMatchObject({ statusCode: 409 });
      await expect(pazYSalvo({ dependencias: [...todas, 'inventada'] })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('una dependencia desactivada ya no se exige ni aparece', async () => {
      await configuracion.actualizarConfiguracion({ paz_y_salvo: { dependencias: [{ clave: 'academica', nombre: 'Académica', activa: true }, { clave: 'biblioteca', nombre: 'Biblioteca', activa: false }] } }, e.admin);
      const c = await pazYSalvo({ dependencias: ['academica'] });
      expect((c.snapshot as { paz_y_salvo: { dependencias: string[] } }).paz_y_salvo.dependencias).toEqual(['Académica']);
    });

    it('sin dependencias activas no hay con qué certificar', async () => {
      await configuracion.actualizarConfiguracion({ paz_y_salvo: { dependencias: [] } }, e.admin);
      await expect(pazYSalvo({ dependencias: [] })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('un retirado puede tener paz y salvo', async () => {
      await Enrollment.updateOne({ _id: matriculaId }, { estado: 'RETIRADO' });
      await expect(pazYSalvo({ dependencias: todas })).resolves.toBeDefined();
    });

    it('el PDF se genera desde el snapshot', async () => {
      const c = await pazYSalvo({ dependencias: todas });
      const { buffer } = await pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('certificado de estudio (con notas)', () => {
    const estudios = (extra: Partial<certificados.EntradaExpedicion> = {}) => expedir({ tipo: 'CERTIFICADO_ESTUDIOS', ...extra });

    it('se ofrece como solo vista previa mientras no exista el concepto de promoción', async () => {
      const r = await certificados.matriculasExpedibles(String(e.estudiante._id), e.secretaria);
      expect(r.matriculas[0]!.tipos).toContain('CERTIFICADO_ESTUDIOS');
      expect(r.matriculas[0]!.restricciones.CERTIFICADO_ESTUDIOS).toMatch(/M19/);
    });

    it('no se expide como oficial, pero la vista previa sí se genera sin guardar nada', async () => {
      await expect(estudios()).rejects.toThrow(/M19/);
      expect(await CertificadoEmitido.countDocuments({ tipo: 'CERTIFICADO_ESTUDIOS' })).toBe(0);
      const previa = await pdf.generarVistaPreviaPdf({ enrollment_id: matriculaId, tipo: 'CERTIFICADO_ESTUDIOS' }, e.secretaria);
      expect(previa.subarray(0, 4).toString()).toBe('%PDF');
    });
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
    await configuracion.actualizarConfiguracion({ permitir_firma_rectoria_a_secretaria: true }, e.admin);
    const c = await expedir({ destinatario: { clave: 'OTRO', otro: 'la EPS' }, firmas: { rectoria: true } });
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
    expect(r.matriculas[0]!.tipos).toEqual(['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA', 'PAZ_SALVO', 'CERTIFICADO_ESTUDIOS']);
    await expect(certificados.matriculasExpedibles(String(e.estudiante._id), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });
  describe('aislamiento de las pruebas', () => {
    it('no usan la carpeta real de archivos de quien desarrolla', () => {
      expect(UPLOADS_ROOT).not.toBe(path.join(process.cwd(), 'uploads'));
    });
  });

  describe('alcance por sede de la secretaría', () => {
    it('una secretaria sin sedes asignadas no ve ni expide nada', async () => {
      const sinSede = await crearUsuario('SECRETARIA');
      const r = await certificados.matriculasExpedibles(String(e.estudiante._id), sinSede);
      expect(r.matriculas).toEqual([]);
      await expect(expedir({}, sinSede)).rejects.toMatchObject({ statusCode: 404 });
      expect((await certificados.listarCertificados({ pagina: 1, limite: 20 }, sinSede)).total).toBe(0);
    });

    it('una secretaria de otra sede tampoco: «no existe» y «no es de tu sede» responden igual', async () => {
      const otra = (await Campus.findOne({ es_principal: false }))!;
      const deOtraSede = await crearUsuario('SECRETARIA', { sedes_ids: [otra._id] });
      const c = await expedir();
      expect((await certificados.matriculasExpedibles(String(e.estudiante._id), deOtraSede)).matriculas).toEqual([]);
      await expect(expedir({}, deOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', deOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(certificados.verificarIntegridad(String(c._id), deOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      expect((await certificados.listarCertificados({ pagina: 1, limite: 20 }, deOtraSede)).total).toBe(0);
    });

    it('lo expedido guarda su sede; la secretaria de esa sede y el administrador lo ven', async () => {
      const c = await expedir();
      const sede = (await Campus.findOne({ es_principal: true }))!;
      expect(String(c.sede_id)).toBe(String(sede._id));
      expect((await certificados.listarCertificados({ pagina: 1, limite: 20 }, e.secretaria)).total).toBe(1);
      expect((await certificados.listarCertificados({ pagina: 1, limite: 20 }, e.admin)).total).toBe(1);
    });
  });

  describe('imágenes: escudo congelado y recuperación', () => {
    const logo = async (texto: string) => `data:image/png;base64,${(await QRCode.toBuffer(texto, { margin: 1, width: 120 })).toString('base64')}`;

    it('el escudo queda guardado por su huella en lo expedido y cambiar el logo después no altera la reimpresión', async () => {
      await Institution.updateOne({}, { logo_url: await logo('escudo-uno') });
      const c = await expedir();
      const escudo = (c.snapshot as { encabezado: { escudo: { hash: string; ext: string } } }).encabezado.escudo;
      expect(escudo.hash).toHaveLength(64);
      const original = await cargarEscudoCongelado(escudo);

      await Institution.updateOne({}, { logo_url: await logo('escudo-dos') });
      const reimpresion = await cargarEscudoCongelado(escudo);
      expect(reimpresion!.equals(original!)).toBe(true);
      await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
    });

    it('si el archivo del escudo se pierde y el logo sigue siendo el mismo, se restaura solo', async () => {
      await Institution.updateOne({}, { logo_url: await logo('escudo-uno') });
      const c = await expedir();
      const escudo = (c.snapshot as { encabezado: { escudo: { hash: string; ext: string } } }).encabezado.escudo;
      await fs.rm(rutaImagenAutenticacion(escudo.hash, escudo.ext));
      await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
      expect(await existeImagen(escudo)).toBe(true);
    });

    it('si el archivo de una firma se pierde, el PDF explica cómo recuperarlo y volver a cargar la misma imagen lo arregla', async () => {
      const c = await expedir({ firmas: { secretaria: true } });
      const firma = (c.snapshot as { firmas: { secretaria: { imagen: { hash: string; ext: string } } } }).firmas.secretaria.imagen;
      const ruta = rutaImagenAutenticacion(firma.hash, firma.ext);
      const bytes = await fs.readFile(ruta);
      await fs.rm(ruta);

      await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/Firmas y sellos.*se identifica por su contenido/),
      });
      // La pantalla lo ve antes de que falle: la firma sale como faltante y no se ofrece para documentos nuevos.
      const vista = await configuracion.vistaConfiguracion(e.admin);
      expect(vista.secretaria.imagen_faltante).toBe(true);
      expect(vista.tipos[0]!.elementos.secretaria.disponible).toBe(false);
      await expect(expedir({ firmas: { secretaria: true } })).rejects.toThrow(/Falta cargar la imagen/);

      // Volver a cargar la imagen original recrea exactamente el mismo archivo.
      await configuracion.guardarImagen('secretaria', { ...imagen('firma.png'), buffer: bytes, size: bytes.length }, e.secretaria);
      await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
      expect((await configuracion.vistaConfiguracion(e.admin)).secretaria.imagen_faltante).toBe(false);
    });
  });

  describe('plantillas', () => {
    const contenidoVigente = async (tipo: ClaveCertificado = 'CONSTANCIA_ESTUDIO') => contenidoDe(await plantillaVigente(tipo));

    it('la primera vez nace con los valores de partida (versión 1, sin autor)', async () => {
      const p = await plantillaVigente('CONSTANCIA_ESTUDIO');
      expect(p).toMatchObject({ version: 1, estado: 'VIGENTE', publicada_por: null, vigencia_dias: 30 });
      expect(p.bloques.map((b) => b.id)).toContain('cuerpo');
    });

    it('el documento expedido congela el texto resuelto y la versión de la plantilla', async () => {
      const c = await expedir();
      const contenido = (c.snapshot as { contenido: { plantilla: { version: number }; bloques: Array<{ texto: string }> } }).contenido;
      expect(contenido.plantilla.version).toBe(1);
      expect(contenido.bloques.map((b) => b.texto).join(' ')).toContain('se encuentra matriculado(a) en esta institución y cursa el grado Sexto (Básica Secundaria)');
      expect(contenido.bloques.map((b) => b.texto).join(' ')).not.toContain('{{');
    });

    it('publicar una versión nueva cambia lo que se expida después, no lo ya expedido', async () => {
      const antes = await expedir();
      const borrador = await contenidoVigente();
      borrador.bloques.find((b) => b.id === 'cuerpo')!.texto += ' Texto agregado por el colegio.';
      const r = await plantillaServicio.publicarPlantilla('CONSTANCIA_ESTUDIO', borrador, 'Se agrega una frase', e.admin);
      expect(r.version).toBe(2);

      const despues = await expedir();
      const texto = (c: typeof antes) => (c.snapshot as { contenido: { bloques: Array<{ texto: string }> } }).contenido.bloques.map((b) => b.texto).join(' ');
      expect(texto(despues)).toContain('Texto agregado por el colegio.');
      expect(texto(antes)).not.toContain('Texto agregado por el colegio.');
      // El anterior se reimprime tal cual, y su huella sigue siendo válida.
      expect((await certificados.verificarIntegridad(String(antes._id), e.secretaria)).integro).toBe(true);
      await expect(pdf.generarPdfDeCertificado(String(antes._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
      expect(await PlantillaCertificado.countDocuments({ tipo: 'CONSTANCIA_ESTUDIO', estado: 'VIGENTE' })).toBe(1);
      expect(await PlantillaCertificado.countDocuments({ tipo: 'CONSTANCIA_ESTUDIO', estado: 'ARCHIVADA' })).toBe(1);
    });

    it('no se publica una plantilla que pierde lo mínimo del documento, y se listan todos los problemas', async () => {
      const borrador = await contenidoVigente('CERTIFICADO_ESTUDIOS');
      borrador.bloques = borrador.bloques.filter((b) => b.id !== 'notas' && b.id !== 'promocion');
      await expect(plantillaServicio.publicarPlantilla('CERTIFICADO_ESTUDIOS', borrador, '', e.admin)).rejects.toMatchObject({
        statusCode: 400,
        details: expect.arrayContaining([expect.stringMatching(/«notas» es obligatorio/), expect.stringMatching(/«promocion» es obligatorio/)]),
      });
      expect((await plantillaVigente('CERTIFICADO_ESTUDIOS')).version).toBe(1);
    });

    it('publicar sin cambios responde 409', async () => {
      await expect(plantillaServicio.publicarPlantilla('PAZ_SALVO', await contenidoVigente('PAZ_SALVO'), '', e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('el texto de un documento activo solo lo ve y edita el administrador', async () => {
      // Secretaría solo redacta borradores: de los tipos activos no ve ni publica nada.
      expect((await plantillaServicio.listarPlantillas(e.secretaria)).plantillas).toEqual([]);
      await expect(plantillaServicio.listarPlantillas(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(plantillaServicio.publicarPlantilla('PAZ_SALVO', await contenidoVigente('PAZ_SALVO'), '', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(plantillaServicio.versionesDePlantilla('PAZ_SALVO', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(plantillaServicio.restablecerPlantilla('PAZ_SALVO', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      const r = await plantillaServicio.listarPlantillas(e.admin);
      expect(r.plantillas.map((p) => p.tipo)).toEqual(['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA', 'PAZ_SALVO', 'CERTIFICADO_ESTUDIOS']);
      expect(r.variables.length).toBeGreaterThan(20);
    });

    it('el historial guarda quién publicó cada versión, y restablecer crea una versión nueva sin perder la historia', async () => {
      const borrador = await contenidoVigente();
      borrador.vigencia_dias = 60;
      await plantillaServicio.publicarPlantilla('CONSTANCIA_ESTUDIO', borrador, 'Vigencia a 60 días', e.admin);
      await plantillaServicio.restablecerPlantilla('CONSTANCIA_ESTUDIO', e.admin);
      const versiones = await plantillaServicio.versionesDePlantilla('CONSTANCIA_ESTUDIO', e.admin);
      expect(versiones.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(versiones.map((v) => v.estado)).toEqual(['VIGENTE', 'ARCHIVADA', 'ARCHIVADA']);
      expect(versiones[1]!.publicada_por).toContain(e.admin.nombre);
      expect(versiones[2]!.publicada_por).toBe('Sistema');
      expect((await contenidoVigente()).vigencia_dias).toBe(30);
      expect(await AuditLog.countDocuments({ accion: 'CERTIFICADO_PLANTILLA_PUBLICADA' })).toBe(2);
    });

    it('una versión publicada no se edita en el modelo', async () => {
      const p = await plantillaVigente('PAZ_SALVO');
      p.set('titulo', 'Otro título');
      await expect(p.save()).rejects.toThrow(/no se puede modificar/);
    });

    it('las opciones del selector al expedir salen de la plantilla vigente', async () => {
      const borrador = await contenidoVigente();
      borrador.destinatarios.push({ clave: 'SUBSIDIO_TRANSPORTE', etiqueta: 'Subsidio de transporte', frase: 'Se expide para el subsidio de transporte escolar' });
      await plantillaServicio.publicarPlantilla('CONSTANCIA_ESTUDIO', borrador, '', e.admin);
      const vista = await configuracion.vistaConfiguracion(e.secretaria);
      expect(vista.tipos[0]!.destinatarios.map((d) => d.clave)).toContain('SUBSIDIO_TRANSPORTE');
      const c = await expedir({ destinatario: { clave: 'SUBSIDIO_TRANSPORTE' } });
      expect((c.snapshot as { destino: { frase: string } }).destino.frase).toBe('Se expide para el subsidio de transporte escolar');
    });

    it('si falta un dato que la plantilla exige, no se expide y dice cuál', async () => {
      const borrador = await contenidoVigente();
      borrador.bloques.find((b) => b.id === 'cuerpo')!.texto += ' Departamento: {{institucion.departamento}}.';
      await plantillaServicio.publicarPlantilla('CONSTANCIA_ESTUDIO', borrador, '', e.admin);
      await expect(expedir()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Falta el dato «Departamento».*M01/) });
      await Institution.updateOne({}, { departamento: 'Cundinamarca' });
      await expect(expedir()).resolves.toBeDefined();
    });

    it('la vista previa de una plantilla usa un estudiante inventado, no guarda nada y valida antes', async () => {
      const antes = await CertificadoEmitido.countDocuments();
      const buffer = await pdf.generarVistaPreviaDePlantillaPdf('CERTIFICADO_ESTUDIOS', await contenidoVigente('CERTIFICADO_ESTUDIOS'), e.admin);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect(await CertificadoEmitido.countDocuments()).toBe(antes);
      const invalido = await contenidoVigente();
      invalido.bloques.find((b) => b.id === 'cuerpo')!.texto = 'Que {{estudiante.edad}}';
      await expect(pdf.generarVistaPreviaDePlantillaPdf('CONSTANCIA_ESTUDIO', invalido, e.admin)).rejects.toMatchObject({ statusCode: 400 });
      await expect(pdf.generarVistaPreviaDePlantillaPdf('CONSTANCIA_ESTUDIO', await contenidoVigente(), e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(pdf.generarVistaPreviaDePlantillaPdf('CONSTANCIA_ESTUDIO', await contenidoVigente(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('los documentos expedidos antes de las plantillas se siguen reimprimiendo como salieron', async () => {
      const c = await expedir();
      const crudo = await mongoose.connection.db!.collection('certificadoemitidos').findOne({ _id: c._id });
      const viejo = { ...(crudo!.snapshot as Record<string, unknown>) };
      delete viejo.contenido;
      // Un documento anterior no tiene `contenido`: se redacta con el texto de siempre, con su huella original recalculada.
      const { huellaDeCertificado } = await import('../../src/utils/certificados');
      const hash = huellaDeCertificado('secreto-de-certificados-de-pruebas', { tipo: 'CONSTANCIA_ESTUDIO', codigo: c.codigo, snapshot: viejo });
      await mongoose.connection.db!.collection('certificadoemitidos').updateOne({ _id: c._id }, { $set: { snapshot: viejo, hash } });
      const { buffer } = await pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('vista previa del documento de un estudiante', () => {
    it('se audita sin guardar contenido', async () => {
      await pdf.generarVistaPreviaPdf({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO' }, e.secretaria);
      const registros = await AuditLog.find({ accion: 'CERTIFICADO_VISTA_PREVIA' });
      expect(registros).toHaveLength(1);
      expect(registros[0]!.detalle).toBe('CONSTANCIA_ESTUDIO');
    });
  });
});
