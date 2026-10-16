import fs from 'fs/promises';
import { Types } from 'mongoose';
import path from 'path';
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
import * as revision from '../../src/services/actividadRevision.service';
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

    it('solo se entrega una vez salvo que la actividad permita varias entregas', async () => {
      const id = await programar();
      await entregas.registrarEntrega(id, {}, pdf('primera.pdf'), e.estudiante);
      await expect(entregas.registrarEntrega(id, {}, pdf('segunda.pdf'), e.estudiante)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/Solo se permite una entrega/),
      });
      const entrega = (await ActivitySubmission.findOne({ activity_id: id }))!;
      expect(entrega.archivo_nombre).toBe('primera.pdf');
      expect(entrega.intentos).toHaveLength(1);
    });

    it('con entregas múltiples cada entrega es un intento, se conservan todos y el docente tiene que elegir la válida antes de calificar', async () => {
      const id = await programar({ permite_multiples_entregas: true });
      await entregas.registrarEntrega(id, {}, pdf('primera.pdf'), e.estudiante);
      await new Promise((r) => setTimeout(r, 5));
      const segunda = await entregas.registrarEntrega(id, {}, pdf('segunda.pdf'), e.estudiante);

      expect(segunda).toMatchObject({ archivo_nombre: 'segunda.pdf', requiere_elegir_intento: true, intento_valido: null });
      expect(segunda?.intentos.map((i) => i.numero)).toEqual([1, 2]);
      const guardada = (await ActivitySubmission.findOne({ activity_id: id }))!;
      for (const intento of guardada.intentos) await fs.access(path.resolve(process.cwd(), intento.archivo_path!));

      const grado = { student_id: String(e.estudiante._id), calificacion_numerica: 4 };
      await expect(notas.gradeActivity(id, [grado], docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/entregaron más de una vez/) });

      const elegida = await entregas.elegirIntentoValido(id, String(e.estudiante._id), 1, docente);
      expect(elegida).toMatchObject({ intento_valido: 1, archivo_nombre: 'primera.pdf', requiere_elegir_intento: false });
      await expect(entregas.elegirIntentoValido(id, String(e.estudiante._id), 7, docente)).rejects.toMatchObject({ statusCode: 404 });
      await expect(entregas.elegirIntentoValido(id, String(e.estudiante._id), 1, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });

      await notas.gradeActivity(id, [grado], docente);
      expect((await entregas.detalleParaEstudiante(id, e.estudiante)).estado).toBe('CALIFICADA');
      // Ya calificada no admite otra entrega, aunque la actividad las permita.
      await expect(entregas.registrarEntrega(id, {}, pdf('tercera.pdf'), e.estudiante)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('una entrega nueva después de elegir la válida obliga a elegir de nuevo', async () => {
      const id = await programar({ permite_multiples_entregas: true });
      await entregas.registrarEntrega(id, {}, pdf('a.pdf'), e.estudiante);
      await new Promise((r) => setTimeout(r, 5));
      await entregas.registrarEntrega(id, {}, pdf('b.pdf'), e.estudiante);
      await entregas.elegirIntentoValido(id, String(e.estudiante._id), 2, docente);
      await new Promise((r) => setTimeout(r, 5));
      const tercera = await entregas.registrarEntrega(id, {}, pdf('c.pdf'), e.estudiante);
      expect(tercera).toMatchObject({ intento_valido: null, requiere_elegir_intento: true });
    });

    it('el docente descarga cualquier intento; el estudiante solo los suyos', async () => {
      const id = await programar({ permite_multiples_entregas: true });
      await entregas.registrarEntrega(id, {}, pdf('a.pdf'), e.estudiante);
      await new Promise((r) => setTimeout(r, 5));
      await entregas.registrarEntrega(id, {}, pdf('b.pdf'), e.estudiante);
      const entregaId = String((await ActivitySubmission.findOne({ activity_id: id }))!._id);

      expect((await entregas.rutaDeEntrega(entregaId, docente, 1)).nombre).toBe('a.pdf');
      expect((await entregas.rutaDeEntrega(entregaId, docente)).nombre).toBe('b.pdf');
      await expect(entregas.rutaDeEntrega(entregaId, e.otroEstudiante, 1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('una nota puesta desde la planilla se ve en la entrega de la actividad, con su origen', async () => {
      const id = await programar();
      await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
      const ref = { teacher_assignment_id: String(asignacion._id), periodo_numero: 1 };
      await notas.guardarCeldas({ ...ref, celdas: [{ student_id: String(e.estudiante._id), casilla_id: id, nota: 3.2 }] }, docente);

      const filas = await entregas.listarEntregas(id, docente);
      const fila = filas.find((f) => f.estudiante._id === String(e.estudiante._id))!;
      expect(fila.entrega).toMatchObject({ calificacion_numerica: 3.2, ultimo_cambio_nota: { origen: 'PLANILLA' } });
      expect((await entregas.detalleParaEstudiante(id, e.estudiante)).entrega).toMatchObject({ calificacion_numerica: 3.2 });

      await notas.gradeActivity(id, [{ student_id: String(e.estudiante._id), calificacion_numerica: 4 }], docente);
      const despues = (await entregas.listarEntregas(id, docente)).find((f) => f.estudiante._id === String(e.estudiante._id))!;
      expect(despues.entrega?.ultimo_cambio_nota?.origen).toBe('ACTIVIDAD');
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

  describe('acceso especial por estudiante', () => {
    const programar = async (extra: Partial<actividades.CreateActivityInput> = {}) => {
      if (!(await PlanAula.exists({ docente_id: docente._id }))) await aprobarPlaneacion();
      return String((await actividades.createActivity(datos(extra), docente))._id);
    };
    const vencer = (id: string) => Activity.updateOne({ _id: id }, { fecha_entrega: new Date(Date.now() - 3_600_000) });
    const manana = () => new Date(Date.now() + DIA_MS);
    const alumno = () => String(e.estudiante._id);

    it('un estudiante con excusa entrega vencido el plazo, sin quedar como tardío, y los demás siguen sin poder', async () => {
      const id = await programar();
      await vencer(id);
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 409 });

      await revision.otorgarAccesoEspecial(id, { student_id: alumno(), fecha_limite: manana(), motivo: 'Incapacidad médica' }, docente);

      const detalle = await entregas.detalleParaEstudiante(id, e.estudiante);
      expect(detalle).toMatchObject({ puede_entregar: true, acceso_especial: { fecha_limite: expect.any(Date) } });
      expect(await entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).toMatchObject({ estado: 'ENTREGADA', con_retraso: false });
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.otroEstudiante)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('valen también en una actividad cerrada a mano, pero no pasado el plazo personal', async () => {
      const id = await programar();
      await vencer(id);
      await actividades.updateActivity(id, { cerrada: true }, docente);
      await revision.otorgarAccesoEspecial(id, { student_id: alumno(), fecha_limite: manana(), motivo: 'Viaje con el colegio' }, docente);
      expect((await entregas.detalleParaEstudiante(id, e.estudiante)).puede_entregar).toBe(true);
      expect((await entregas.detalleParaEstudiante(id, e.otroEstudiante)).motivo_bloqueo).toMatch(/cerró/);

      await Activity.updateOne({ _id: id, 'accesos_especiales.student_id': e.estudiante._id }, { $set: { 'accesos_especiales.$.fecha_limite': new Date(Date.now() - 1000) } });
      expect((await entregas.detalleParaEstudiante(id, e.estudiante)).puede_entregar).toBe(false);
    });

    it('se exige un motivo, un plazo futuro y posterior a la fecha límite, y un estudiante del grupo', async () => {
      const id = await programar();
      const base = { student_id: alumno(), fecha_limite: manana(), motivo: 'Incapacidad médica' };
      await expect(revision.otorgarAccesoEspecial(id, { ...base, motivo: 'no' }, docente)).rejects.toMatchObject({ statusCode: 400 });
      await expect(revision.otorgarAccesoEspecial(id, { ...base, fecha_limite: new Date(Date.now() - 1000) }, docente)).rejects.toMatchObject({ statusCode: 400 });
      // Antes de la fecha límite de la actividad no tiene sentido.
      await expect(revision.otorgarAccesoEspecial(id, { ...base, fecha_limite: manana() }, docente)).rejects.toMatchObject({ statusCode: 400 });
      await vencer(id);
      const ajeno = await crearUsuario('ESTUDIANTE');
      await expect(revision.otorgarAccesoEspecial(id, { ...base, student_id: String(ajeno._id) }, docente)).rejects.toMatchObject({ statusCode: 400 });
      await expect(revision.otorgarAccesoEspecial(id, base, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(revision.otorgarAccesoEspecial(id, base, e.estudiante)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('no se otorga a quien ya tiene nota, ni en un periodo cerrado, y se puede quitar', async () => {
      const id = await programar();
      await vencer(id);
      await notas.gradeActivity(id, [{ student_id: alumno(), calificacion_numerica: 3 }], docente);
      await expect(revision.otorgarAccesoEspecial(id, { student_id: alumno(), fecha_limite: manana(), motivo: 'Incapacidad médica' }, docente)).rejects.toMatchObject({ statusCode: 409 });

      const otro = String(e.otroEstudiante._id);
      await revision.otorgarAccesoEspecial(id, { student_id: otro, fecha_limite: manana(), motivo: 'Incapacidad médica' }, docente);
      await revision.revocarAccesoEspecial(id, otro, docente);
      await expect(revision.revocarAccesoEspecial(id, otro, docente)).rejects.toMatchObject({ statusCode: 404 });
      expect((await entregas.detalleParaEstudiante(id, e.otroEstudiante)).puede_entregar).toBe(false);

      await AcademicYear.updateOne({}, { $set: { 'periodos.0.estado': 'CERRADO' } });
      await expect(revision.otorgarAccesoEspecial(id, { student_id: String(e.tercerEstudiante._id), fecha_limite: manana(), motivo: 'Incapacidad médica' }, docente)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('validaciones al modificar una actividad ya publicada', () => {
    const programar = async (extra: Partial<actividades.CreateActivityInput> = {}) => {
      if (!(await PlanAula.exists({ docente_id: docente._id }))) await aprobarPlaneacion();
      return String((await actividades.createActivity(datos(extra), docente))._id);
    };

    it('lo que cambia el docente después de publicar queda anotado, sin el contenido', async () => {
      const id = await programar();
      await actividades.updateActivity(id, { fecha_entrega: proximoDiaHabil(5), titulo: 'Nuevo título' }, docente, null);
      const detalle = await entregas.detalleParaEstudiante(id, e.estudiante);
      expect(detalle.modificaciones).toHaveLength(1);
      expect(detalle.modificaciones[0]?.campos).toEqual(expect.arrayContaining(['la fecha límite', 'el título']));
    });

    it('con entregas ya hechas no cambian los formatos ni la actividad deja de recibir entregas', async () => {
      const id = await programar({ permite_multiples_entregas: true });
      await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
      await expect(actividades.updateActivity(id, { formatos_permitidos: ['IMAGEN'] as FormatoEvidencia[] }, docente)).rejects.toMatchObject({ statusCode: 409 });
      await expect(actividades.updateActivity(id, { requiere_entrega: false }, docente)).rejects.toMatchObject({ statusCode: 409 });
      await actividades.updateActivity(id, { permite_entrega_tardia: true }, docente);
    });

    it('no vuelve a una sola entrega si alguien ya entregó dos veces', async () => {
      const id = await programar({ permite_multiples_entregas: true });
      await entregas.registrarEntrega(id, {}, pdf('a.pdf'), e.estudiante);
      await new Promise((r) => setTimeout(r, 5));
      await entregas.registrarEntrega(id, {}, pdf('b.pdf'), e.estudiante);
      await expect(actividades.updateActivity(id, { permite_multiples_entregas: false }, docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cerrar la actividad a mano frena las entregas y reabrirla las devuelve', async () => {
      const id = await programar();
      await actividades.updateActivity(id, { cerrada: true }, docente);
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerró/) });
      await actividades.updateActivity(id, { cerrada: false }, docente);
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).resolves.toBeTruthy();
    });

    it('con el periodo cerrado no se modifica la actividad ni se recibe una entrega', async () => {
      const id = await programar();
      await AcademicYear.updateOne({}, { $set: { 'periodos.0.estado': 'CERRADO' } });
      await expect(actividades.updateActivity(id, { titulo: 'Tarde' }, docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/CERRADO/) });
      await expect(entregas.registrarEntrega(id, {}, pdf(), e.estudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrado/) });
      expect((await entregas.detalleParaEstudiante(id, e.estudiante)).motivo_bloqueo).toMatch(/cerrado/);
    });
  });

  describe('contenido enriquecido, videos y comentarios', () => {
    const programar = async (extra: Partial<actividades.CreateActivityInput> = {}) => {
      if (!(await PlanAula.exists({ docente_id: docente._id }))) await aprobarPlaneacion();
      return String((await actividades.createActivity(datos(extra), docente))._id);
    };

    it('el HTML del editor se limpia en el servidor y de ahí sale la descripción en texto', async () => {
      const id = await programar({
        descripcion: undefined,
        contenido_html: '<p>Lee con <strong>atención</strong></p><script>alert(1)</script><img src="https://malo.com/x.png">',
        videos: ['https://youtu.be/dQw4w9WgXcQ'],
      });
      const actividad = (await Activity.findById(id))!;
      expect(actividad.contenido_html).not.toMatch(/script|img/);
      expect(actividad.descripcion).toBe('Lee con atención');
      const detalle = await entregas.detalleParaEstudiante(id, e.estudiante);
      expect(detalle.videos[0]).toMatchObject({ proveedor: 'YOUTUBE', url_incrustada: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
      await expect(programar({ descripcion: undefined, contenido_html: '' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(programar({ videos: ['https://ejemplo.com/video.mp4'] })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el comentario lo ven el docente y los estudiantes del grupo; cada quien borra el suyo y el docente modera', async () => {
      const id = await programar();
      const mio = await revision.crearComentario(id, '¿Se puede entregar en Word?', e.estudiante);
      await revision.crearComentario(id, 'Solo PDF.', docente);

      const vistos = await revision.listarComentarios(id, e.otroEstudiante);
      expect(vistos.map((c) => c.texto)).toEqual(['¿Se puede entregar en Word?', 'Solo PDF.']);
      expect(vistos.every((c) => !c.es_mio)).toBe(true);

      await expect(revision.eliminarComentario(id, mio._id, e.otroEstudiante)).rejects.toMatchObject({ statusCode: 403 });
      await revision.eliminarComentario(id, mio._id, docente);
      expect(await revision.listarComentarios(id, e.estudiante)).toHaveLength(1);

      const ajeno = await crearUsuario('ESTUDIANTE');
      await expect(revision.listarComentarios(id, ajeno)).rejects.toMatchObject({ statusCode: 404 });
      await expect(revision.crearComentario(id, 'hola', e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(revision.crearComentario(id, '   ', e.estudiante)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el análisis cuenta entregas y notas del grupo y no es para estudiantes', async () => {
      const id = await programar();
      await entregas.registrarEntrega(id, {}, pdf(), e.estudiante);
      await notas.gradeActivity(id, [{ student_id: String(e.estudiante._id), calificacion_numerica: 4 }], docente);

      const analisis = await revision.analisisDeActividad(id, docente);
      expect(analisis).toMatchObject({ total_estudiantes: 3, entregaron: 1, sin_entregar: 2, calificados: 1 });
      expect(analisis.notas).toMatchObject({ promedio: 4, aprueban: 1 });
      await expect(revision.analisisDeActividad(id, e.estudiante)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('publicar en varios grupos', () => {
    it('la clase principal debe cumplir todo; los grupos adicionales que no pueden quedan fuera con su motivo', async () => {
      await aprobarPlaneacion();
      // Un segundo grupo donde el mismo docente dicta la misma asignatura, pero sin plan de aula aprobado.
      const grupo = (await Group.findById(asignacion.group_id))!;
      const otroGrupo = await Group.create({
        sede_id: grupo.sede_id,
        academic_year_id: grupo.academic_year_id,
        grade_id: grupo.grade_id,
        jornada_id: grupo.jornada_id,
        nomenclatura: '602',
        max_capacity: 40,
      });
      const copia = await TeacherAssignment.create({
        docente_id: docente._id,
        academic_year_id: asignacion.academic_year_id,
        tipo_asignacion: 'CLASE',
        group_id: otroGrupo._id,
        subject_id: asignacion.subject_id,
        horas_semanales: 4,
      });

      const resultado = await actividades.publicarActividad({ ...datos(), grupos_adicionales: [String(copia._id)] }, docente);
      expect(resultado.copias).toHaveLength(0);
      expect(resultado.omitidas).toHaveLength(1);
      expect(resultado.omitidas[0]).toMatchObject({ teacher_assignment_id: String(copia._id), motivo: expect.stringMatching(/plan de aula/) });
      expect(resultado.actividad.publicacion_id).toBeNull();

      await expect(actividades.publicarActividad({ ...datos(), grupos_adicionales: [String(e.docenteAjeno._id)] }, docente)).rejects.toBeTruthy();
    });
  });
});
