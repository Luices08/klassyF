import fs from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FormatoEvidencia } from '../../src/constants/actividades';
import AcademicYear from '../../src/models/academicYear.model';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import Group from '../../src/models/group.model';
import PlanAula from '../../src/models/planAula.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import * as entregas from '../../src/services/actividadEntrega.service';
import * as actividades from '../../src/services/activity.service';
import * as notas from '../../src/services/notas.service';
import { hoyColombia } from '../../src/services/attendance.service';
import * as configuracion from '../../src/services/configuracionActividades.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { crearPlanAula } from './escenarioNotas';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';

const DIA_MS = 86_400_000;
const pdf = (nombre = 'tarea.pdf') => ({ buffer: Buffer.from('%PDF-1.4 mi tarea'), mimetype: 'application/pdf', originalname: nombre });

/** Un día hábil (lunes a viernes) dentro de `desdeDias` días o más, a las 12 m. en Colombia. */
function proximoDiaHabil(desdeDias: number): Date {
  const dia = hoyColombia();
  dia.setUTCDate(dia.getUTCDate() + desdeDias);
  while ([0, 6].includes(dia.getUTCDay())) dia.setUTCDate(dia.getUTCDate() + 1);
  return new Date(dia.getTime() + 17 * 3_600_000);
}

