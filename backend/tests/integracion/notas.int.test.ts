import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import AuditLog from '../../src/models/auditLog.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import ColumnaPlanilla from '../../src/models/columnaPlanilla.model';
import { UserDocument } from '../../src/models/user.model';
import * as anios from '../../src/services/academicYear.service';
import * as actividades from '../../src/services/activity.service';
import * as casillas from '../../src/services/columnasPlanilla.service';
import * as notas from '../../src/services/notas.service';
import { generateReportCard } from '../../src/services/reportCard.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { aprobarPlaneacion, crearActividad, crearCasillaSuelta, definirComponentes, EscenarioNotas, idAleatorio, prepararNotas, proximoDiaHabil } from './escenarioNotas';

const HETERO = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 10 };
const AUTO = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 };

describe('M12: evaluación y notas (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let a1: string;
  let a2: string;
  /** La única casilla de la autoevaluación (el bloque admite 1). */
  let au: string;
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
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 25))._id);
    a2 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 75))._id);
    au = String((await crearCasillaSuelta(n.asignacion, 'AUTOEVALUACION', 'Autoevaluación'))._id);
  }, 60_000);

  const ref = () => ({ teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 });
  const guardar = (celdas: notas.CeldaPlanilla[], usuario = docente) => notas.guardarCeldas({ ...ref(), celdas }, usuario);
  const planilla = (usuario = docente) => notas.obtenerPlanilla(String(n.asignacion._id), 1, usuario);
  const fila = async (clave: typeof est1, usuario = docente) => (await planilla(usuario)).estudiantes.find((f) => f.estudiante._id === idEst(clave))!;

  /** Todas las notas de los tres estudiantes: 4/2 en las actividades (25%/75%) y 5 de autoevaluación → 3.25. */
  const completarTodo = () =>
    guardar(
      [est1, est2, est3].flatMap((clave) => [
        { student_id: idEst(clave), casilla_id: a1, nota: 4 },
        { student_id: idEst(clave), casilla_id: a2, nota: 2 },
        { student_id: idEst(clave), casilla_id: au, nota: 5 },
      ])
    );

  describe('la planilla se arma con la configuración', () => {
    it('trae un bloque por componente del molde, con sus casillas (actividades y notas sueltas) y su máximo', async () => {
      const p = await planilla();
      expect(p.bloques.map((b) => [b.clave, b.porcentaje, b.max_casillas, b.casillas.length])).toEqual([
        ['HETEROEVALUACION', 70, 10, 2],
        ['AUTOEVALUACION', 30, 1, 1],
      ]);
      expect(p.bloques[0]!.casillas.map((c) => [c.tipo, c.peso, c.peso_efectivo])).toEqual([['ACTIVIDAD', 25, 25], ['ACTIVIDAD', 75, 75]]);
      expect(p.bloques[1]!.casillas[0]).toMatchObject({ tipo: 'MANUAL', titulo: 'Autoevaluación', peso: null, peso_efectivo: 100 });
      expect(p.asignacion).toMatchObject({ grupo: { nomenclatura: '601' }, asignatura: { nombre: 'Matemáticas' } });
      expect(p.estudiantes).toHaveLength(3);
      expect(p.estudiantes[0]).toMatchObject({ estado: 'PENDIENTE', nota_asignatura: null, desempeno: null });
      expect(p.escala).toMatchObject({ nota_minima: 1, nota_maxima: 5 });
      expect(p.edicion).toMatchObject({ puede_editar: true, puede_cerrar: false });
    });

    it('sin molde definido usa Saber/Hacer/Ser, y las actividades anteriores a M12 siguen valiendo', async () => {
      await AcademicYear.updateOne({}, { $set: { componentes_evaluativos: [] } });
      await crearActividad(n.asignacion, 'COGNITIVO_SABER', null);
      const p = await planilla();
      expect(p.bloques.map((b) => [b.clave, b.porcentaje, b.max_casillas])).toEqual([
        ['COGNITIVO_SABER', 40, 10],
        ['PROCEDIMENTAL_HACER', 40, 10],
        ['ACTITUDINAL_SER', 20, 10],
      ]);
      expect(p.bloques[0]?.casillas).toHaveLength(1);
    });

    it('los pesos sin definir se reparten por igual lo que queda del bloque', async () => {
      await Activity.updateOne({ _id: a1 }, { $set: { peso_en_componente: 40 } });
      await Activity.updateOne({ _id: a2 }, { $set: { peso_en_componente: null } });
      await crearActividad(n.asignacion, 'HETEROEVALUACION', null);
      const hetero = (await planilla()).bloques[0]!;
      expect(hetero.pesos_puestos).toBe(40);
      expect(hetero.casillas.map((c) => c.peso_efectivo)).toEqual([40, 30, 30]);
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
        { student_id: idEst(est1), casilla_id: a1, nota: 4 },
        { student_id: idEst(est1), casilla_id: a2, nota: 2 },
      ]);
      expect(await fila(est1)).toMatchObject({
        estado: 'PENDIENTE',
        parcial: true,
        nota_asignatura: 2.5,
        bloques: { HETEROEVALUACION: 2.5, AUTOEVALUACION: null },
        faltantes: ['AUTOEVALUACION'],
      });

      await guardar([{ student_id: idEst(est1), casilla_id: au, nota: 5 }]);
      expect(await fila(est1)).toMatchObject({ estado: 'BORRADOR', parcial: false, nota_asignatura: 3.25, desempeno: { nivel: 'BASICO' } });
      expect(await fila(est2)).toMatchObject({ estado: 'PENDIENTE', nota_asignatura: null });
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.estado).toBe('BORRADOR');
    });

    it('cada cambio queda en el historial con quién y cuándo, y repetir una nota no genera ruido', async () => {
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }]);
      const repetida = await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }]);
      expect(repetida).toMatchObject({ guardadas: 0, sin_cambios: 1 });
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 4.5 }]);
      await guardar([{ student_id: idEst(est1), casilla_id: au, nota: 3 }]);
      await guardar([{ student_id: idEst(est1), casilla_id: au, nota: 4 }]);

      const entrega = (await ActivitySubmission.findOne({ activity_id: a1, student_id: idEst(est1) }))!;
      expect(entrega.historial_notas.map((h) => [h.valor_anterior, h.valor_nuevo, String(h.por)])).toEqual([
        [null, 3, String(docente._id)],
        [3, 4.5, String(docente._id)],
      ]);
      const suelta = (await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.notas_columnas[0]!;
      expect(suelta.historial.map((h) => [h.valor_anterior, h.valor_nuevo])).toEqual([[null, 3], [3, 4]]);
      expect(await AuditLog.countDocuments({ accion: 'NOTAS_REGISTRADAS' })).toBe(4);
    });

    it('guardar la nota de una actividad no pisa la retroalimentación ni la entrega del estudiante', async () => {
      await notas.gradeActivity(a1, [{ student_id: idEst(est1), calificacion_numerica: 3, retroalimentacion: 'Revisa el punto 2' }], docente);
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 4 }]);
      expect((await ActivitySubmission.findOne({ activity_id: a1, student_id: idEst(est1) }))!).toMatchObject({
        calificacion_numerica: 4,
        retroalimentacion: 'Revisa el punto 2',
        estado: 'CALIFICADA',
      });
    });

    it('valida todo antes de escribir: una celda inválida no deja guardar ninguna', async () => {
      const intentos: Array<[notas.CeldaPlanilla, number, RegExp]> = [
        [{ student_id: idEst(est2), casilla_id: a2, nota: 6 }, 400, /fuera de la escala/],
        [{ student_id: idAleatorio(), casilla_id: a2, nota: 3 }, 400, /no está matriculado/],
        [{ student_id: idEst(est2), casilla_id: idAleatorio(), nota: 3 }, 400, /no pertenece a esta clase/],
      ];
      for (const [celda, estado, mensaje] of intentos) {
        await expect(guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }, celda])).rejects.toMatchObject({ statusCode: estado, message: mensaje });
      }
      await expect(
        guardar([
          { student_id: idEst(est1), casilla_id: a1, nota: 3 },
          { student_id: idEst(est1), casilla_id: a1, nota: 4 },
        ])
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/dos veces/) });
      expect(await ActivitySubmission.countDocuments()).toBe(0);
      expect(await CalificacionAsignatura.countDocuments()).toBe(0);
    });

    it('solo el titular escribe, y solo mientras el periodo admite notas', async () => {
      await expect(guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }], e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }], e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });

      const anio = (await AcademicYear.findOne())!;
      anio.periodos.find((p) => p.numero === 1)!.estado = 'CERRADO';
      await anio.save();
      await expect(guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 3 }])).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/CERRADO/) });
      expect((await planilla()).edicion).toMatchObject({ puede_editar: false, motivo: expect.stringMatching(/CERRADO/) });
    });
  });

  describe('cierre, definitivas y reapertura', () => {
    it('no se cierra con notas pendientes: dice quién y qué le falta', async () => {
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 4 }]);
      await expect(notas.cerrarPlanilla(ref(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/3 estudiante/),
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

      await expect(guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 5 }])).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrada/) });
      await expect(notas.gradeActivity(a1, [{ student_id: idEst(est1), calificacion_numerica: 5 }], docente)).rejects.toMatchObject({ statusCode: 409 });
      await expect(notas.cerrarPlanilla(ref(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya está cerrada/) });
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
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/planilla de notas/) });
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

      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, docente)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/DEFINITIVAS/) });
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });

      const reabierta = await notas.reabrirPlanilla({ ...ref(), motivo: 'Error en una nota' }, e.admin);
      expect(reabierta.resumen).toEqual({ PENDIENTE: 0, BORRADOR: 3, CERRADO: 0, DEFINITIVO: 0 });
      const registro = (await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!;
      expect(registro.resultado).toBeNull();
      expect(registro.reaperturas).toHaveLength(1);
      expect(registro.reaperturas[0]).toMatchObject({ motivo: 'Error en una nota', desde: 'DEFINITIVO' });
      expect(String(registro.reaperturas[0]!.por)).toBe(String(e.admin._id));

      // Reabierta, el docente corrige y vuelve a cerrar con el valor nuevo.
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 5 }]);
      await notas.cerrarPlanilla(ref(), docente);
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.resultado!.nota_asignatura).toBe(3.43);
    });

    it('el docente reabre lo CERRADO (no definitivo) con motivo, y coordinación también', async () => {
      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'x' }, docente)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/motivo/) });
      await notas.reabrirPlanilla({ ...ref(), motivo: 'Faltaba una nota' }, docente);
      expect((await planilla()).resumen.CERRADO).toBe(0);
      await expect(notas.reabrirPlanilla({ ...ref(), motivo: 'Otra vez' }, docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/no está cerrada/) });

      await notas.cerrarPlanilla(ref(), docente);
      await notas.reabrirPlanilla({ ...ref(), motivo: 'Lo pidió la familia' }, e.coordAcademico);
      expect((await planilla()).resumen.BORRADOR).toBe(3);
      expect(await AuditLog.countDocuments({ accion: 'PLANILLA_NOTAS_REABIERTA' })).toBe(2);
    });

    it('no se declara definitiva una clase que su docente no cerró, y el seguimiento lo muestra', async () => {
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 4 }]);
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
        { student_id: idEst(est1), casilla_id: a1, nota: 5 },
        { student_id: idEst(est1), casilla_id: a2, nota: 5 },
        { student_id: idEst(est1), casilla_id: au, nota: 5 },
        { student_id: idEst(est2), casilla_id: a1, nota: 3 },
        { student_id: idEst(est2), casilla_id: a2, nota: 3 },
        { student_id: idEst(est2), casilla_id: au, nota: 3 },
        { student_id: idEst(est3), casilla_id: a1, nota: 3 },
        { student_id: idEst(est3), casilla_id: a2, nota: 3 },
        { student_id: idEst(est3), casilla_id: au, nota: 3 },
      ]);
      await notas.cerrarPlanilla(ref(), docente);
      expect((await boletin(est1)).puesto_grupo).toBe(1);
      expect((await boletin(est2)).puesto_grupo).toBe(2);
      expect((await boletin(est3)).puesto_grupo).toBe(2); // empatados comparten puesto
    });
  });

  describe('el molde de la planilla (configuración del año)', () => {
    const enPlanificacion = async () => {
      await AcademicYear.updateOne({}, { $set: { estado: 'PLANIFICACION' } });
    };
    const contexto = () => ({ usuarioId: e.admin._id });
    const molde = (...bloques: Array<{ clave?: string; nombre: string; porcentaje: number; max_casillas: number }>) => bloques;

    it('el administrador define los bloques con su máximo de casillas; las claves nuevas las genera el servidor y la suma debe ser 100', async () => {
      await enPlanificacion();
      const dto = await anios.actualizarComponentesEvaluativos(
        n.anioId,
        molde(
          { nombre: 'Heteroevaluación', porcentaje: 60, max_casillas: 30 },
          { nombre: 'Coevaluación', porcentaje: 20, max_casillas: 1 },
          { nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 }
        ),
        contexto()
      );
      expect(dto.componentes_efectivos.map((c) => [c.clave, c.porcentaje, c.max_casillas])).toEqual([
        ['HETEROEVALUACION', 60, 30],
        ['COEVALUACION', 20, 1],
        ['AUTOEVALUACION', 20, 1],
      ]);
      expect(await AuditLog.countDocuments({ accion: 'COMPONENTES_EVALUATIVOS_ACTUALIZADOS' })).toBe(1);

      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, molde({ clave: 'HETEROEVALUACION', nombre: 'Único', porcentaje: 90, max_casillas: 5 }, { clave: 'AUTOEVALUACION', nombre: 'Auto', porcentaje: 0, max_casillas: 1 }), contexto())
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/sumar exactamente 100/) });
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, molde({ nombre: 'Sin lugar', porcentaje: 100, max_casillas: 0 }), contexto())
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/casillas máximas/) });
    });

    it('no se quita un bloque que ya tiene casillas ni se baja su máximo por debajo de lo usado', async () => {
      await enPlanificacion();
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, molde({ clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 100, max_casillas: 1 }), contexto())
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/HETEROEVALUACION/) });
      await expect(
        anios.actualizarComponentesEvaluativos(
          n.anioId,
          molde({ clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 1 }, { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 }),
          contexto()
        )
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/máximo no puede ser menor/) });
      // Cambiar porcentajes, nombres y subir el máximo sí se puede: la clave se conserva.
      const dto = await anios.actualizarComponentesEvaluativos(
        n.anioId,
        molde(
          { clave: 'HETEROEVALUACION', nombre: 'Evaluación del docente', porcentaje: 80, max_casillas: 30 },
          { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 }
        ),
        contexto()
      );
      expect(dto.componentes_efectivos[0]).toMatchObject({ clave: 'HETEROEVALUACION', nombre: 'Evaluación del docente', porcentaje: 80, max_casillas: 30 });
    });

    it('con el año vigente el molde se ajusta hasta la primera nota; después queda congelado', async () => {
      const nuevos = molde(
        { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 80, max_casillas: 10 },
        { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 }
      );
      // El año está EN_CURSO y todavía no tiene ninguna nota: se puede ajustar (y la lista de años lo avisa a la pantalla).
      expect((await anios.listarAnios())[0]).toMatchObject({ estado: 'EN_CURSO', evaluacion_editable: true });
      const ajustado = await anios.actualizarComponentesEvaluativos(n.anioId, nuevos, contexto());
      expect(ajustado.componentes_efectivos.map((c) => c.porcentaje)).toEqual([80, 20]);

      // La primera nota (aunque sea de una sola casilla) lo congela.
      await guardar([{ student_id: idEst(est1), casilla_id: a1, nota: 4 }]);
      expect((await anios.listarAnios())[0]).toMatchObject({ evaluacion_editable: false });
      await expect(anios.actualizarComponentesEvaluativos(n.anioId, nuevos, contexto())).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/primera nota/),
      });
      const escala = { nota_minima: 1, nota_maxima: 5, nota_aprobatoria: 3, rangos: [] as never[] };
      await expect(anios.actualizarEscalaEvaluacion(n.anioId, escala as never, contexto())).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/congelada/),
      });
    });

    it('un año cerrado nunca se configura', async () => {
      await AcademicYear.updateOne({}, { $set: { estado: 'CERRADO' } });
      await expect(
        anios.actualizarComponentesEvaluativos(n.anioId, molde({ nombre: 'Tarde', porcentaje: 100, max_casillas: 5 }), contexto())
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrado/) });
      expect((await anios.listarAnios())[0]).toMatchObject({ evaluacion_editable: false });
    });

    it('el año nuevo arranca con el molde del más reciente que lo definió', async () => {
      const periodos = [1, 2].map((numero) => ({
        numero,
        nombre: `Periodo ${numero}`,
        porcentaje: 50,
        fecha_inicio: new Date(Date.UTC(2099, numero === 1 ? 0 : 6, 1)),
        fecha_fin: new Date(Date.UTC(2099, numero === 1 ? 5 : 11, 30)),
      }));
      const nuevo = await anios.crearAnio(
        { year: 2099, calendario: 'A', fecha_inicio: new Date(Date.UTC(2099, 0, 1)), fecha_fin: new Date(Date.UTC(2099, 11, 30)), periodos } as never,
        contexto()
      );
      expect(nuevo.componentes_efectivos.map((c) => [c.clave, c.porcentaje, c.max_casillas])).toEqual([
        ['HETEROEVALUACION', 70, 10],
        ['AUTOEVALUACION', 30, 1],
      ]);
    });

    it('una actividad solo se programa sobre un bloque que exista y tenga lugar', async () => {
      await aprobarPlaneacion(n.asignacion);
      const base = {
        teacher_assignment_id: String(n.asignacion._id),
        periodo_numero: 1,
        titulo: 'Taller',
        descripcion: 'x',
        tipo: 'TAREA' as const,
        peso_en_componente: null,
        fecha_apertura: new Date(),
        fecha_entrega: proximoDiaHabil(4),
        competencia_evaluada: 'Resuelve problemas con fracciones',
      };
      await expect(actividades.createActivity({ ...base, componente_siee: 'INVENTADO' }, docente)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no existe/) });
      // La autoevaluación admite una sola casilla y ya la ocupa la nota suelta.
      await expect(actividades.createActivity({ ...base, componente_siee: 'AUTOEVALUACION' }, docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/su máximo es 1/) });
      const buena = await actividades.createActivity({ ...base, componente_siee: 'HETEROEVALUACION' }, docente);
      expect(buena.componente_siee).toBe('HETEROEVALUACION');
      expect(buena.peso_en_componente).toBeNull();
      const [vista] = await actividades.listActivities({ academic_year_id: n.anioId, teacher_assignment_id: String(n.asignacion._id) }, docente);
      expect(vista).toBeDefined();
      expect((await actividades.listActivities({ academic_year_id: n.anioId }, docente)).every((v) => v.componente_nombre.length > 0)).toBe(true);
    });
  });

  describe('las casillas que arma el docente', () => {
    const base = () => ({ teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 });
    const hetero = async () => (await planilla()).bloques.find((b) => b.clave === 'HETEROEVALUACION')!;

    it('agrega una nota suelta a un bloque con lugar, y el bloque lleno la rechaza', async () => {
      const quiz = await casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'Quiz sorpresa' }, docente);
      expect((await hetero()).casillas.map((c) => c.titulo)).toContain('Quiz sorpresa');
      expect(quiz.peso).toBeNull();
      expect(await AuditLog.countDocuments({ accion: 'CASILLA_PLANILLA_CREADA' })).toBe(1);

      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'AUTOEVALUACION', nombre: 'Otra' }, docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/su máximo es 1/),
      });
      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'NO_EXISTE', nombre: 'x' }, docente)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no existe/) });
    });

    it('el máximo del bloque se respeta también con actividades y notas sueltas mezcladas', async () => {
      await definirComponentes([{ ...HETERO, max_casillas: 3 }, AUTO]);
      await casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'Tercera' }, docente);
      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'Cuarta' }, docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('el peso de la casilla cambia el cálculo del bloque', async () => {
      await guardar([
        { student_id: idEst(est1), casilla_id: a1, nota: 4 },
        { student_id: idEst(est1), casilla_id: a2, nota: 2 },
      ]);
      expect((await fila(est1)).bloques.HETEROEVALUACION).toBe(2.5); // 25% / 75%
      await casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: 50 }, { casilla_id: a2, peso: 50 }] }, docente);
      expect((await fila(est1)).bloques.HETEROEVALUACION).toBe(3);
      // Devuelta a automático, las dos valen lo mismo.
      await casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: null }, { casilla_id: a2, peso: null }] }, docente);
      expect((await fila(est1)).bloques.HETEROEVALUACION).toBe(3);
      expect((await hetero()).pesos_puestos).toBe(0);
      expect(await AuditLog.countDocuments({ accion: 'PESOS_PLANILLA_ACTUALIZADOS' })).toBe(2);
    });

    it('los pesos puestos en un bloque no pasan de 100% y no se escribe nada a medias', async () => {
      await expect(casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: 70 }, { casilla_id: a2, peso: 40 }] }, docente)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/no pueden sumar más de 100%/),
      });
      expect((await Activity.findById(a1))!.peso_en_componente).toBe(25);
      expect((await Activity.findById(a2))!.peso_en_componente).toBe(75);

      await expect(casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: 10 }, { casilla_id: a1, peso: 20 }] }, docente)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/repetida/),
      });
      await expect(casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: idAleatorio(), peso: 10 }] }, docente)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/no pertenece a esta clase/),
      });
    });

    it('una nota suelta se renombra, se mueve de bloque y se pesa; una actividad solo se mueve y se pesa', async () => {
      await definirComponentes([HETERO, { ...AUTO, max_casillas: 2 }]);
      const suelta = await casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'Quiz' }, docente);
      await casillas.actualizarCasilla(String(suelta._id), { nombre: 'Quiz 1', bloque_clave: 'AUTOEVALUACION', peso: 40 }, docente);
      expect(await ColumnaPlanilla.findById(suelta._id)).toMatchObject({ nombre: 'Quiz 1', bloque_clave: 'AUTOEVALUACION', peso: 40 });

      await expect(casillas.actualizarCasilla(a1, { nombre: 'Otro título' }, docente)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/Actividades y tareas/),
      });
      await casillas.actualizarCasilla(a1, { peso: 10 }, docente);
      expect((await Activity.findById(a1))!.peso_en_componente).toBe(10);

      // El bloque de destino está lleno (la autoevaluación admite 2 y ya tiene la nota suelta y «Quiz 1»).
      await expect(casillas.actualizarCasilla(a2, { bloque_clave: 'AUTOEVALUACION' }, docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('eliminar una nota suelta se lleva las notas que tenía; una actividad se elimina en M11', async () => {
      await guardar([{ student_id: idEst(est1), casilla_id: au, nota: 4 }]);
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.notas_columnas).toHaveLength(1);

      await casillas.eliminarCasilla(au, docente);
      expect(await ColumnaPlanilla.countDocuments()).toBe(0);
      expect((await CalificacionAsignatura.findOne({ student_id: idEst(est1) }))!.notas_columnas).toHaveLength(0);
      expect(await AuditLog.countDocuments({ accion: 'CASILLA_PLANILLA_ELIMINADA' })).toBe(1);

      await expect(casillas.eliminarCasilla(a1, docente)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Actividades y tareas/) });
    });

    it('solo el titular, y solo con la planilla abierta', async () => {
      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'x' }, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: 10 }] }, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });

      await completarTodo();
      await notas.cerrarPlanilla(ref(), docente);
      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'Tarde' }, docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/cerrada/),
      });
      await expect(casillas.establecerPesos({ ...base(), pesos: [{ casilla_id: a1, peso: 10 }] }, docente)).rejects.toMatchObject({ statusCode: 409 });
      await expect(casillas.eliminarCasilla(au, docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('coordinación consulta los bloques de la clase pero no los cambia', async () => {
      const vistos = await casillas.obtenerBloques(String(n.asignacion._id), 1, e.coordAcademico);
      expect(vistos.map((b) => b.clave)).toEqual(['HETEROEVALUACION', 'AUTOEVALUACION']);
      await expect(casillas.crearCasilla({ ...base(), bloque_clave: 'HETEROEVALUACION', nombre: 'x' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  it('un grupo con otra clase no mezcla planillas', async () => {
    const otro = await crearUsuario('DOCENTE');
    await expect(notas.obtenerPlanilla(String(n.asignacion._id), 1, otro)).rejects.toMatchObject({ statusCode: 403 });
  });
});
