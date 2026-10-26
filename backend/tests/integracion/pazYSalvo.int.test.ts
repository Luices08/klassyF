import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import { UserDocument } from '../../src/models/user.model';
import {
  cargarDocumento,
  createEnrollment,
  listarDocumentosPorRevisar,
  revisarDocumento,
  sincronizarRequisitosMatricula,
  updateEnrollmentStatus,
} from '../../src/services/enrollment.service';
import { cargarPazYSalvo, listarPazYSalvo, revisarPazYSalvo } from '../../src/services/pazYSalvo.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);

// Documentos de matrícula (M04): compuerta de la definitiva, bandeja de revisión y paz y salvo de fin de año.
describe('M04: documentos de matrícula y paz y salvo de fin de año', () => {
  let e: Escenario;
  let anioActual: string;
  let anioSiguiente: string;
  let grupoSiguiente: string;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const actual = (await AcademicYear.findOne())!;
    anioActual = String(actual._id);
    const grupoActual = (await Group.findOne())!;
    const siguiente = await AcademicYear.create({
      institucion_id: actual.institucion_id,
      year: actual.year + 1,
      nombre: `Año ${actual.year + 1}`,
      calendario: 'A',
      fecha_inicio: new Date(Date.UTC(actual.year + 1, 0, 1)),
      fecha_fin: new Date(Date.UTC(actual.year + 1, 11, 31)),
      estado: 'PLANIFICACION',
      // Los periodos del año siguiente caen un año después: copiarlos tal cual los dejaba fuera del año lectivo.
      periodos: actual.periodos.map((p) =>
        Object.fromEntries(Object.entries(p.toObject()).map(([clave, valor]) => [clave, valor instanceof Date ? new Date(Date.UTC(valor.getUTCFullYear() + 1, valor.getUTCMonth(), valor.getUTCDate())) : valor]))
      ),
    });
    anioSiguiente = String(siguiente._id);
    const grupo = await Group.create({
      sede_id: grupoActual.sede_id,
      academic_year_id: siguiente._id,
      grade_id: grupoActual.grade_id,
      jornada_id: grupoActual.jornada_id,
      nomenclatura: '701',
      max_capacity: 40,
    });
    grupoSiguiente = String(grupo._id);
  });

  const matricularAntiguo = (estudiante: UserDocument) =>
    createEnrollment(
      { student_id: estudiante._id, group_id: grupoSiguiente, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', fecha_limite_compromiso: PLAZO },
      como(e.secretaria)
    );
  const itemPazYSalvo = async (id: unknown) =>
    (await Enrollment.findById(id))!.checklist.find((c) => c.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR')!;

  describe('compuerta de la matrícula definitiva', () => {
    it('una matrícula nueva nace definitiva solo si secretaría marca como entregados todos los obligatorios', async () => {
      const sinNada = await createEnrollment(
        { student_id: e.estudiante._id, group_id: grupoSiguiente, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', documentos_entregados: [], fecha_limite_compromiso: PLAZO },
        como(e.secretaria)
      );
      expect(sinNada.estado).toBe('MATRICULADO_CONDICIONAL');

      const obligatorios = sinNada.checklist.filter((c) => c.obligatorio !== false).map((c) => c.tipo_documento);
      const completa = await createEnrollment(
        { student_id: e.otroEstudiante._id, group_id: grupoSiguiente, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', documentos_entregados: obligatorios },
        como(e.secretaria)
      );
      expect(completa.estado).toBe('MATRICULADO_DEFINITIVO');
    });

    it('no pasa a definitiva con documentos obligatorios sin aprobar y dice cuáles', async () => {
      const matricula = await matricularAntiguo(e.estudiante);
      await expect(updateEnrollmentStatus(matricula._id, 'MATRICULADO_DEFINITIVO', undefined, { id: e.secretaria._id })).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/Paz y salvo de fin de año/),
      });
    });

    it('con todo aprobado pasa sola a definitiva y la transición manual también queda permitida', async () => {
      const matricula = await matricularAntiguo(e.estudiante);
      for (const item of (await Enrollment.findById(matricula._id))!.checklist) {
        await cargarDocumento(String(matricula._id), item.tipo_documento, 'ruta/falsa.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });
        await revisarDocumento(String(matricula._id), item.tipo_documento, { estado: 'APROBADO' }, { id: e.secretaria._id });
      }
      expect((await Enrollment.findById(matricula._id))!.estado).toBe('MATRICULADO_DEFINITIVO');
    });
  });

  describe('bandeja de documentos por revisar', () => {
    it('lista lo cargado y sin revisar, del más antiguo al más reciente, y deja de listar lo revisado', async () => {
      const a = await matricularAntiguo(e.estudiante);
      const b = await matricularAntiguo(e.otroEstudiante);
      // Un antiguo ya solo trae el paz y salvo del año anterior (lo demás lo tiene el colegio).
      await cargarDocumento(String(a._id), 'PAZ_Y_SALVO_ANIO_ANTERIOR', 'ruta/a.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });
      await cargarDocumento(String(b._id), 'PAZ_Y_SALVO_ANIO_ANTERIOR', 'ruta/b.pdf', { id: e.secretaria._id, tipo: 'PERSONAL' });

      const antes = await listarDocumentosPorRevisar({ academic_year_id: anioSiguiente });
      expect(antes.total).toBe(2);
      expect(antes.data.map((f) => f.tipo_documento)).toEqual(['PAZ_Y_SALVO_ANIO_ANTERIOR', 'PAZ_Y_SALVO_ANIO_ANTERIOR']);
      expect(antes.data[0]).toMatchObject({ grupo: '701', nombre: e.estudiante.nombre });

      await revisarDocumento(String(a._id), 'PAZ_Y_SALVO_ANIO_ANTERIOR', { estado: 'APROBADO' }, { id: e.secretaria._id });
      expect((await listarDocumentosPorRevisar({ academic_year_id: anioSiguiente })).total).toBe(1);
    });
  });

  describe('paz y salvo de fin de año', () => {
    const archivo = 'uploads/paz-y-salvo/x.pdf';

    it('con la opción apagada el docente no ve ni gestiona; el personal de matrículas sí', async () => {
      const vista = await listarPazYSalvo(como(e.docenteDeClase), { academic_year_id: anioActual });
      expect(vista).toMatchObject({ total: 0, puede: { ver: false } });
      await expect(cargarPazYSalvo(como(e.docenteDeClase), String(e.estudiante._id), anioActual, archivo)).rejects.toMatchObject({ statusCode: 403 });

      const secretaria = await listarPazYSalvo(como(e.secretaria), { academic_year_id: anioActual });
      expect(secretaria.resumen).toMatchObject({ total: 3, sin_cargar: 3 });
    });

    it('con la opción encendida el docente gestiona solo a los estudiantes de sus grupos y no quita confirmaciones', async () => {
      await Institution.updateOne({}, { paz_y_salvo_docentes: true });

      const propia = await listarPazYSalvo(como(e.docenteDeClase), { academic_year_id: anioActual });
      expect(propia.total).toBe(3);
      expect((await listarPazYSalvo(como(e.docenteAjeno), { academic_year_id: anioActual })).total).toBe(0);
      await expect(cargarPazYSalvo(como(e.docenteAjeno), String(e.estudiante._id), anioActual, archivo)).rejects.toMatchObject({ statusCode: 404 });

      const cargado = await cargarPazYSalvo(como(e.docenteDeClase), String(e.estudiante._id), anioActual, archivo);
      expect(cargado.estado).toBe('CARGADO');
      const confirmado = await revisarPazYSalvo(como(e.docenteDeClase), String(e.estudiante._id), anioActual, { estado: 'CONFIRMADO' });
      expect(confirmado).toMatchObject({ estado: 'CONFIRMADO', revisado_por_rol: 'DOCENTE' });

      await expect(cargarPazYSalvo(como(e.docenteDeClase), String(e.estudiante._id), anioActual, archivo)).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        revisarPazYSalvo(como(e.docenteDeClase), String(e.estudiante._id), anioActual, { estado: 'RECHAZADO', observacion: 'Se equivocó' })
      ).rejects.toMatchObject({ statusCode: 403 });
      await revisarPazYSalvo(como(e.secretaria), String(e.estudiante._id), anioActual, { estado: 'RECHAZADO', observacion: 'Debe libros' });
    });

    it('confirmar no exige archivo y rechazar exige el motivo', async () => {
      const sinArchivo = await revisarPazYSalvo(como(e.secretaria), String(e.estudiante._id), anioActual, { estado: 'CONFIRMADO' });
      expect(sinArchivo).toMatchObject({ estado: 'CONFIRMADO', archivo_path: null });
      await expect(revisarPazYSalvo(como(e.secretaria), String(e.otroEstudiante._id), anioActual, { estado: 'RECHAZADO' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('al matricular a quien ya tiene el paz y salvo confirmado, el documento nace aprobado', async () => {
      await revisarPazYSalvo(como(e.secretaria), String(e.estudiante._id), anioActual, { estado: 'CONFIRMADO' });
      const matricula = await matricularAntiguo(e.estudiante);
      expect(await itemPazYSalvo(matricula._id)).toMatchObject({ estado: 'APROBADO', archivo_path: null });
    });

    it('confirmar después aprueba el documento de la matrícula ya creada, y quitar la confirmación lo devuelve', async () => {
      const matricula = await matricularAntiguo(e.otroEstudiante);
      expect(await itemPazYSalvo(matricula._id)).toMatchObject({ estado: 'PENDIENTE' });

      await revisarPazYSalvo(como(e.secretaria), String(e.otroEstudiante._id), anioActual, { estado: 'CONFIRMADO' });
      expect(await itemPazYSalvo(matricula._id)).toMatchObject({ estado: 'APROBADO' });

      await revisarPazYSalvo(como(e.secretaria), String(e.otroEstudiante._id), anioActual, { estado: 'RECHAZADO', observacion: 'Faltó devolver un libro' });
      expect(await itemPazYSalvo(matricula._id)).toMatchObject({ estado: 'PENDIENTE' });
    });

    it('sincronizar requisitos agrega el documento a matrículas anteriores y lo aprueba si ya estaba confirmado', async () => {
      await revisarPazYSalvo(como(e.secretaria), String(e.tercerEstudiante._id), anioActual, { estado: 'CONFIRMADO' });
      const matricula = await matricularAntiguo(e.tercerEstudiante);
      await Enrollment.updateOne({ _id: matricula._id }, { $pull: { checklist: { tipo_documento: 'PAZ_Y_SALVO_ANIO_ANTERIOR' } } });
      await sincronizarRequisitosMatricula(String(matricula._id), { id: e.secretaria._id, tipo: 'PERSONAL' });
      expect(await itemPazYSalvo(matricula._id)).toMatchObject({ estado: 'APROBADO' });
    });
  });
});