describe('M11: actividades y entregas (con base de datos)', () => {
  let e: Escenario;
  let asignacion: TeacherAssignmentDocument;
  let docente: UserDocument;

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

    // Periodos alrededor de hoy: el escenario base usa trimestres del año calendario y "mañana" podría caer fuera.
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
  }, 60_000);

  const aprobarPlaneacion = (estado: 'APROBADO' | 'EN_REVISION' | 'DEVUELTO' = 'APROBADO', periodo = 1) => crearPlanAula(asignacion, periodo, estado);

  const datos = (extra: Partial<actividades.CreateActivityInput> = {}): actividades.CreateActivityInput => ({
    teacher_assignment_id: String(asignacion._id),
    periodo_numero: 1,
    titulo: 'Taller de fracciones',
    descripcion: 'Resuelve los ejercicios 1 al 10.',
    tipo: 'TAREA',
    componente_siee: 'COGNITIVO_SABER',
    peso_en_componente: 1,
    fecha_apertura: new Date(Date.now() - 3_600_000),
    fecha_entrega: proximoDiaHabil(3),
    requiere_entrega: true,
    formatos_permitidos: ['PDF'] as FormatoEvidencia[],
    permite_entrega_tardia: false,
    ...extra,
  });

  describe('programación (CU-DOC-02)', () => {
    it('no se programa sin plan de aula, ni con uno que no está aprobado', async () => {
      await expect(actividades.createActivity(datos(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Aún no has radicado tu plan de aula/) });

      const plan = await aprobarPlaneacion('EN_REVISION');
      await expect(actividades.createActivity(datos(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/está en revisión/) });

      await PlanAula.updateOne({ _id: plan._id }, { $set: { estado: 'DEVUELTO' } });
      await expect(actividades.createActivity(datos(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/devuelto con comentarios/) });

      await PlanAula.updateOne({ _id: plan._id }, { $set: { estado: 'APROBADO' } });
      await expect(actividades.createActivity(datos(), docente)).resolves.toBeTruthy();
    });

    it('el plan de aula habilita solo su periodo y a su docente: ni el de otro periodo ni el de otro docente sirven', async () => {
      await aprobarPlaneacion('APROBADO', 2);
      await expect(actividades.createActivity(datos({ periodo_numero: 1 }), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/periodo 1/) });

      // Otro docente con el plan aprobado de esa misma asignatura y grado no habilita a este docente.
      const grupo = (await Group.findById(asignacion.group_id))!;
      await PlanAula.create({
        academic_year_id: asignacion.academic_year_id,
        periodo_numero: 1,
        subject_id: asignacion.subject_id,
        grade_id: grupo.grade_id,
        docente_id: e.docenteAjeno._id,
        estado: 'APROBADO',
        radicacion: { fecha: new Date(), fecha_limite: null, fuera_de_plazo: false },
        versiones: [
          {
            numero: 1,
            titulo: 'Plan',
            descripcion: 'x',
            archivo: { nombre: 'a.pdf', ruta: 'uploads/planeacion/a.pdf', bytes: 5, sha256: 'b'.repeat(64) },
            origen: 'CARGADA',
            adoptado_de: null,
            subido_por: e.docenteAjeno._id,
            fecha: new Date(),
          },
        ],
      });
      await expect(actividades.createActivity(datos(), docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('mover la fecha de apertura (publicar) exige el plan aprobado; corregir un título, no', async () => {
      const plan = await aprobarPlaneacion();
      const creada = await actividades.createActivity(datos(), docente);
      await PlanAula.updateOne({ _id: plan._id }, { $set: { estado: 'DEVUELTO' } });

      await expect(actividades.updateActivity(String(creada._id), { titulo: 'Solo corrijo el título' }, docente)).resolves.toMatchObject({ titulo: 'Solo corrijo el título' });
      await expect(actividades.updateActivity(String(creada._id), { fecha_apertura: new Date(Date.now() + DIA_MS) }, docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/devuelto con comentarios/),
      });
      // Reenviar la misma fecha que ya tenía no es publicar de nuevo.
      await expect(actividades.updateActivity(String(creada._id), { fecha_apertura: creada.fecha_apertura }, docente)).resolves.toBeTruthy();
    });

    it('un docente solo programa sobre sus propias clases', async () => {
      await aprobarPlaneacion();
      await expect(actividades.createActivity(datos(), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(actividades.createActivity(datos(), e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('ya no pide DBA ni competencia: basta el plan de aula aprobado, y la actividad no guarda esos campos', async () => {
      await aprobarPlaneacion();
      const creada = await actividades.createActivity(datos(), docente);
      const guardada = (await Activity.findById(creada._id).lean()) as unknown as Record<string, unknown>;
      expect(guardada).not.toHaveProperty('dba_id');
      expect(guardada).not.toHaveProperty('competencia_evaluada');
      expect(guardada).not.toHaveProperty('desarrollo_curricular_id');
    });

    it('bloquea fechas imposibles: pasada o fuera del periodo', async () => {
      await aprobarPlaneacion();
      await expect(
        actividades.createActivity(datos({ fecha_apertura: new Date(Date.now() - 2 * DIA_MS), fecha_entrega: new Date(Date.now() - DIA_MS) }), docente)
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/ya pasó/) });

      const finPeriodo = proximoDiaHabil(150); // el periodo 1 termina en +100
      await expect(actividades.createActivity(datos({ fecha_entrega: finPeriodo }), docente)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/fuera del periodo 1/),
      });
    });

    it('un receso es una advertencia que el docente debe confirmar', async () => {
      await aprobarPlaneacion();
      const entrega = proximoDiaHabil(5);
      const anio = (await AcademicYear.findOne())!;
      const dia = new Date(entrega.getTime() - 17 * 3_600_000);
      anio.eventos.push({ tipo: 'RECESO', nombre: 'Receso de octubre', fecha_inicio: dia, fecha_fin: dia, periodo_numero: null, fecha_limite_resultados: null });
      await anio.save();

      await expect(actividades.createActivity(datos({ fecha_entrega: entrega }), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/Receso de octubre/),
        details: { alertas: [{ codigo: 'DIA_NO_LECTIVO' }] },
      });
      const creada = await actividades.createActivity(datos({ fecha_entrega: entrega, confirmar_alertas: true }), docente);
      expect(creada._id).toBeTruthy();
    });

    it('advierte cuando el grupo supera el límite de evaluaciones del día, con el límite que fija el colegio', async () => {
      await aprobarPlaneacion();
      await configuracion.actualizarConfiguracionActividades({ max_evaluaciones_por_dia: 1 }, e.coordAcademico);
      const entrega = proximoDiaHabil(4);

      // Otra clase del mismo grupo ya tiene una evaluación ese día.
      const otra = await TeacherAssignment.create({
        docente_id: e.docenteAjeno._id,
        academic_year_id: asignacion.academic_year_id,
        tipo_asignacion: 'CLASE',
        group_id: asignacion.group_id,
        subject_id: new Types.ObjectId(),
        horas_semanales: 3,
      });
      await Activity.create({
        teacher_assignment_id: otra._id,
        periodo_numero: 1,
        titulo: 'Parcial de ciencias',
        descripcion: 'x',
        tipo: 'EVALUACION',
        componente_siee: 'COGNITIVO_SABER',
        peso_en_componente: 1,
        fecha_apertura: new Date(),
        fecha_entrega: entrega,
      });

      const revision = await actividades.revisionDeCalendario(
        { teacher_assignment_id: String(asignacion._id), periodo_numero: 1, fecha_entrega: entrega, tipo: 'EVALUACION' },
        docente
      );
      expect(revision.alertas).toMatchObject([{ codigo: 'SOBRECARGA_EVALUACIONES', severidad: 'ADVERTENCIA' }]);
      expect(revision.carga_del_dia).toMatchObject([{ titulo: 'Parcial de ciencias', tipo: 'EVALUACION' }]);

      await expect(actividades.createActivity(datos({ tipo: 'EVALUACION', fecha_entrega: entrega }), docente)).rejects.toMatchObject({ statusCode: 409 });
      // Una tarea el mismo día no es una evaluación más.
      await expect(actividades.createActivity(datos({ tipo: 'TAREA', fecha_entrega: entrega }), docente)).resolves.toBeTruthy();
    });

    it('un periodo cerrado ya no admite actividades', async () => {
      await aprobarPlaneacion();
      const anio = (await AcademicYear.findOne())!;
      anio.periodos.find((p) => p.numero === 1)!.estado = 'CERRADO';
      await anio.save();
      await expect(actividades.createActivity(datos(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/CERRADO/) });
    });

    it('con notas el peso aún se ajusta (la planilla está abierta); el periodo no se cambia nunca; con entregas no se elimina', async () => {
      await aprobarPlaneacion();
      const actividad = await actividades.createActivity(datos(), docente);
      const id = String(actividad._id);

      expect(await actividades.updateActivity(id, { titulo: 'Taller de fracciones (v2)' }, docente)).toMatchObject({ titulo: 'Taller de fracciones (v2)' });

      await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
      await notas.gradeActivity(id, [{ student_id: String(e.estudiante._id), calificacion_numerica: 4 }], docente);

      expect(await actividades.updateActivity(id, { peso_en_componente: 50 }, docente)).toMatchObject({ peso_en_componente: 50 });
      await expect(actividades.updateActivity(id, { peso_en_componente: 150 }, docente)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/más de 100%/) });
      await expect(actividades.updateActivity(id, { requiere_entrega: false }, docente)).rejects.toMatchObject({ statusCode: 409 });
      await expect(actividades.deleteActivity(id, docente)).rejects.toMatchObject({ statusCode: 409 });

      const vacia = await actividades.createActivity(datos({ titulo: 'Sin entregas' }), docente);
      await actividades.deleteActivity(String(vacia._id), docente);
      expect(await Activity.exists({ _id: vacia._id })).toBeNull();
    });
  });

  describe('entrega de evidencias (CU-EST-03)', () => {
    const programar = async (extra: Partial<actividades.CreateActivityInput> = {}) => {
      if (!(await PlanAula.exists({ docente_id: docente._id }))) await aprobarPlaneacion();
      return String((await actividades.createActivity(datos(extra), docente))._id);
    };

    it('la bandeja solo muestra lo publicado de su grupo y marca programada hasta que entrega', async () => {
      const visible = await programar({ titulo: 'Visible' });
      await actividades.createActivity(
        datos({ titulo: 'Aún no publicada', fecha_apertura: new Date(Date.now() + 2 * DIA_MS), fecha_entrega: proximoDiaHabil(6) }),
        docente
      );

      const bandeja = await entregas.listarMisActividades(e.estudiante, {});
      expect(bandeja).toHaveLength(1);
      expect(bandeja[0]).toMatchObject({ _id: visible, estado: 'PROGRAMADA', puede_entregar: true, entrega: null });

      const ajeno = await crearUsuario('ESTUDIANTE');
      expect(await entregas.listarMisActividades(ajeno, {})).toEqual([]);
      await expect(entregas.detalleParaEstudiante(visible, ajeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('recorre programada -> entregada -> calificada y guarda el archivo fuera de Mongo', async () => {
      const id = await programar();
      const entrega = await entregas.registrarEntrega(id, { texto_entrega: 'Adjunto mi taller' }, pdf(), e.estudiante);

      expect(entrega).toMatchObject({ estado: 'ENTREGADA', con_retraso: false, tiene_archivo: true, archivo_nombre: 'tarea.pdf' });
      const guardada = (await ActivitySubmission.findOne({ activity_id: id }))!;
      expect(guardada.archivo_path).toMatch(/uploads[\\/]actividades/);
      await fs.access(path.resolve(process.cwd(), guardada.archivo_path!));

      const { ruta } = await entregas.rutaDeEntrega(String(guardada._id), docente);
      expect(ruta).toBe(path.resolve(process.cwd(), guardada.archivo_path!));
      await expect(entregas.rutaDeEntrega(String(guardada._id), e.otroEstudiante)).rejects.toMatchObject({ statusCode: 404 });
      await expect(entregas.rutaDeEntrega(String(guardada._id), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });

      await notas.gradeActivity(id, [{ student_id: String(e.estudiante._id), calificacion_numerica: 4.5, retroalimentacion: 'Muy bien' }], docente);
      const detalle = await entregas.detalleParaEstudiante(id, e.estudiante);
      expect(detalle).toMatchObject({
        estado: 'CALIFICADA',
        puede_entregar: false,
        entrega: { calificacion_numerica: 4.5, retroalimentacion: 'Muy bien' },
      });
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya fue calificada/) });
    });

    it('reentregar reemplaza el archivo anterior mientras no esté calificada', async () => {
      const id = await programar();
      await entregas.registrarEntrega(id, {}, pdf('primera.pdf'), e.estudiante);
      const primera = (await ActivitySubmission.findOne({ activity_id: id }))!.archivo_path!;
      await new Promise((r) => setTimeout(r, 5));
      await entregas.registrarEntrega(id, {}, pdf('segunda.pdf'), e.estudiante);

      const entrega = (await ActivitySubmission.findOne({ activity_id: id }))!;
      expect(entrega.archivo_nombre).toBe('segunda.pdf');
      expect(await ActivitySubmission.countDocuments({ activity_id: id })).toBe(1);
      await expect(fs.access(path.resolve(process.cwd(), primera))).rejects.toThrow();
    });

    it('solo recibe los formatos que el docente permitió, comprobados por contenido', async () => {
      const id = await programar();
      await expect(entregas.registrarEntrega(id, {}, undefined, e.estudiante)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Adjunta/) });
      await expect(
        entregas.registrarEntrega(id, {}, { buffer: Buffer.from('MZ\x90 no soy pdf'), mimetype: 'application/pdf', originalname: 'virus.pdf' }, e.estudiante)
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no es un PDF/) });
      await expect(
        entregas.registrarEntrega(id, {}, { buffer: Buffer.from('89504e470d0a1a0a', 'hex'), mimetype: 'image/png', originalname: 'foto.png' }, e.estudiante)
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/solo acepta: PDF/) });
      expect(await ActivitySubmission.countDocuments()).toBe(0);
    });

    it('una actividad sin formatos se responde por escrito', async () => {
      const id = await programar({ formatos_permitidos: [] });
      await expect(entregas.registrarEntrega(id, {}, undefined, e.estudiante)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Escribe tu respuesta/) });
      await expect(entregas.registrarEntrega(id, { texto_entrega: 'x' }, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 400 });
      const entrega = await entregas.registrarEntrega(id, { texto_entrega: 'Mi respuesta' }, undefined, e.estudiante);
      expect(entrega).toMatchObject({ estado: 'ENTREGADA', tiene_archivo: false, texto_entrega: 'Mi respuesta' });
    });

    it('vencido el plazo: se cierra, o queda entregada con retraso si la actividad lo admite, y calificar no lo borra', async () => {
      const cerrada = await programar({ titulo: 'No admite tarde' });
      const tardia = await programar({ titulo: 'Admite tarde', permite_entrega_tardia: true });
      await Activity.updateMany({}, { fecha_entrega: new Date(Date.now() - 3_600_000) });

      const mia = await entregas.listarMisActividades(e.estudiante, {});
      expect(mia.find((a) => a._id === cerrada)).toMatchObject({ vencida: true, puede_entregar: false });
      expect(mia.find((a) => a._id === tardia)).toMatchObject({ vencida: true, puede_entregar: true });

      await expect(entregas.registrarEntrega(cerrada, {}, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/no recibe entregas tardías/) });
      expect(await entregas.registrarEntrega(tardia, {}, pdf(), e.estudiante)).toMatchObject({ estado: 'ENTREGADA_TARDE', con_retraso: true });

      await notas.gradeActivity(tardia, [{ student_id: String(e.estudiante._id), calificacion_numerica: 3 }], docente);
      expect((await entregas.detalleParaEstudiante(tardia, e.estudiante)).entrega).toMatchObject({ estado: 'CALIFICADA', con_retraso: true });
    });

    it('solo entrega quien está matriculado en el grupo', async () => {
      const id = await programar();
      const ajeno = await crearUsuario('ESTUDIANTE');
      await expect(entregas.registrarEntrega(id, {}, pdf(), ajeno)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('una actividad sin entregable digital no recibe archivos', async () => {
      const id = await programar({ requiere_entrega: false, formatos_permitidos: [] });
      await expect(entregas.registrarEntrega(id, { texto_entrega: 'x' }, undefined, e.estudiante)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/no recibe entregas digitales/),
      });
    });

    it('el docente ve a todo el grupo con su estado, también a quien no entregó', async () => {
      const id = await programar();
      await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
      await notas.gradeActivity(id, [{ student_id: String(e.otroEstudiante._id), calificacion_numerica: 3 }], docente);

      const filas = await entregas.listarEntregas(id, docente);
      const estados = Object.fromEntries(filas.map((f) => [f.estudiante._id, f.estado]));
      expect(estados).toEqual({
        [String(e.estudiante._id)]: 'ENTREGADA',
        [String(e.otroEstudiante._id)]: 'CALIFICADA',
        [String(e.tercerEstudiante._id)]: 'PROGRAMADA',
      });
      await expect(entregas.listarEntregas(id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });

      const [listada] = await actividades.listActivities({ academic_year_id: String(asignacion.academic_year_id) }, docente);
      expect(listada?.resumen).toEqual({ estudiantes: 3, entregadas: 2, con_retraso: 0, calificadas: 1 });
      expect(await actividades.listActivities({}, e.docenteAjeno)).toEqual([]);
    });
  });
});
