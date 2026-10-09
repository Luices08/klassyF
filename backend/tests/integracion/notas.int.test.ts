import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import AuditLog from '../../src/models/auditLog.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import { UserDocument } from '../../src/models/user.model';
import * as anios from '../../src/services/academicYear.service';
import * as actividades from '../../src/services/activity.service';
import * as notas from '../../src/services/notas.service';
import { generateReportCard } from '../../src/services/reportCard.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { aprobarPlaneacion, crearActividad, definirComponentes, EscenarioNotas, idAleatorio, prepararNotas, proximoDiaHabil } from './escenarioNotas';

const HETERO = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, origen: 'ACTIVIDADES' as const };
const AUTO = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, origen: 'NOTA_DIRECTA' as const };

describe('M12: evaluación y notas (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let a1: string;
  let a2: string;
  const [est1, est2, est3] = ['estudiante', 'otroEstudiante', 'tercerEstudiante'] as const;
  const idEst = (clave: (typeof est1 | typeof est2 | typeof est3)) => String(e[clave]._id);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes(), CalificacionAsignatura.syncIndexes()]);
    e = await armarEscenario();
    docente = e.docenteDeClase;
    n = await prepararNotas(e);
    await definirComponentes([HETERO, AUTO]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 1))._id);
    a2 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 3))._id);
  }, 60_000);

  const ref = () => ({ teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 });
  const guardar = (celdas: notas.CeldaPlanilla[], usuario = docente) => notas.guardarCeldas({ ...ref(), celdas }, usuario);
  const planilla = (usuario = docente) => notas.obtenerPlanilla(String(n.asignacion._id), 1, usuario);
  const fila = async (clave: typeof est1, usuario = docente) => (await planilla(usuario)).estudiantes.find((f) => f.estudiante._id === idEst(clave))!;

  /** Todas las notas de los tres estudiantes: 4/2 en las actividades y 5 de autoevaluación → 3.25. */
  const completarTodo = () =>
    guardar(
      [est1, est2, est3].flatMap((clave) => [
        { student_id: idEst(clave), actividad_id: a1, nota: 4 },
        { student_id: idEst(clave), actividad_id: a2, nota: 2 },
        { student_id: idEst(clave), componente_clave: 'AUTOEVALUACION', nota: 5 },
      ])
    );

  describe('la planilla se arma con la configuración', () => {
    it('trae un bloque por componente, sus actividades y las columnas calculadas', async () => {
      const p = await planilla();
      expect(p.componentes.map((c) => [c.clave, c.porcentaje, c.origen, c.actividades.length])).toEqual([
        ['HETEROEVALUACION', 70, 'ACTIVIDADES', 2],
        ['AUTOEVALUACION', 30, 'NOTA_DIRECTA', 0],
      ]);
      expect(p.asignacion).toMatchObject({ grupo: { nomenclatura: '601' }, asignatura: { nombre: 'Matemáticas' } });
      expect(p.estudiantes).toHaveLength(3);
      expect(p.estudiantes[0]).toMatchObject({ estado: 'PENDIENTE', nota_asignatura: null, desempeno: null });
      expect(p.escala).toMatchObject({ nota_minima: 1, nota_maxima: 5 });
      expect(p.edicion).toMatchObject({ puede_editar: true, puede_cerrar: false });
    });

    it('sin componentes definidos usa Saber/Hacer/Ser, y las actividades anteriores a M12 siguen valiendo', async () => {
      await AcademicYear.updateOne({}, { $set: { componentes_evaluativos: [] } });
      await crearActividad(n.asignacion, 'COGNITIVO_SABER', 1);
      const p = await planilla();
      expect(p.componentes.map((c) => [c.clave, c.porcentaje])).toEqual([
        ['COGNITIVO_SABER', 40],
        ['PROCEDIMENTAL_HACER', 40],
        ['ACTITUDINAL_SER', 20],
      ]);
      expect(p.componentes[0]?.actividades).toHaveLength(1);
    });

    it('la consulta es del titular, de coordinación y de administración; otro docente no entra', async () => {
      await expect(planilla(e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      const vista = await planilla(e.coordAcademico);
      expect(vista.edicion).toMatchObject({ puede_editar: false, motivo: expect.stringMatching(/titular/) });
      expect((await planilla(e.admin)).estudiantes).toHaveLength(3);
    });
  });

  describe('registro de notas', () => {
    it('calcula en tiempo real, parcial mientras falten notas, y pasa de PENDIENTE a BORRADOR al completarse', async () => {
      await guardar([
        { student_id: idEst(est1), actividad_id: a1, nota: 4 },
        { student_id: idEst(est1), actividad_id: a2, nota: 2 },
      ]);
      expect(await fila(est1)).toMatchObject({
        estado: 'PENDIENTE',
        parcial: true,
        nota_asignatura: 2.5,
        componentes: { HETEROEVALUACION: 2.5, AUTOEVALUACION: null },
        faltantes: ['AUTOEVALUACION'],
      });

      await guardar([{ student_id: idEst(est1), componente_clave: 'AUTOEVALUACION', nota: 5 }]);
      expect(await fila(est1)).toMatchObject({ estado: 'BORRADOR', parcial: false, nota_asignatura: 3.25, desempeno: { nivel: 'BASICO' } });
      expect(await fila(est2)).toMatchObject({ estado: 'PENDIENTE', nota_asignatura: null });
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.estado).toBe('BORRADOR');
    });

    it('cada cambio queda en el historial con quién y cuándo, y repetir una nota no genera ruido', async () => {
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }]);
      const repetida = await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }]);
      expect(repetida).toMatchObject({ guardadas: 0, sin_cambios: 1 });
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 4.5 }]);
      await guardar([{ student_id: idEst(est1), componente_clave: 'AUTOEVALUACION', nota: 3 }]);
      await guardar([{ student_id: idEst(est1), componente_clave: 'AUTOEVALUACION', nota: 4 }]);

      const entrega = (await ActivitySubmission.findOne({ activity_id: a1, student_id: idEst(est1) }))!;
      expect(entrega.historial_notas.map((h) => [h.valor_anterior, h.valor_nuevo, String(h.por)])).toEqual([
        [null, 3, String(docente._id)],
        [3, 4.5, String(docente._id)],
      ]);
      const directa = (await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.notas_directas[0]!;
      expect(directa.historial.map((h) => [h.valor_anterior, h.valor_nuevo])).toEqual([[null, 3], [3, 4]]);
      expect(await AuditLog.countDocuments({ accion: 'NOTAS_REGISTRADAS' })).toBe(4);
    });

    it('guardar la nota de una actividad no pisa la retroalimentación ni la entrega del estudiante', async () => {
      await notas.gradeActivity(a1, [{ student_id: idEst(est1), calificacion_numerica: 3, retroalimentacion: 'Revisa el punto 2' }], docente);
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 4 }]);
      expect((await ActivitySubmission.findOne({ activity_id: a1, student_id: idEst(est1) }))!).toMatchObject({
        calificacion_numerica: 4,
        retroalimentacion: 'Revisa el punto 2',
        estado: 'CALIFICADA',
      });
    });

    it('valida todo antes de escribir: una celda inválida no deja guardar ninguna', async () => {
      const intentos: Array<[notas.CeldaPlanilla, number, RegExp]> = [
        [{ student_id: idEst(est2), actividad_id: a2, nota: 6 }, 400, /fuera de la escala/],
        [{ student_id: idAleatorio(), actividad_id: a2, nota: 3 }, 400, /no está matriculado/],
        [{ student_id: idEst(est2), actividad_id: idAleatorio(), nota: 3 }, 400, /no pertenece a esta clase/],
        [{ student_id: idEst(est2), componente_clave: 'HETEROEVALUACION', nota: 3 }, 400, /nota directa/],
      ];
      for (const [celda, estado, mensaje] of intentos) {
        await expect(guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }, celda])).rejects.toMatchObject({ statusCode: estado, message: mensaje });
      }
      await expect(
        guardar([
          { student_id: idEst(est1), actividad_id: a1, nota: 3 },
          { student_id: idEst(est1), actividad_id: a1, nota: 4 },
        ])
      ).rejects.toMatchObject({ statusCode: 400, message: /dos veces/ });
      expect(await ActivitySubmission.countDocuments()).toBe(0);
      expect(await CalificacionAsignatura.countDocuments()).toBe(0);
    });

    it('solo el titular escribe, y solo mientras el periodo admite notas', async () => {
      await expect(guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }], e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }], e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });

      const anio = (await AcademicYear.findOne())!;
      anio.periodos.find((p) => p.numero === 1)!.estado = 'CERRADO';
      await anio.save();
      await expect(guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 3 }])).rejects.toMatchObject({ statusCode: 409, message: /CERRADO/ });
      expect((await planilla()).edicion).toMatchObject({ puede_editar: false, motivo: expect.stringMatching(/CERRADO/) });
    });
  });

  describe('cierre, definitivas y reapertura', () => {
    it('no se cierra con notas pendientes: dice quién y qué le falta', async () => {
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 4 }]);
      await expect(notas.cerrarPlanilla(ref(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: /3 estudiante/,
        details: expect.arrayContaining([expect.objectContaining({ faltan: expect.arrayContaining(['Autoevaluación']) })]),
      });
      expect(await CalificacionAsignatura.countDocuments({ estado: 'CERRADO' })).toBe(0);
    });

    it('el docente cierra y congela el resultado; cerrada, ni se califica ni se programa', async () => {
      await completarTodo();
      const cerrada = await notas.cerrarPlanilla(ref(), docente);
      expect(cerrada.resumen).toEqual({ PENDIENTE: 0, BORRADOR: 0, CERRADO: 3, DEFINITIVO: 0 });
      expect(cerrada.edicion).toMatchObject({ puede_editar: false, puede_reabrir: true, puede_definitiva: false });

      const registro = (await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!;
      expect(registro).toMatchObject({ estado: 'CERRADO', resultado: { nota_asignatura: 3.25 } });
      expect(JSON.parse(JSON.stringify(registro.resultado!.componentes))).toEqual([
        { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, nota: 2.5 },
        { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, nota: 5 },
      ]);
      expect(String(registro.cerrado_por)).toBe(String(docente._id));

      await expect(guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 5 }])).rejects.toMatchObject({ statusCode: 409, message: /cerrada/ });
      await expect(notas.gradeActivity(a1, [{ student_id: idEst(est1), calificacion_numerica: 5 }], docente)).rejects.toMatchObject({ statusCode: 409 });
      await expect(notas.cerrarPlanilla(ref(), docente)).rejects.toMatchObject({ statusCode: 409, message: /ya está cerrada/ });
      await aprobarPlaneacion(n.asignacion);
      await expect(
        actividades.createActivity(
          {
            teacher_assignment_id: String(n.asignacion._id),
            periodo_numero: 1,
            titulo: 'Tarde',
            descripcion: 'x',
            tipo: 'TAREA',
            componente_siee: 'HETEROEVALUACION',
            peso_en_componente: 1,
            fecha_apertura: new Date(),
            fecha_entrega: proximoDiaHabil(4),
            competencia_evaluada: 'Resuelve problemas con fracciones',
          },
          docente
        )
      ).rejects.toMatchObject({ statusCode: 409, message: /planilla de notas/ });
      expect(await AuditLog.countDocuments({ accion: 'PLANILLA_NOTAS_CERRADA' })).toBe(1);
    });

    it('coordinación la declara definitiva; el docente ya no puede reabrirla, el administrador sí, con motivo', async () => {
      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);

      await expect(notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, docente)).rejects.toMatchObject({ statusCode: 403 });
      const resultado = await notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, e.coordAcademico);
      expect(resultado).toEqual({ definitivas: 1, omitidas: [] });
      expect((await planilla()).resumen.DEFINITIVO).toBe(3);

      // Repetir no hace nada y lo dice.
      const otra = await notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, e.coordAcademico);
      expect(otra).toMatchObject({ definitivas: 0, omitidas: [{ asignatura: 'Matemáticas', grupo: '601', motivo: 'Ya es definitiva.' }] });

      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, docente)).rejects.toMatchObject({ statusCode: 403, message: /DEFINITIVAS/ });
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });

      const reabierta = await notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, e.admin);
      expect(reabierta.resumen).toEqual({ PENDIENTE: 0, BORRADOR: 3, CERRADO: 0, DEFINITIVO: 0 });
      const registro = (await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!;
      expect(registro.resultado).toBeNull();
      expect(registro.reaperturas).toHaveLength(1);
      expect(registro.reaperturas[0]).toMatchObject({ motivo: 'Error en una nota', desde: 'DEFINITIVO' });
      expect(String(registro.reaperturas[0]!.por)).toBe(String(e.admin._id));

      // Reabierta, el docente corrige y vuelve a cerrar con el valor nuevo.
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 5 }]);
      await notas.cerrarPlanilla(ref(), docente);
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.resultado!.nota_asignatura).toBe(3.43);
    });

    it('el docente reabre lo CERRADO (no definitivo) con motivo, y coordinación también', async () => {
      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'x' }, docente)).rejects.toMatchObject({ statusCode: 400, message: /motivo/ });
      await notas.reabrirPlanilla({ ...ref(), motivo: 'Faltaba una nota' }, docente);
      expect((await planilla()).resumen.CERRADO).toBe(0);
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Otra vez' }, docente)).rejects.toMatchObject({ statusCode: 409, message: /no está cerrada/ });

      await notas.cerrarPlanilla(ref(), docente);
      await notas.reabrirPlanilla({ ...ref(), motivo: 'Lo pidió la familia' }, e.coordAcademico);
      expect((await planilla()).resumen.BORRADOR).toBe(3);
      expect(await AuditLog.countDocuments({ accion: 'PLANILLA_NOTAS_REABIERTA' })).toBe(2);
    });

    it('no se declara definitiva una clase que su docente no cerró, y el seguimiento lo muestra', async () => {
      await guardar([{ student_id: idEst(est1), actividad_id: a1, nota: 4 }]);
      const filaAbierta = (await notas.seguimiento({ academic_year_id: n.anioId, periodo_numero: 1 }))[0]!;
      expect(filaAbierta).toMatchObject({ estudiantes: 3, actividades: 2, cerradas: 0, estado: 'ABIERTA', asignacion: { asignatura: { nombre: 'Matemáticas' } } });
      expect(await notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, e.admin)).toMatchObject({
        definitivas: 0,
        omitidas: [{ motivo: 'El docente aún no la ha cerrado.' }],
      });

      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);
      expect((await notas.seguimiento({ academic_year_id: n.anioId, periodo_numero: 1 }))[0]).toMatchObject({ cerradas: 3, estado: 'CERRADA' });
      await notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
      expect((await notas.seguimiento({ academic_year_id: n.anioId, periodo_numero: 1 }))[0]).toMatchObject({ definitivas: 3, estado: 'DEFINITIVA' });
    });
  });

  describe('boletín (M17) solo con notas cerradas', () => {
    const boletin = (clave: typeof est1 = est1) =>
      generateReportCard({ student_id: idEst(clave), academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);

    it('con notas en borrador no hay boletín oficial: no muestra ni promedia nada', async () => {
      await completarTodo();
      const antes = await boletin();
      expect(antes).toMatchObject({ completo: false, pendientes: ['Matemáticas'], puesto_grupo: null, promedio_general_periodo: null, desempeno_general: null });
      expect(antes.areas[0]).toMatchObject({ nota_area: null });
      expect(antes.areas[0]!.asignaturas[0]).toMatchObject({ nota_asignatura: null, estado: 'SIN_CERRAR', componentes: [] });
    });

    it('cerrada la planilla, el boletín toma lo congelado, con sus componentes y el puesto', async () => {
      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);

      const b = await boletin();
      expect(b).toMatchObject({ completo: true, pendientes: [], puesto_grupo: 1, total_estudiantes_grupo: 3, promedio_general_periodo: 3.25 });
      expect(b.desempeno_general).toMatchObject({ nivel: 'BASICO' });
      expect(b.areas[0]!.asignaturas[0]).toMatchObject({
        nombre: 'Matemáticas',
        nota_asignatura: 3.25,
        estado: 'CERRADO',
        componentes: [
          { clave: 'HETEROEVALUACION', nota: 2.5 },
          { clave: 'AUTOEVALUACION', nota: 5 },
        ],
      });

      await notas.declararDefinitivas({ academic_year_id: n.anioId, periodo_numero: 1 }, e.coordAcademico);
      expect((await boletin()).areas[0]!.asignaturas[0]!.estado).toBe('DEFINITIVO');

      // Reabrir devuelve el boletín a «incompleto» hasta que se cierre de nuevo.
      await notas.reabrirPlanilla({ ...ref(), motivo: 'Corrección' }, e.admin);
      expect(await boletin()).toMatchObject({ completo: false, promedio_general_periodo: null });
    });

    it('el ranking solo cuenta a quienes tienen boletín completo', async () => {
      // Notas distintas por estudiante: est1 mejor que est2, est3 cierra igual que est2.
      await guardar([
        { student_id: idEst(est1), actividad_id: a1, nota: 5 },
        { student_id: idEst(est1), actividad_id: a2, nota: 5 },
        { student_id: idEst(est1), componente_clave: 'AUTOEVALUACION', nota: 5 },
        { student_id: idEst(est2), actividad_id: a1, nota: 3 },
        { student_id: idEst(est2), actividad_id: a2, nota: 3 },
        { student_id: idEst(est2), componente_clave: 'AUTOEVALUACION', nota: 3 },
        { student_id: idEst(est3), actividad_id: a1, nota: 3 },
        { student_id: idEst(est3), actividad_id: a2, nota: 3 },
        { student_id: idEst(est3), componente_clave: 'AUTOEVALUACION', nota: 3 },
      ]);
      await notas.cerrarPlanilla(ref(), docente);
      expect((await boletin(est1)).puesto_grupo).toBe(1);
      expect((await boletin(est2)).puesto_grupo).toBe(2);
      expect((await boletin(est3)).puesto_grupo).toBe(2); // empatados comparten puesto
    });
  });

  describe('configuración de componentes (antes de iniciar el año)', () => {
    const enPlanificacion = async () => {
      await AcademicYear.updateOne({}, { $set: { estado: 'PLANIFICACION' } });
    };
    const contexto = () => ({ usuarioId: e.admin._id });

    it('el administrador define los bloques; las claves nuevas las genera el servidor y la suma debe ser 100', async () => {
      await enPlanificacion();
      await Activity.deleteMany({});
      const dto = await anios.actualizarComponentesEvaluativos(
        n.anioId,
        [
          { nombre: 'Heteroevaluación', porcentaje: 60, origen: 'ACTIVIDADES' },
          { nombre: 'Coevaluación', porcentaje: 20, origen: 'NOTA_DIRECTA' },
          { nombre: 'Autoevaluación', porcentaje: 20, origen: 'NOTA_DIRECTA' },
        ],
        contexto()
      );
      expect(dto.componentes_efectivos.map((c) => [c.clave, c.porcentaje])).toEqual([
        ['HETEROEVALUACION', 60],
        ['COEVALUACION', 20],
        ['AUTOEVALUACION', 20],
      ]);
      expect(await AuditLog.countDocuments({ accion: 'COMPONENTES_EVALUATIVOS_ACTUALIZADOS' })).toBe(1);

      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, [{ nombre: 'Único', porcentaje: 90, origen: 'ACTIVIDADES' }], contexto())
      ).rejects.toMatchObject({ statusCode: 400, message: /sumar exactamente 100/ });
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, [{ nombre: 'Solo nota', porcentaje: 100, origen: 'NOTA_DIRECTA' }], contexto())
      ).rejects.toMatchObject({ statusCode: 400, message: /actividades/ });
    });

    it('no se quita ni se deja de alimentar con actividades un bloque que ya tiene actividades', async () => {
      await enPlanificacion();
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, [{ clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 100, origen: 'ACTIVIDADES' }], contexto())
      ).rejects.toMatchObject({ statusCode: 409, message: /HETEROEVALUACION/ });
      await expect(
        anios.actualizarComponentesEvaluativos(
          n.anioId,
          [
            { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 50, origen: 'NOTA_DIRECTA' },
            { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 50, origen: 'ACTIVIDADES' },
          ],
          contexto()
        )
      ).rejects.toMatchObject({ statusCode: 409 });
      // Cambiar porcentajes y nombres sí se puede: la clave se conserva.
      const dto = await anios.actualizarComponentesEvaluativos(
        n.anioId,
        [
          { clave: 'HETEROEVALUACION', nombre: 'Evaluación del docente', porcentaje: 80, origen: 'ACTIVIDADES' },
          { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 20, origen: 'NOTA_DIRECTA' },
        ],
        contexto()
      );
      expect(dto.componentes_efectivos[0]).toMatchObject({ clave: 'HETEROEVALUACION', nombre: 'Evaluación del docente', porcentaje: 80 });
    });

    it('con el año ya activado la configuración queda congelada', async () => {
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, [{ nombre: 'Tarde', porcentaje: 100, origen: 'ACTIVIDADES' }], contexto())
      ).rejects.toMatchObject({ statusCode: 409, message: /congelada/ });
    });

    it('una actividad solo se programa sobre un componente que exista y se alimente de actividades', async () => {
      await aprobarPlaneacion(n.asignacion);
      const base = {
        teacher_assignment_id: String(n.asignacion._id),
        periodo_numero: 1,
        titulo: 'Taller',
        descripcion: 'x',
        tipo: 'TAREA' as const,
        peso_en_componente: 1,
        fecha_apertura: new Date(),
        fecha_entrega: proximoDiaHabil(4),
        competencia_evaluada: 'Resuelve problemas con fracciones',
      };
      await expect(actividades.createActivity({ ...base, componente_siee: 'INVENTADO' }, docente)).rejects.toMatchObject({ statusCode: 400, message: /no existe/ });
      await expect(actividades.createActivity({ ...base, componente_siee: 'AUTOEVALUACION' }, docente)).rejects.toMatchObject({ statusCode: 400, message: /nota directa/ });
      const buena = await actividades.createActivity({ ...base, componente_siee: 'HETEROEVALUACION' }, docente);
      expect(buena.componente_siee).toBe('HETEROEVALUACION');
      const [vista] = await actividades.listActivities({ academic_year_id: n.anioId, teacher_assignment_id: String(n.asignacion._id) }, docente);
      expect(vista).toBeDefined();
      expect((await actividades.listActivities({ academic_year_id: n.anioId }, docente)).every((v) => v.componente_nombre.length > 0)).toBe(true);
    });
  });

  it('un grupo con otra clase no mezcla planillas', async () => {
    const otro = await crearUsuario('DOCENTE');
    await expect(notas.obtenerPlanilla(String(n.asignacion._id), 1, otro)).rejects.toMatchObject({ statusCode: 403 });
  });
});
