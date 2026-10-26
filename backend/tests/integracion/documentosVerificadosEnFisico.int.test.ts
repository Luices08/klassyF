import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import { UserDocument } from '../../src/models/user.model';
import {
  cargarDocumento,
  createEnrollment,
  listarDocumentosPorRevisar,
  listarDocumentosPrevistos,
  marcarVerificacionFisica,
  revisarDocumento,
} from '../../src/services/enrollment.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);

// M04: secretaría ve los originales en el mostrador, la matrícula nace definitiva o condicional según lo entregado, y los archivos se suben después.
describe('M04: documentos verificados en físico', () => {
  let e: Escenario;
  let anio: string;
  let grupo: string;
  let obligatorios: string[];
  // Los del escenario ya traen una matrícula sembrada: aquí se matricula a quienes no la tienen.
  let alumno: UserDocument;
  let otroAlumno: UserDocument;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    alumno = await crearUsuario('ESTUDIANTE');
    otroAlumno = await crearUsuario('ESTUDIANTE');
    anio = String((await AcademicYear.findOne())!._id);
    grupo = String((await Group.findOne())!._id);
    obligatorios = (await listarDocumentosPrevistos({ group_id: grupo, tipo_ingreso: 'NUEVO' })).filter((d) => d.obligatorio).map((d) => d.tipo_documento);
  });

  const matricular = (u: UserDocument, extra: Record<string, unknown> = {}) =>
    createEnrollment({ student_id: u._id, group_id: grupo, academic_year_id: anio, tipo_ingreso: 'NUEVO', ...extra }, como(e.secretaria));
  const checklistDe = async (id: unknown) => (await Enrollment.findById(id))!.checklist;
  const itemDe = async (id: unknown, tipo: string) => (await checklistDe(id)).find((c) => c.tipo_documento === tipo)!;
  const ocupados = async () => (await Group.findById(grupo))!.cupos_ocupados;
  /** Los documentos aprobados porque se vieron en físico y que todavía no tienen archivo. */
  const verificadosSinArchivo = async () =>
    (await Enrollment.find({ academic_year_id: anio })).flatMap((m) => m.checklist).filter((c) => c.estado === 'APROBADO' && !c.archivo_path && c.fecha_verificacion_fisica);

  it('con todos los obligatorios entregados nace definitiva, sin acta ni fecha, y cada uno queda verificado en físico sin archivo', async () => {
    expect(obligatorios.length).toBeGreaterThan(0);
    const m = await matricular(alumno, { documentos_entregados: obligatorios });

    expect(m.estado).toBe('MATRICULADO_DEFINITIVO');
    expect(m.fecha_limite_compromiso).toBeNull();
    for (const tipo of obligatorios) {
      const item = await itemDe(m._id, tipo);
      expect(item).toMatchObject({ estado: 'APROBADO', archivo_path: null });
      expect(item.fecha_verificacion_fisica).toBeInstanceOf(Date);
      expect(String(item.revisado_por)).toBe(String(e.secretaria._id));
    }

    expect((await verificadosSinArchivo()).map((c) => c.tipo_documento).sort()).toEqual([...obligatorios].sort());
    // Ya están aprobados: no esperan revisión de nadie.
    expect((await listarDocumentosPorRevisar({ academic_year_id: anio })).total).toBe(0);
  });

  it('si falta un obligatorio nace condicional con su fecha, y lo que falta sigue pendiente (no queda marcado)', async () => {
    const faltante = obligatorios[0]!;
    const m = await matricular(alumno, { documentos_entregados: obligatorios.slice(1), fecha_limite_compromiso: PLAZO });

    expect(m.estado).toBe('MATRICULADO_CONDICIONAL');
    expect(m.fecha_limite_compromiso).toBeInstanceOf(Date);
    expect(await itemDe(m._id, faltante)).toMatchObject({ estado: 'PENDIENTE', fecha_verificacion_fisica: null });
    expect(await verificadosSinArchivo()).toHaveLength(obligatorios.length - 1);
  });

  it('una matrícula condicional exige la fecha del acta; sin ella no se crea nada ni se consume el cupo', async () => {
    const antes = await ocupados();
    const matriculasAntes = await Enrollment.countDocuments();
    await expect(matricular(alumno, { documentos_entregados: [] })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/fecha límite/i) });
    expect(await ocupados()).toBe(antes);
    expect(await Enrollment.countDocuments()).toBe(matriculasAntes);
  });

  it('marcar como entregado un documento que esa matrícula no pide es un error y no deja nada a medias', async () => {
    const antes = await ocupados();
    const matriculasAntes = await Enrollment.countDocuments();
    await expect(matricular(alumno, { documentos_entregados: [...obligatorios, 'CERTIFICADO_QUE_NO_SE_PIDE'], fecha_limite_compromiso: PLAZO })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/CERTIFICADO_QUE_NO_SE_PIDE/),
    });
    expect(await ocupados()).toBe(antes);
    expect(await Enrollment.countDocuments()).toBe(matriculasAntes);
  });

  it('el camino de siempre (documentacion_completa) sigue funcionando y también deja los documentos verificados en físico', async () => {
    const m = await matricular(alumno, { documentacion_completa: true });
    expect(m.estado).toBe('MATRICULADO_DEFINITIVO');
    expect(await verificadosSinArchivo()).toHaveLength(obligatorios.length);

    const condicional = await matricular(otroAlumno, { fecha_limite_compromiso: PLAZO });
    expect(condicional.estado).toBe('MATRICULADO_CONDICIONAL');
    expect((await checklistDe(condicional._id)).every((c) => c.estado === 'PENDIENTE')).toBe(true);
  });

  it('subir el archivo de un documento ya verificado deja de ser solo verificado en físico, sigue aprobado y no pasa por revisión', async () => {
    const tipo = obligatorios[0]!;
    const m = await matricular(alumno, { documentos_entregados: obligatorios });

    await cargarDocumento(String(m._id), tipo, 'uploads/matriculas/a.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });

    expect(await itemDe(m._id, tipo)).toMatchObject({ estado: 'APROBADO', archivo_path: 'uploads/matriculas/a.pdf' });
    const sinArchivo = await verificadosSinArchivo();
    expect(sinArchivo.map((c) => c.tipo_documento)).not.toContain(tipo);
    expect(sinArchivo).toHaveLength(obligatorios.length - 1);
    expect((await listarDocumentosPorRevisar({ academic_year_id: anio })).total).toBe(0);
  });

  it('marcar el documento que faltaba, en un solo paso o varios, pasa la condicional a definitiva', async () => {
    const m = await matricular(alumno, { documentos_entregados: [], fecha_limite_compromiso: PLAZO });
    expect(m.estado).toBe('MATRICULADO_CONDICIONAL');

    await marcarVerificacionFisica(String(m._id), obligatorios.slice(0, -1), true, { id: e.secretaria._id });
    expect((await Enrollment.findById(m._id))!.estado).toBe('MATRICULADO_CONDICIONAL');

    await marcarVerificacionFisica(String(m._id), obligatorios.slice(-1), true, { id: e.secretaria._id });
    const despues = (await Enrollment.findById(m._id))!;
    expect(despues.estado).toBe('MATRICULADO_DEFINITIVO');
    expect(despues.fecha_limite_compromiso).toBeNull();
  });

  it('deshacer una marca hecha por error devuelve el documento a pendiente y la definitiva a condicional', async () => {
    const m = await matricular(alumno, { documentos_entregados: obligatorios });
    const tipo = obligatorios[0]!;

    await marcarVerificacionFisica(String(m._id), [tipo], false, { id: e.secretaria._id });

    const despues = (await Enrollment.findById(m._id))!;
    expect(despues.estado).toBe('MATRICULADO_CONDICIONAL');
    expect(despues.checklist.find((c) => c.tipo_documento === tipo)).toMatchObject({ estado: 'PENDIENTE', fecha_verificacion_fisica: null, revisado_por: null });
  });

  it('es todo o nada: si uno de los documentos no se puede marcar, no se toca ninguno', async () => {
    const m = await matricular(alumno, { documentos_entregados: [], fecha_limite_compromiso: PLAZO });
    const [primero, segundo] = obligatorios as [string, string];
    await cargarDocumento(String(m._id), segundo, 'uploads/matriculas/b.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });

    await expect(marcarVerificacionFisica(String(m._id), [primero, segundo], true, { id: e.secretaria._id })).rejects.toMatchObject({ statusCode: 409 });
    expect(await itemDe(m._id, primero)).toMatchObject({ estado: 'PENDIENTE', fecha_verificacion_fisica: null });
  });

  it('no se marca ni se desmarca lo que ya tiene archivo, y rechazar un archivo anula lo que se había dado por bueno', async () => {
    const tipo = obligatorios[0]!;
    const m = await matricular(alumno, { documentos_entregados: obligatorios });
    await cargarDocumento(String(m._id), tipo, 'uploads/matriculas/a.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });

    await expect(marcarVerificacionFisica(String(m._id), [tipo], false, { id: e.secretaria._id })).rejects.toMatchObject({ statusCode: 409 });

    await revisarDocumento(String(m._id), tipo, { estado: 'RECHAZADO', comentario: 'Ilegible' }, { id: e.secretaria._id });
    expect(await itemDe(m._id, tipo)).toMatchObject({ estado: 'RECHAZADO', fecha_verificacion_fisica: null });
    expect((await verificadosSinArchivo()).map((c) => c.tipo_documento)).not.toContain(tipo);
  });

  it('una matrícula retirada ya no admite cambios en sus documentos', async () => {
    const m = await matricular(alumno, { documentos_entregados: [], fecha_limite_compromiso: PLAZO });
    await Enrollment.updateOne({ _id: m._id }, { estado: 'ANULADO' });
    await expect(marcarVerificacionFisica(String(m._id), obligatorios.slice(0, 1), true, { id: e.secretaria._id })).rejects.toMatchObject({ statusCode: 409 });
  });
});
