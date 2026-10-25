import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FormatoEvidencia } from '../../src/constants/actividades';
import AcademicYear from '../../src/models/academicYear.model';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import AuditLog from '../../src/models/auditLog.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import * as entregas from '../../src/services/actividadEntrega.service';
import * as actividades from '../../src/services/activity.service';
import { hoyColombia } from '../../src/services/attendance.service';
import * as notas from '../../src/services/notas.service';
import { depurarArchivosDePeriodo } from '../../src/services/purgaAlmacenamiento.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { crearPlanAula } from './escenarioNotas';

const DIA_MS = 86_400_000;
const pdf = (nombre = 'tarea.pdf') => ({ buffer: Buffer.from(`%PDF-1.4 ${nombre}`), mimetype: 'application/pdf', originalname: nombre });

function proximoDiaHabil(desdeDias: number): Date {
  const dia = hoyColombia();
  dia.setUTCDate(dia.getUTCDate() + desdeDias);
  while ([0, 6].includes(dia.getUTCDay())) dia.setUTCDate(dia.getUTCDate() + 1);
  return new Date(dia.getTime() + 17 * 3_600_000);
}

const existe = (ruta: string) =>
  fs.access(path.resolve(process.cwd(), ruta)).then(
    () => true,
    () => false
  );

