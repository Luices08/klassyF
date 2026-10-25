import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Recuperacion from '../../src/models/recuperacion.model';
import { UserDocument } from '../../src/models/user.model';
import * as notas from '../../src/services/notas.service';
import { misNotas, misNotasDelAnio } from '../../src/services/notasEstudiante.service';
import { generateReportCard } from '../../src/services/reportCard.service';
import { etapasNotaEfectiva } from '../../src/utils/notaEfectiva';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { crearActividad, crearCasillaSuelta, definirComponentes, EscenarioNotas, prepararNotas } from './escenarioNotas';

const HETERO = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 10 };
const AUTO = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 };

describe('M18: la recuperación se refleja en Mis notas, el resumen del año, la planilla, el boletín y las estadísticas (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let a1: string;
  let au: string;
  const idEst = (u: UserDocument) => String(u._id);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes(), CalificacionAsignatura.syncIndexes(), Recuperacion.syncIndexes()]);
    e = await armarEscenario();
    docente = e.docenteDeClase;
    n = await prepararNotas(e);
    await definirComponentes([HETERO, AUTO]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', null))._id);
    au = String((await crearCasillaSuelta(n.asignacion, 'AUTOEVALUACION', 'Autoevaluación'))._id);
  }, 60_000);

  const ref = () => ({ teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 });

  /** Cierra el periodo 1: el primer estudiante pierde la asignatura (hetero 2, auto 2 → 2.00); los otros dos aprueban (4.30). */
  async function cerrarPeriodo1(): Promise<void> {
    await notas.guardarCeldas(
      {
        ...ref(),
        celdas: [
          { student_id: idEst(e.estudiante), casilla_id: a1, nota: 2 },
          { student_id: idEst(e.estudiante), casilla_id: au, nota: 2 },
          ...[e.otroEstudiante, e.tercerEstudiante].flatMap((u) => [
            { student_id: idEst(u), casilla_id: a1, nota: 4 },
            { student_id: idEst(u), casilla_id: au, nota: 5 },
          ]),
        ],
      },
      docente
    );
    await notas.cerrarPlanilla(ref(), docente);
  }

  async function recuperar(estudiante: UserDocument, original: number, resultante: number, opciones: { cuenta?: boolean; tipo?: 'PERIODO' | 'ANUAL' } = {}) {
    const tipo = opciones.tipo ?? 'PERIODO';
    return Recuperacion.create({
      academic_year_id: n.anioId,
      teacher_assignment_id: n.asignacion._id,
      group_id: n.grupoId,
      subject_id: n.materiaId,
      student_id: estudiante._id,
      tipo,
      periodo_numero: tipo === 'ANUAL' ? 0 : 1,
      nota_original: original,
      efecto_aplicado: 'REEMPLAZA',
      integracion: { modo: 'NOTA_FINAL', bloque_clave: '', peso: null, solo_si_mejora: true, tope_aprobatoria: false, cuenta_en_boletin: opciones.cuenta ?? true },
      componentes: [],
      detalle: '',
      intentos: [{ nota: resultante, fecha: new Date(), registrado_por: docente._id, observacion: '' }],
      nota_resultante: resultante,
      estado: resultante >= 3 ? 'SUPERADA' : 'NO_SUPERADA',
    });
  }

  describe('«Mis notas» del estudiante (y, con ella, el portal del acudiente)', () => {
    it('muestra la nota con la recuperación y conserva la anterior', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4);

      const asignatura = (await misNotas(e.estudiante, 1, n.anioId)).asignaturas[0]!;
      expect(asignatura.estado).toBe('CERRADO');
      expect(asignatura.nota_asignatura).toBe(3.4);
      expect(asignatura.desempeno?.nivel).toBe('BASICO');
      expect(asignatura.recuperacion).toMatchObject({ nota_original: 2, nota_resultante: 3.4, estado: 'SUPERADA', cuenta: true, intentos: 1 });
    });

    it('quien no recuperó no cambia', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4);

      const asignatura = (await misNotas(e.otroEstudiante, 1, n.anioId)).asignaturas[0]!;
      expect(asignatura.nota_asignatura).toBe(4.3);
      expect(asignatura.recuperacion).toBeNull();
    });

    it('una recuperación que no se superó muestra el intento pero la asignatura sigue perdida', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 2.6);

      const asignatura = (await misNotas(e.estudiante, 1, n.anioId)).asignaturas[0]!;
      expect(asignatura.nota_asignatura).toBe(2.6);
      expect(asignatura.desempeno?.nivel).toBe('BAJO');
      expect(asignatura.recuperacion?.estado).toBe('NO_SUPERADA');
    });

    it('si el colegio dejó la recuperación «solo anotada», la nota que vale es la original', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4, { cuenta: false });

      const asignatura = (await misNotas(e.estudiante, 1, n.anioId)).asignaturas[0]!;
      expect(asignatura.nota_asignatura).toBe(2);
      expect(asignatura.recuperacion).toMatchObject({ nota_resultante: 3.4, cuenta: false });
    });

    it('con la planilla abierta no hay recuperación que mostrar (la nota es la provisional de siempre)', async () => {
      const asignatura = (await misNotas(e.estudiante, 1, n.anioId)).asignaturas[0]!;
      expect(asignatura.recuperacion).toBeNull();
    });
  });

  describe('planilla del docente', () => {
    it('la fila cerrada trae la recuperación y la nota que vale, sin tocar la nota cerrada', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4);

      const planilla = await notas.obtenerPlanilla(String(n.asignacion._id), 1, docente);
      const fila = planilla.estudiantes.find((f) => f.estudiante._id === idEst(e.estudiante))!;
      expect(fila.nota_asignatura).toBe(2);
      expect(fila.nota_efectiva).toBe(3.4);
      expect(fila.recuperacion).toMatchObject({ nota_original: 2, nota_resultante: 3.4 });
      const otra = planilla.estudiantes.find((f) => f.estudiante._id === idEst(e.otroEstudiante))!;
      expect(otra.recuperacion).toBeNull();
      expect(otra.nota_efectiva).toBe(4.3);
    });
  });

  describe('boletín y estadísticas: la misma nota', () => {
    it('el boletín, «Mis notas» y la agregación de las estadísticas dicen lo mismo', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4);

      const boletin = await generateReportCard({ student_id: idEst(e.estudiante), academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
      const delBoletin = boletin.areas.flatMap((a) => a.asignaturas)[0]!;
      const deMisNotas = (await misNotas(e.estudiante, 1, n.anioId)).asignaturas[0]!;
      expect(delBoletin.nota_asignatura).toBe(3.4);
      expect(deMisNotas.nota_asignatura).toBe(delBoletin.nota_asignatura);

      const filas = await CalificacionAsignatura.aggregate<{ student_id: unknown; nota_efectiva: number }>([
        { $match: { periodo_numero: 1, estado: { $in: ['CERRADO', 'DEFINITIVO'] } } },
        ...etapasNotaEfectiva(),
        { $project: { student_id: 1, nota_efectiva: 1 } },
      ]);
      const porEstudiante = new Map(filas.map((f) => [String(f.student_id), f.nota_efectiva]));
      expect(porEstudiante.get(idEst(e.estudiante))).toBe(3.4);
      expect(porEstudiante.get(idEst(e.otroEstudiante))).toBe(4.3);
    });

    it('la agregación respeta «solo anotada»', async () => {
      await cerrarPeriodo1();
      await recuperar(e.estudiante, 2, 3.4, { cuenta: false });
      const [fila] = await CalificacionAsignatura.aggregate<{ nota_efectiva: number }>([
        { $match: { periodo_numero: 1, student_id: e.estudiante._id } },
        ...etapasNotaEfectiva(),
      ]);
      expect(fila!.nota_efectiva).toBe(2);
    });
  });

  describe('resumen del año con la recuperación de fin de año', () => {
    /** Notas cerradas de los periodos 2, 3 y 4 (el 1 ya está cerrado por la planilla): sin esos cierres no hay definitiva del año. */
    async function cerrarElResto(nota: number): Promise<void> {
      await CalificacionAsignatura.insertMany(
        [2, 3, 4].map((periodo) => ({
          academic_year_id: n.anioId,
          teacher_assignment_id: n.asignacion._id,
          group_id: n.grupoId,
          subject_id: n.materiaId,
          periodo_numero: periodo,
          student_id: e.estudiante._id,
          estado: 'DEFINITIVO',
          resultado: { componentes: [], nota_asignatura: nota },
        }))
      );
    }

    it('trae la nota de cada periodo, la definitiva y la nota final con la recuperación anual', async () => {
      await cerrarPeriodo1();
      await cerrarElResto(2.5);
      // Definitiva ponderada 30/30/20/20: 2.0×0.3 + 2.5×0.7 = 2.35, que la escala del colegio (1 decimal) deja en 2.4 → pierde.
      let resumen = (await misNotasDelAnio(e.estudiante, n.anioId)).asignaturas[0]!;
      expect(resumen.periodos.map((p) => p.nota)).toEqual([2, 2.5, 2.5, 2.5]);
      expect(resumen.definitiva).toBeCloseTo(2.4, 2);
      expect(resumen.recuperacion_anual).toBeNull();
      expect(resumen.nota_final).toBeCloseTo(2.4, 2);

      await recuperar(e.estudiante, 2.4, 3.0, { tipo: 'ANUAL' });
      resumen = (await misNotasDelAnio(e.estudiante, n.anioId)).asignaturas[0]!;
      expect(resumen.recuperacion_anual).toMatchObject({ nota_original: expect.closeTo(2.4, 2), nota_resultante: 3, estado: 'SUPERADA' });
      expect(resumen.nota_final).toBe(3);
      expect(resumen.desempeno?.nivel).toBe('BASICO');
    });

    it('la recuperación de un periodo cambia la nota de ese periodo y la definitiva', async () => {
      await cerrarPeriodo1();
      await cerrarElResto(3.5);
      await recuperar(e.estudiante, 2, 3.4);
      const resumen = (await misNotasDelAnio(e.estudiante, n.anioId)).asignaturas[0]!;
      expect(resumen.periodos[0]).toMatchObject({ nota: 3.4, nota_original: 2 });
      expect(resumen.periodos[0]!.recuperacion?.estado).toBe('SUPERADA');
      // 3.4×0.3 + 3.5×0.7 = 3.47, que con 1 decimal es 3.5 (con la nota original 2.0 sería 3.1).
      expect(resumen.definitiva).toBeCloseTo(3.5, 2);
    });

    it('mientras falte un periodo por cerrar no hay definitiva ni nota final', async () => {
      await cerrarPeriodo1();
      const resumen = (await misNotasDelAnio(e.estudiante, n.anioId)).asignaturas[0]!;
      expect(resumen.definitiva).toBeNull();
      expect(resumen.nota_final).toBeNull();
    });

    it('solo trae lo propio: quien no es el estudiante no ve sus notas', async () => {
      await cerrarPeriodo1();
      const deOtro = (await misNotasDelAnio(e.otroEstudiante, n.anioId)).asignaturas[0]!;
      expect(deOtro.periodos[0]!.nota).toBe(4.3);
      expect(deOtro.recuperacion_anual).toBeNull();
    });
  });
});
