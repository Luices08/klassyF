import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import ConfiguracionCertificados from '../../src/models/configuracionCertificados.model';
import Enrollment from '../../src/models/enrollment.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import PlantillaCertificado from '../../src/models/plantillaCertificado.model';
import TipoCertificado from '../../src/models/tipoCertificado.model';
import * as certificados from '../../src/services/certificado.service';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as pdf from '../../src/services/certificadoPdf.service';
import * as plantillaServicio from '../../src/services/certificadoPlantilla.service';
import * as verificacion from '../../src/services/certificadoVerificacion.service';
import * as tipos from '../../src/services/tipoCertificado.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// `config/env` lee las variables al importarse: se fijan antes que cualquier import.
vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  process.env.CERT_HMAC_SECRET = 'secreto-de-certificados-de-pruebas';
});

const imagen = (nombre: string) => ({ buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png', originalname: nombre }) as unknown as Express.Multer.File;

describe('M26: tipos de documento configurables (con base de datos)', () => {
  let e: Escenario;
  let matriculaId: string;
  const anio = new Date().getFullYear();

  const matriculasDe = async () => (await certificados.matriculasExpedibles(String(e.estudiante._id), e.secretaria)).matriculas[0]!;
  const expedir = (extra: Partial<certificados.EntradaExpedicion> = {}) =>
    certificados.expedirCertificado({ enrollment_id: matriculaId, tipo: 'CONSTANCIA_ESTUDIO', solicitante: { tipo: 'TERCERO', nombre: 'Persona Autorizada', numero_documento: '555666', detalle: 'tía', presento_autorizacion: true } as const, ...extra }, e.secretaria);
  const textoVigente = async (clave: string) => plantillaServicio.contenidoDe(await plantillaServicio.plantillaVigente(clave));
  const entradaTipo = (extra: Partial<tipos.EntradaTipo> = {}): tipos.EntradaTipo => ({
    nombre: 'Constancia de conducta',
    descripcion: 'Acredita el comportamiento del estudiante.',
    prefijo: 'CC',
    estados_matricula: ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL'],
    fuentes: [],
    ...extra,
  });

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
    for (const elemento of ['rectoria', 'secretaria', 'sello'] as const) {
      const png = await QRCode.toBuffer(`imagen-${elemento}`, { margin: 1, width: 200 });
      await configuracion.guardarImagen(elemento, { ...imagen(`${elemento}.png`), buffer: png, size: png.length }, e.admin);
    }
  });

  it('los tipos de partida se siembran una sola vez: si el colegio elimina uno, no vuelve', async () => {
    expect((await tipos.todosLosTipos()).map((t) => t.clave)).toEqual(['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA', 'PAZ_SALVO', 'CERTIFICADO_ESTUDIOS']);
    expect((await tipos.todosLosTipos()).every((t) => t.estado === 'ACTIVO')).toBe(true);
    await tipos.eliminarTipo('PAZ_SALVO', e.secretaria);
    expect((await tipos.todosLosTipos()).map((t) => t.clave)).not.toContain('PAZ_SALVO');
    await expect(expedir({ tipo: 'PAZ_SALVO' })).rejects.toMatchObject({ statusCode: 404 });
    expect((await configuracion.vistaConfiguracion(e.admin)).tipos.map((t) => t.clave)).not.toContain('PAZ_SALVO');
  });

  it('una instalación anterior conserva su política por documento al sembrarse', async () => {
    await TipoCertificado.deleteMany({});
    await ConfiguracionCertificados.updateOne({}, { $set: { tipos_sembrados: false, politica: { CONSTANCIA_ESTUDIO: { rectoria: 'OBLIGATORIO', secretaria: 'NO_APLICA', sello: 'OPCIONAL_APAGADO' } } } });
    await tipos.asegurarTiposIniciales();
    expect((await tipos.tipoPorClave('CONSTANCIA_ESTUDIO')).politica).toEqual({ rectoria: 'OBLIGATORIO', secretaria: 'NO_APLICA', sello: 'OPCIONAL_APAGADO' });
    expect((await tipos.tipoPorClave('PAZ_SALVO')).politica.secretaria).toBe('OPCIONAL_ENCENDIDO');
  });

  it('Secretaría crea un tipo en borrador, lo redacta y lo prueba; el ADMIN lo activa y recién entonces se expide', async () => {
    const nuevo = await tipos.crearTipo(entradaTipo(), e.secretaria);
    expect(nuevo).toMatchObject({ clave: 'CONSTANCIA_DE_CONDUCTA', estado: 'BORRADOR', prefijo: 'CC', emitidos: 0 });

    await expect(expedir({ tipo: nuevo.clave })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/en borrador/) });
    expect((await matriculasDe()).tipos).not.toContain(nuevo.clave);
    // La vista previa sí funciona en borrador: así se prueba el texto antes de activarlo.
    const previa = await pdf.generarVistaPreviaPdf({ enrollment_id: matriculaId, tipo: nuevo.clave }, e.secretaria);
    expect(previa.subarray(0, 4).toString()).toBe('%PDF');

    const texto = await textoVigente(nuevo.clave);
    texto.bloques.find((b) => b.id === 'cuerpo')!.texto += ' Su conducta ha sido ejemplar.';
    await plantillaServicio.publicarPlantilla(nuevo.clave, texto, 'Primer texto', e.secretaria);

    await expect(tipos.activarTipo(nuevo.clave, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    expect((await tipos.activarTipo(nuevo.clave, e.admin)).estado).toBe('ACTIVO');
    expect((await matriculasDe()).tipos).toContain(nuevo.clave);

    const documento = await expedir({ tipo: nuevo.clave });
    expect(documento.codigo).toBe(`CC-${anio}-0001`);
    expect((await expedir({ tipo: nuevo.clave })).codigo).toBe(`CC-${anio}-0002`);
    const contenido = (documento.snapshot as { contenido: { bloques: Array<{ texto: string }> } }).contenido;
    expect(contenido.bloques.map((b) => b.texto).join(' ')).toContain('Su conducta ha sido ejemplar.');
    expect(await AuditLog.countDocuments({ accion: { $in: ['CERTIFICADO_TIPO_CREADO', 'CERTIFICADO_TIPO_ACTIVADO'] } })).toBe(2);
  });

  it('un tipo activo solo lo edita el administrador; Secretaría no puede ni redactar su texto', async () => {
    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    await tipos.activarTipo(t.clave, e.admin);
    await expect(tipos.actualizarTipo(t.clave, { nombre: 'Otro nombre' }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(plantillaServicio.publicarPlantilla(t.clave, await textoVigente(t.clave), '', e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    expect((await tipos.actualizarTipo(t.clave, { nombre: 'Constancia de buen comportamiento' }, e.admin)).nombre).toBe('Constancia de buen comportamiento');
    await expect(tipos.crearTipo(entradaTipo(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('el prefijo no se repite y las claves de los tipos de partida no se reutilizan', async () => {
    await tipos.crearTipo(entradaTipo(), e.secretaria);
    await expect(tipos.crearTipo(entradaTipo({ nombre: 'Otra constancia' }), e.secretaria)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/prefijo «CC»/) });
    await expect(tipos.crearTipo(entradaTipo({ nombre: 'Otra', prefijo: 'CE' }), e.secretaria)).rejects.toMatchObject({ statusCode: 409 });
    const reutiliza = await tipos.crearTipo(entradaTipo({ nombre: 'Paz salvo', prefijo: 'PZ' }), e.secretaria);
    expect(reutiliza.clave).toBe('PAZ_SALVO_2');
  });

  it('un tipo con la fuente de dependencias pide confirmar cada una al expedir', async () => {
    const t = await tipos.crearTipo(entradaTipo({ nombre: 'Salida del colegio', prefijo: 'SC', fuentes: ['DEPENDENCIAS'] }), e.secretaria);
    await tipos.activarTipo(t.clave, e.admin);
    await expect(expedir({ tipo: t.clave, dependencias: [] })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Falta confirmar/) });
    const c = await expedir({ tipo: t.clave, dependencias: ['academica', 'biblioteca', 'financiera', 'inventario'] });
    expect((c.snapshot as { paz_y_salvo: { dependencias: string[] } }).paz_y_salvo.dependencias).toHaveLength(4);
  });

  it('un tipo con valoraciones no se expide como oficial mientras falte el concepto de promoción', async () => {
    const t = await tipos.crearTipo(entradaTipo({ nombre: 'Constancia de notas', prefijo: 'CN', fuentes: ['VALORACIONES'] }), e.secretaria);
    await tipos.activarTipo(t.clave, e.admin);
    expect((await matriculasDe()).restricciones[t.clave]).toMatch(/promoción/);
    await expect(expedir({ tipo: t.clave })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('no se activa un tipo cuyo texto pierde lo que el ADMIN exige', async () => {
    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    await tipos.actualizarTipo(t.clave, { variables_obligatorias: ['matricula.registro_libro'] }, e.admin);
    await expect(tipos.activarTipo(t.clave, e.admin)).rejects.toMatchObject({ statusCode: 409, details: expect.arrayContaining([expect.stringMatching(/Asiento en el Libro de Matrícula/)]) });
    await expect(tipos.actualizarTipo(t.clave, { variables_obligatorias: ['inventada.variable'] }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(tipos.actualizarTipo(t.clave, { variables_obligatorias: ['matricula.fecha'] }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('prefijo y fuentes solo cambian mientras es borrador y no se ha expedido nada', async () => {
    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    expect((await tipos.actualizarTipo(t.clave, { prefijo: 'cx', fuentes: ['DEPENDENCIAS'] }, e.secretaria)).prefijo).toBe('CX');
    await tipos.activarTipo(t.clave, e.admin);
    await expect(tipos.actualizarTipo(t.clave, { prefijo: 'CY' }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(tipos.actualizarTipo(t.clave, { fuentes: [] }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('eliminar un tipo que nunca se usó borra también sus textos', async () => {
    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    await plantillaServicio.plantillaVigente(t.clave);
    expect(await PlantillaCertificado.countDocuments({ tipo: t.clave })).toBe(1);
    await tipos.eliminarTipo(t.clave, e.secretaria);
    expect(await TipoCertificado.countDocuments({ clave: t.clave })).toBe(0);
    expect(await PlantillaCertificado.countDocuments({ tipo: t.clave })).toBe(0);
    expect(await AuditLog.countDocuments({ accion: 'CERTIFICADO_TIPO_ELIMINADO' })).toBe(1);
  });

  it('un tipo con documentos expedidos no se elimina: se archiva y lo expedido sigue vigente', async () => {
    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    await tipos.activarTipo(t.clave, e.admin);
    const c = await expedir({ tipo: t.clave });
    await expect(tipos.eliminarTipo(t.clave, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Archívalo/) });

    expect((await tipos.archivarTipo(t.clave, e.secretaria)).estado).toBe('ARCHIVADO');
    await expect(expedir({ tipo: t.clave })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/archivado/) });
    expect((await matriculasDe()).tipos).not.toContain(t.clave);

    // Lo ya expedido: se verifica por QR, se reimprime y conserva su nombre.
    const v = await verificacion.verificarCertificado({ token: c.token_verificacion });
    expect(v).toMatchObject({ resultado: 'VALIDO', tipo: 'Constancia de conducta', codigo: c.codigo });
    expect((await certificados.verificarIntegridad(String(c._id), e.secretaria)).integro).toBe(true);
    await expect(pdf.generarPdfDeCertificado(String(c._id), 'https://colegio.test', e.secretaria)).resolves.toBeDefined();
    const historial = await certificados.listarCertificados({ tipo: t.clave, pagina: 1, limite: 10 }, e.secretaria);
    expect(historial.data[0]).toMatchObject({ nombre_tipo: 'Constancia de conducta', codigo: c.codigo });

    // El ADMIN lo puede volver a activar; Secretaría no.
    await expect(tipos.activarTipo(t.clave, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    expect((await tipos.activarTipo(t.clave, e.admin)).estado).toBe('ACTIVO');
  });

  it('la política de firmas y sello vive en cada tipo y solo la cambia el ADMIN', async () => {
    await configuracion.actualizarConfiguracion({ politica: { PAZ_SALVO: { sello: 'OBLIGATORIO' } } }, e.admin);
    expect((await tipos.tipoPorClave('PAZ_SALVO')).politica.sello).toBe('OBLIGATORIO');
    const vista = await configuracion.vistaConfiguracion(e.admin);
    expect(vista.tipos.find((t) => t.clave === 'PAZ_SALVO')!.elementos.sello.bloqueado).toBe(true);
    await expect(configuracion.actualizarConfiguracion({ politica: { PAZ_SALVO: { sello: 'NO_APLICA' } } }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(configuracion.actualizarConfiguracion({ politica: { NO_EXISTE: { sello: 'NO_APLICA' } } }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('la vista en vivo del editor devuelve el texto resuelto con datos de muestra y no falla por un borrador a medias', async () => {
    const t = await tipos.crearTipo(entradaTipo({ nombre: 'Constancia de notas', prefijo: 'CN', fuentes: ['VALORACIONES'] }), e.secretaria);
    const texto = await textoVigente(t.clave);
    const r = await plantillaServicio.renderizarBorrador(t.clave, texto, e.secretaria);
    expect(r.bloques.map((b) => b.texto).join(' ')).toContain('PÉREZ GÓMEZ ANA MARÍA');
    expect(r.problemas).toEqual([]);
    expect(r.faltantes).toEqual([]);
    expect(r.tabla?.columnas.length).toBeGreaterThan(0);
    expect(r.encabezado.institucion).toBe('Colegio de prueba');

    // Un borrador con errores no tira una excepción: los lista para que el editor los muestre mientras se redacta.
    texto.bloques.find((b) => b.id === 'cuerpo')!.texto = 'Que {{estudiante.edad}}';
    const roto = await plantillaServicio.renderizarBorrador(t.clave, texto, e.secretaria);
    expect(roto.problemas.join(' ')).toMatch(/variable desconocida/);
    expect(roto.faltantes.join(' ')).toMatch(/estudiante.edad/);
    // No guarda nada: solo existe la versión de partida.
    expect(await PlantillaCertificado.countDocuments({ tipo: t.clave })).toBe(1);

    // Con el tipo activo, Secretaría ya no redacta; el ADMIN sí.
    await tipos.activarTipo(t.clave, e.admin);
    await expect(plantillaServicio.renderizarBorrador(t.clave, texto, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(plantillaServicio.renderizarBorrador(t.clave, texto, e.admin)).resolves.toBeDefined();
  });

  it('el responsable legal solo se lee y se congela si el texto del tipo lo usa', async () => {
    const acudiente = await Guardian.create({ tipo_documento: 'CC', numero_documento: '79000111', nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001234567' });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: acudiente._id, parentesco: 'PADRE', es_principal: true });

    // Una constancia cuyo texto no nombra al acudiente no lo lleva: no se copian datos que el documento no usa.
    const sin = await expedir({ tipo: 'CONSTANCIA_ESTUDIO' });
    expect((sin.snapshot as { acudiente: unknown }).acudiente).toBeNull();

    const t = await tipos.crearTipo(entradaTipo(), e.secretaria);
    const texto = await textoVigente(t.clave);
    texto.bloques.push({ id: 'acudiente', estilo: 'CUERPO', texto: 'Acudiente: {{acudiente.nombre}}.', condicion: { variable: 'acudiente.nombre', tipo: 'HAY' }, activo: true });
    await plantillaServicio.publicarPlantilla(t.clave, texto, '', e.secretaria);
    await tipos.activarTipo(t.clave, e.admin);
    const con = await expedir({ tipo: t.clave });
    expect((con.snapshot as { acudiente: { nombre: string } }).acudiente.nombre).toBe('Luis Pérez');
    expect((con.snapshot as { contenido: { bloques: Array<{ texto: string }> } }).contenido.bloques.map((b) => b.texto).join(' ')).toContain('Acudiente: LUIS PÉREZ.');
  });
});