describe('Depuración de archivos de entregas (con base de datos y disco)', () => {
  let e: Escenario;
  let asignacion: TeacherAssignmentDocument;
  let docente: UserDocument;
  let periodoId: string;
  /** Cuarenta días después de hoy: ya pasaron los 30 de espera tras el fin del periodo y de la entrega. */
  const en40Dias = () => new Date(Date.now() + 40 * DIA_MS);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await detenerBaseDeDatos();
    await fs.rm(path.join(UPLOADS_ROOT, 'actividades'), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes()]);
    e = await armarEscenario();
    docente = e.docenteDeClase;
    asignacion = (await TeacherAssignment.findOne({ docente_id: docente._id }))!;

    const anio = (await AcademicYear.findOne())!;
    const dia = (offset: number) => new Date(hoyColombia().getTime() + offset * DIA_MS);
    anio.set('fecha_inicio', dia(-100));
    anio.set('fecha_fin', dia(300));
    anio.set(
      'periodos',
      [
        [1, -100, 100],
        [2, 101, 200],
        [3, 201, 250],
        [4, 251, 300],
      ].map(([numero, inicio, fin]) => ({
        numero,
        nombre: `Periodo ${numero}`,
        porcentaje: numero === 1 || numero === 2 ? 30 : 20,
        fecha_inicio: dia(inicio as number),
        fecha_fin: dia(fin as number),
        estado: 'ABIERTO',
      }))
    );
    await anio.save();
    periodoId = String(anio.periodos.find((p) => p.numero === 1)!._id);
    await crearPlanAula(asignacion, 1, 'APROBADO');
  }, 60_000);

  const programar = async (extra: Partial<actividades.CreateActivityInput> = {}) =>
    String(
      (
        await actividades.createActivity(
          {
            teacher_assignment_id: String(asignacion._id),
            periodo_numero: 1,
            titulo: 'Taller',
            descripcion: 'Resuelve.',
            tipo: 'TAREA',
            componente_siee: 'COGNITIVO_SABER',
            peso_en_componente: 1,
            fecha_apertura: new Date(Date.now() - 3_600_000),
            fecha_entrega: proximoDiaHabil(3),
            requiere_entrega: true,
            formatos_permitidos: ['PDF'] as FormatoEvidencia[],
            permite_entrega_tardia: false,
            ...extra,
          },
          docente
        )
      )._id
    );

  const cerrarPeriodo = () => AcademicYear.updateOne({ 'periodos._id': periodoId }, { $set: { 'periodos.$.estado': 'CERRADO' } });

  async function entregaCalificada() {
    const id = await programar();
    await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
    await notas.gradeActivity(id, [{ student_id: String(e.estudiante._id), calificacion_numerica: 4.5, retroalimentacion: 'Muy bien' }], docente);
    await cerrarPeriodo();
    return { id, antes: (await ActivitySubmission.findOne({ activity_id: id }).lean())! };
  }

  it('solo depura periodos CERRADOS y rechaza identificadores inexistentes', async () => {
    await expect(depurarArchivosDePeriodo(periodoId, { dias: 0 })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ABIERTO.*solo se depuran/) });
    await expect(depurarArchivosDePeriodo('no-es-un-id', { dias: 0 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(depurarArchivosDePeriodo('65f1a2b3c4d5e6f708192a3b', { dias: 0 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('borra el archivo físico y conserva intactas la nota, la retroalimentación y las fechas', async () => {
    const { id, antes } = await entregaCalificada();
    expect(await existe(antes.archivo_path!)).toBe(true);

    const ahora = en40Dias();
    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 30, ahora });
    expect(resumen).toMatchObject({ archivos_borrados: 1, entregas_afectadas: 1, archivos_ya_ausentes: 0, archivos_recientes: 0, errores: [] });
    expect(resumen.bytes_liberados).toBe(antes.intentos[0]!.archivos[0]!.bytes);
    expect(await existe(antes.archivo_path!)).toBe(false);

    const despues = (await ActivitySubmission.findOne({ activity_id: id }).lean())!;
    expect(despues.calificacion_numerica).toBe(4.5);
    expect(despues.retroalimentacion).toBe('Muy bien');
    expect(despues.estado).toBe('CALIFICADA');
    expect(despues.fecha_entrega).toEqual(antes.fecha_entrega);
    expect(despues.fecha_calificacion).toEqual(antes.fecha_calificacion);
    expect(despues.con_retraso).toBe(antes.con_retraso);
    expect(despues.historial_notas).toEqual(antes.historial_notas);
    expect(despues.updatedAt).toEqual(antes.updatedAt);

    expect(despues.archivo_path).toBeNull();
    expect(despues.intentos[0]!.archivo_path).toBeNull();
    expect(despues.intentos[0]!.archivos[0]).toMatchObject({ path: null, purgado: true, nombre: 'tarea.pdf' });
    expect(despues.intentos[0]!.archivos[0]!.fecha_purga).toEqual(ahora);

    expect(await AuditLog.countDocuments({ accion: 'ALMACENAMIENTO_ARCHIVOS_DEPURADOS' })).toBe(1);
  });

  it('la API muestra la entrega como depurada: sin descarga, con nota y retroalimentación', async () => {
    const { id } = await entregaCalificada();
    await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });

    const detalle = await entregas.detalleParaEstudiante(id, e.estudiante);
    expect(detalle.entrega).toMatchObject({
      tiene_archivo: false,
      archivo_purgado: true,
      calificacion_numerica: 4.5,
      retroalimentacion: 'Muy bien',
      intentos: [{ tiene_archivo: false, archivo_purgado: true, archivos: [{ indice: 0, nombre: 'tarea.pdf', purgado: true }] }],
    });

    const entregaId = String((await ActivitySubmission.findOne({ activity_id: id }))!._id);
    await expect(entregas.rutaDeEntrega(entregaId, e.estudiante)).rejects.toMatchObject({ statusCode: 410, message: expect.stringMatching(/depurado/) });
    await expect(entregas.rutaDeEntrega(entregaId, docente)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('respeta los días de espera y es idempotente', async () => {
    const { id, antes } = await entregaCalificada();

    const pronto = await depurarArchivosDePeriodo(periodoId, { dias: 30, ahora: new Date(Date.now() + 5 * DIA_MS) });
    expect(pronto).toMatchObject({ archivos_borrados: 0, archivos_recientes: 1, entregas_afectadas: 0 });
    expect(await existe(antes.archivo_path!)).toBe(true);
    expect((await ActivitySubmission.findOne({ activity_id: id }).lean())!.intentos[0]!.archivos[0]!.purgado).toBeFalsy();

    expect(await depurarArchivosDePeriodo(periodoId, { dias: 30, ahora: en40Dias() })).toMatchObject({ archivos_borrados: 1 });
    expect(await depurarArchivosDePeriodo(periodoId, { dias: 30, ahora: en40Dias() })).toMatchObject({ archivos_borrados: 0, entregas_afectadas: 0, errores: [] });
  });

  it('en simulación no toca el disco ni la base', async () => {
    const { id, antes } = await entregaCalificada();
    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, simular: true, ahora: en40Dias() });

    expect(resumen).toMatchObject({ simulacion: true, archivos_borrados: 1, entregas_afectadas: 1 });
    expect(await existe(antes.archivo_path!)).toBe(true);
    expect(await ActivitySubmission.findOne({ activity_id: id }).lean()).toEqual(antes);
    expect(await AuditLog.countDocuments({ accion: 'ALMACENAMIENTO_ARCHIVOS_DEPURADOS' })).toBe(0);
  });

  it('si el archivo ya no estaba en disco igual lo marca como depurado, sin contarlo como liberado', async () => {
    const { id, antes } = await entregaCalificada();
    await fs.rm(path.resolve(process.cwd(), antes.archivo_path!));

    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });
    expect(resumen).toMatchObject({ archivos_borrados: 0, archivos_ya_ausentes: 1, bytes_liberados: 0, entregas_afectadas: 1 });
    expect((await ActivitySubmission.findOne({ activity_id: id }).lean())!.intentos[0]!.archivos[0]).toMatchObject({ path: null, purgado: true });
  });

  it('nunca borra fuera de la carpeta de actividades, aunque la base lo diga', async () => {
    const { id } = await entregaCalificada();
    const ajeno = path.join(UPLOADS_ROOT, 'matriculas-ajeno.pdf');
    await fs.mkdir(UPLOADS_ROOT, { recursive: true });
    await fs.writeFile(ajeno, 'no tocar');
    await ActivitySubmission.updateOne({ activity_id: id }, { $set: { 'intentos.0.archivos.0.path': path.relative(process.cwd(), ajeno) } });

    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });
    expect(resumen.archivos_borrados).toBe(0);
    expect(resumen.errores).toHaveLength(1);
    expect(await existe(path.relative(process.cwd(), ajeno))).toBe(true);
    expect((await ActivitySubmission.findOne({ activity_id: id }).lean())!.intentos[0]!.archivos[0]!.purgado).toBeFalsy();
    await fs.rm(ajeno, { force: true });
  });

  it('depura todos los archivos de todos los intentos y deja el intento que cuenta sin ruta', async () => {
    const id = await programar({ permite_multiples_entregas: true, permite_varios_archivos: true });
    await entregas.registrarEntrega(id, {}, [pdf('a.pdf'), pdf('b.pdf')], e.estudiante);
    await entregas.registrarEntrega(id, {}, pdf('c.pdf'), e.estudiante);
    await cerrarPeriodo();
    const antes = (await ActivitySubmission.findOne({ activity_id: id }).lean())!;
    const rutas = antes.intentos.flatMap((i) => i.archivos.map((a) => a.path!));
    expect(rutas).toHaveLength(3);

    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });
    expect(resumen).toMatchObject({ archivos_borrados: 3, entregas_afectadas: 1 });
    for (const ruta of rutas) expect(await existe(ruta)).toBe(false);

    const despues = (await ActivitySubmission.findOne({ activity_id: id }).lean())!;
    expect(despues.archivo_path).toBeNull();
    expect(despues.intentos).toHaveLength(2);
    expect(despues.intentos.every((i) => i.archivo_path === null && i.archivos.every((a) => a.purgado === true && a.path === null))).toBe(true);
    expect(despues.intentos.map((i) => i.fecha_entrega)).toEqual(antes.intentos.map((i) => i.fecha_entrega));
  });

  it('depura una entrega anterior a los intentos (un solo archivo en los campos de arriba)', async () => {
    const id = await programar();
    const carpeta = path.join(UPLOADS_ROOT, 'actividades', id);
    await fs.mkdir(carpeta, { recursive: true });
    const destino = path.join(carpeta, 'vieja.pdf');
    await fs.writeFile(destino, '%PDF-1.4 vieja');
    const fecha = new Date(Date.now() - 2 * DIA_MS);
    await ActivitySubmission.collection.insertOne({
      activity_id: (await Activity.findById(id))!._id,
      student_id: e.estudiante._id,
      texto_entrega: '',
      archivo_path: path.relative(process.cwd(), destino),
      archivo_nombre: 'vieja.pdf',
      archivo_formato: 'PDF',
      archivo_bytes: 14,
      fecha_entrega: fecha,
      estado: 'ENTREGADA',
      con_retraso: false,
      calificacion_numerica: 3.8,
      retroalimentacion: 'Correcto',
      createdAt: fecha,
      updatedAt: fecha,
    });
    await cerrarPeriodo();

    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });
    expect(resumen).toMatchObject({ archivos_borrados: 1, entregas_afectadas: 1 });
    expect(await existe(path.relative(process.cwd(), destino))).toBe(false);

    const despues = (await ActivitySubmission.findOne({ activity_id: id }).lean())!;
    expect(despues).toMatchObject({ archivo_path: null, calificacion_numerica: 3.8, retroalimentacion: 'Correcto', fecha_entrega: fecha });
    expect(despues.intentos).toHaveLength(1);
    expect(despues.intentos[0]!.archivos[0]).toMatchObject({ path: null, purgado: true, nombre: 'vieja.pdf' });
  });

  it('no toca las entregas de actividades de otro periodo', async () => {
    const id = await programar();
    await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
    const antes = (await ActivitySubmission.findOne({ activity_id: id }).lean())!;
    // La actividad pasa al periodo 2 (que sigue abierto); solo el periodo 1 se cierra y se depura.
    await Activity.updateOne({ _id: id }, { $set: { periodo_numero: 2 } });
    await cerrarPeriodo();

    const resumen = await depurarArchivosDePeriodo(periodoId, { dias: 0, ahora: en40Dias() });
    expect(resumen).toMatchObject({ archivos_borrados: 0, entregas_afectadas: 0 });
    expect(await existe(antes.archivo_path!)).toBe(true);
  });
});
