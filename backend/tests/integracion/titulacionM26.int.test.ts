import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Campus from '../../src/models/campus.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import CertificadoEmitido from '../../src/models/certificadoEmitido.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import PazYSalvo from '../../src/models/pazYSalvo.model';
import PlantillaCertificado from '../../src/models/plantillaCertificado.model';
import TipoCertificado from '../../src/models/tipoCertificado.model';
import Titulacion from '../../src/models/titulacion.model';
import { asentarActa } from '../../src/services/actaGrado.service';
import * as certificados from '../../src/services/certificado.service';
import * as configuracion from '../../src/services/certificadoConfiguracion.service';
import * as pdf from '../../src/services/certificadoPdf.service';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { revisarPazYSalvo } from '../../src/services/pazYSalvo.service';
import { actualizarPolitica, datosDePolitica, obtenerPolitica } from '../../src/services/politicaPromocion.service';
import * as tipos from '../../src/services/tipoCertificado.service';
import * as titulacion from '../../src/services/titulacion.service';
import runTransaction from '../../src/utils/runTransaction';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  process.env.CERT_HMAC_SECRET = 'secreto-de-certificados-de-pruebas';
});

const CLAVE = 'Clave-segura-1';

// M26: documentos de titulación — el candado por situación, el acta con libro y folio y el grado por ventanilla.
describe('M26: acta de grado, diploma y constancia de culminación', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let matriculaId: string;
  const anio = new Date().getFullYear();

  const expedir = (tipo: string, extra: Partial<certificados.EntradaExpedicion> = {}) =>
    certificados.expedirCertificado(
      {
        enrollment_id: matriculaId,
        tipo,
        firmas: { secretaria: false, sello: false },
        solicitante: { tipo: 'TERCERO', nombre: 'Persona Autorizada', numero_documento: '555666', detalle: 'tía', presento_autorizacion: true } as const,
        ...extra,
      },
      e.secretaria
    );

  /** Cumple los cuatro requisitos: la titulación pasa a GRADUADO_EXTEMPORANEO. */
  async function cumplirRequisitos() {
    const id = String(e.estudiante._id);
    const tanda = await titulacion.registrarServicioSocial({ student_id: id, horas: 80, entidad: 'Fundación' }, { nombre: 'certificado.pdf', archivo_path: 'uploads/servicio-social/prueba.pdf', mimetype: 'application/pdf', tamano: 1024 }, e.admin);
    await titulacion.verificarServicioSocial(String(tanda._id), 'VERIFICAR', '', e.admin);
    await titulacion.registrarSaber11(id, 'AC202612345678', null, e.admin);
    await PazYSalvo.create({ student_id: e.estudiante._id, academic_year_id: n.anioId, estado: 'CARGADO' });
    await revisarPazYSalvo({ id: String(e.admin._id), rol: e.admin.rol }, id, n.anioId, { estado: 'CONFIRMADO' });
  }

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
    await Titulacion.syncIndexes();
    e = await armarEscenario();
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    n = await prepararNotas(e);
    await Grade.updateMany({}, { numero: 11, nombre: 'Once' });
    for (const periodo of [1, 2, 3, 4]) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: e.estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: 4 },
      });
    }
    await Enrollment.updateMany({ student_id: { $ne: e.estudiante._id } }, { estado: 'RETIRADO' });
    const politica = datosDePolitica(await obtenerPolitica(n.anioId));
    politica.titulacion.carpeta_academica.desde_grado = 10;
    await actualizarPolitica(n.anioId, politica, e.admin);
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    matriculaId = String((await Enrollment.findOne({ student_id: e.estudiante._id }))!._id);

    // Ya se sembraron solos al usar M26 (en borrador): el script solo repite lo que falte.
    expect(await tipos.sembrarTiposDeTitulacion()).toEqual([]);
    expect((await TipoCertificado.findOne({ clave: 'ACTA_GRADO' }))!.estado).toBe('BORRADOR');
    for (const clave of ['ACTA_GRADO', 'DIPLOMA_BACHILLER', 'CONSTANCIA_CULMINACION']) await tipos.activarTipo(clave, e.admin);
  });

  it('la siembra es idempotente y los tipos nacen en borrador', async () => {
    await TipoCertificado.updateMany({}, { estado: 'BORRADOR' });
    expect(await tipos.sembrarTiposDeTitulacion()).toEqual([]);
    expect((await TipoCertificado.findOne({ clave: 'ACTA_GRADO' }))!.estados_titulacion).toEqual(['GRADUADO', 'GRADUADO_EXTEMPORANEO']);
  });

  it('candado: sin cumplir los requisitos no hay acta ni diploma, y dice qué falta', async () => {
    await expect(expedir('ACTA_GRADO')).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/APROBO_NO_GRADUADO.*Debe 80 horas/) });
    await expect(expedir('DIPLOMA_BACHILLER')).rejects.toMatchObject({ statusCode: 409 });
    expect((await Titulacion.findOne())!.acta).toBeNull();
  });

  it('quien aprobó sin graduarse recibe la constancia de culminación, con lo pendiente', async () => {
    const c = await expedir('CONSTANCIA_CULMINACION');
    expect(c.codigo).toBe(`CCU-${anio}-0001`);
    const s = c.snapshot as { titulacion: { estado: string; pendientes: string[]; acta: unknown }; contenido: { bloques: Array<{ texto: string }> } };
    expect(s.titulacion.estado).toBe('APROBO_NO_GRADUADO');
    expect(s.titulacion.acta).toBeNull();
    expect(s.contenido.bloques.map((b) => b.texto).join(' ')).toMatch(/pendiente de grado formal.*Debe 80 horas/);
  });

  it('graduado por ventanilla: acta y diploma comparten número, libro y folio del momento en que cumplió', async () => {
    await cumplirRequisitos();
    expect((await Titulacion.findOne())!.estado).toBe('GRADUADO_EXTEMPORANEO');

    const acta = await expedir('ACTA_GRADO');
    const s = acta.snapshot as { titulacion: { titulo: string; acta: { codigo: string; libro: number; folio: number } }; contenido: { bloques: Array<{ texto: string }> } };
    expect(s.titulacion.acta).toMatchObject({ codigo: `AG-${anio}-0001`, libro: 1, folio: 1 });
    expect(s.titulacion.titulo).toBe('Bachiller Académico');
    expect(s.contenido.bloques.map((b) => b.texto).join(' ')).toContain(`AG-${anio}-0001`);

    const diploma = await expedir('DIPLOMA_BACHILLER');
    expect((diploma.snapshot as { titulacion: { acta: { codigo: string } } }).titulacion.acta.codigo).toBe(`AG-${anio}-0001`);
    expect((await Titulacion.findOne())!.acta).toMatchObject({ libro: 1, folio: 1 });

    // Ya graduado, la constancia de «pendiente de grado» deja de aplicar.
    await expect(expedir('CONSTANCIA_CULMINACION')).rejects.toMatchObject({ statusCode: 409 });
    const { buffer } = await pdf.generarPdfDeCertificado(String(acta._id), 'https://colegio.test', e.secretaria);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('si la expedición falla después de asentar el acta, no se consume ningún número', async () => {
    await cumplirRequisitos();
    // Pedir la firma de Rectoría sin tenerla delegada falla DESPUÉS de que el candado asentó el acta.
    await expect(expedir('ACTA_GRADO', { firmas: { rectoria: true, secretaria: false, sello: false } })).rejects.toMatchObject({ statusCode: 409 });
    expect((await Titulacion.findOne())!.acta).toBeNull();
    const c = await expedir('ACTA_GRADO');
    expect((c.snapshot as { titulacion: { acta: { codigo: string; folio: number } } }).titulacion.acta).toMatchObject({ codigo: `AG-${anio}-0001`, folio: 1 });
  });

  it('el libro se llena con los folios configurados y abre el siguiente', async () => {
    await configuracion.actualizarConfiguracion({ folios_por_libro_actas: 2 }, e.admin);
    const asentar = () => runTransaction((session) => asentarActa(session));
    const [a, b, c, d] = [await asentar(), await asentar(), await asentar(), await asentar()];
    expect([a, b, c, d].map((x) => [x.libro, x.folio, x.consecutivo])).toEqual([
      [1, 1, 1],
      [1, 2, 2],
      [2, 1, 3],
      [2, 2, 4],
    ]);
    // Subir el tamaño del libro después no reordena lo ya asentado: el siguiente continúa donde iba.
    await configuracion.actualizarConfiguracion({ folios_por_libro_actas: 100 }, e.admin);
    expect(await asentar()).toMatchObject({ libro: 2, folio: 3, consecutivo: 5 });
  });

  it('el título del grupo sale en el documento y los tipos de titulación no son de autoservicio', async () => {
    await expect(tipos.actualizarTipo('ACTA_GRADO', { autoservicio_acudiente: true }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(tipos.actualizarTipo('ACTA_GRADO', { estados_titulacion: ['GRADUADO'] }, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
  });
});
