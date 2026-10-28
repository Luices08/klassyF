import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import ConfirmacionContinuidad from '../../src/models/confirmacionContinuidad.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import User from '../../src/models/user.model';
import { UserDocument } from '../../src/models/user.model';
import { verificarCierre } from '../../src/services/academicYear.service';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { registrarContinuidad } from '../../src/services/continuidad.service';
import { asegurarConfiguracion } from '../../src/services/foliatura.service';
import { obtenerDisponibilidadCupos } from '../../src/services/cuposAdmision.service';
import { ejecutarRollover, simularRollover } from '../../src/services/rolloverPromocion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M19: del cierre del año a las matrículas definitivas del siguiente.
describe('M19: rollover al año siguiente', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let destinoId: string;
  let septimoId: string;

  async function cerrarNotas(estudiante: UserDocument, nota: number) {
    for (const periodo of [1, 2, 3, 4]) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      });
    }
  }

  /** El año siguiente, en planificación, con grupos de sexto y de séptimo en la misma sede y jornada. */
  async function armarAnioSiguiente(cupoSeptimo = 40) {
    const origen = (await AcademicYear.findById(n.anioId))!;
    const sexto = (await Group.findById(n.grupoId))!;
    const anio = origen.year + 1;
    const periodos = [1, 2, 3, 4].map((numero) => ({
      numero,
      nombre: `Periodo ${numero}`,
      porcentaje: 25,
      fecha_inicio: new Date(Date.UTC(anio, (numero - 1) * 3, 1)),
      fecha_fin: new Date(Date.UTC(anio, numero * 3, 0)),
      estado: 'PROGRAMADO',
    }));
    const destino = await AcademicYear.create({
      institucion_id: origen.institucion_id,
      year: anio,
      nombre: `Año ${anio}`,
      calendario: 'A',
      fecha_inicio: new Date(Date.UTC(anio, 0, 1)),
      fecha_fin: new Date(Date.UTC(anio, 11, 31)),
      estado: 'PLANIFICACION',
      periodos,
    });
    destinoId = String(destino._id);
    const septimo = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
    const base = { sede_id: sexto.sede_id, academic_year_id: destino._id, jornada_id: sexto.jornada_id };
    await Group.create({ ...base, grade_id: sexto.grade_id, nomenclatura: '601', max_capacity: 40 });
    const g7 = await Group.create({ ...base, grade_id: septimo._id, nomenclatura: '701', max_capacity: cupoSeptimo });
    septimoId = String(g7._id);
  }

  const filtros = () => ({ origen_id: n.anioId, destino_id: destinoId, continuidad: 'TODOS' as const });
  const filaDe = async (u: UserDocument) => (await simularRollover(filtros(), e.admin)).filas.find((f) => f.student_id === String(u._id))!;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    await cerrarNotas(e.estudiante, 4);
    await cerrarNotas(e.otroEstudiante, 2);
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    await armarAnioSiguiente();
    await asegurarConfiguracion();
  }, 60_000);

  it('simula sin escribir: el promovido va al grado siguiente; quien espera recuperación y el retirado no se matriculan', async () => {
    const plan = await simularRollover(filtros(), e.coordAcademico);
    expect(plan.resumen).toMatchObject({ total: 2, por_crear: 1, no_aplica: 1, sin_cupo: 0 });
    expect(plan.retirados).toBe(1);
    expect(await filaDe(e.estudiante)).toMatchObject({ destino: 'GRADO_SIGUIENTE', estado: 'POR_CREAR', tipo_ingreso: 'ANTIGUO', grupo_destino: 'Séptimo 701', paz_y_salvo: 'PENDIENTE' });
    expect(await filaDe(e.otroEstudiante)).toMatchObject({ destino: 'SIN_DECISION', estado: 'NO_APLICA', resultado: 'PENDIENTE_RECUPERACION' });
    expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);
    await expect(simularRollover(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('el año de destino debe ser otro, posterior y no estar cerrado', async () => {
    await expect(simularRollover({ origen_id: n.anioId, destino_id: n.anioId }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(simularRollover({ origen_id: destinoId, destino_id: n.anioId }, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/posterior/) });
    await AcademicYear.updateOne({ _id: destinoId }, { estado: 'CERRADO' });
    await expect(simularRollover(filtros(), e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrado/) });
  });

  it('asienta la matrícula definitiva con Libro y Folio, solo por ADMIN/SECRETARIA, y repetirlo no duplica', async () => {
    await expect(ejecutarRollover(filtros(), CLAVE, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(ejecutarRollover(filtros(), 'otra', e.admin)).rejects.toMatchObject({ statusCode: 401 });

    const r = await ejecutarRollover(filtros(), CLAVE, e.admin);
    expect(r).toMatchObject({ creadas: 1 });
    const m = (await Enrollment.findOne({ student_id: e.estudiante._id, academic_year_id: destinoId }))!;
    expect(m).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO', tipo_ingreso: 'ANTIGUO' });
    expect(String(m.group_id)).toBe(septimoId);
    expect(m.folio_matricula).toBeTruthy();
    expect((await Group.findById(septimoId))!.cupos_ocupados).toBe(1);

    const otra = await ejecutarRollover(filtros(), CLAVE, e.admin);
    expect(otra).toMatchObject({ creadas: 0 });
    expect(otra.plan.ya_tienen_matricula).toBe(1);
    expect(await Enrollment.countDocuments({ student_id: e.estudiante._id, academic_year_id: destinoId })).toBe(1);
  });

  it('sin ningún grupo del grado en el año siguiente no hay dónde ponerlo: sin cupo', async () => {
    await Group.deleteOne({ _id: septimoId });
    expect(await filaDe(e.estudiante)).toMatchObject({ estado: 'SIN_CUPO', grupo_destino: null });
    expect(await ejecutarRollover(filtros(), CLAVE, e.admin)).toMatchObject({ creadas: 0 });
  });

  describe('continuidad: la respuesta filtra el rollover, no reserva matrícula ni cupo', () => {
    const responder = (u: UserDocument, decision: 'CONTINUA' | 'NO_CONTINUA' | null) => registrarContinuidad(destinoId, String(u._id), { decision }, { usuario: e.admin, canal: 'SECRETARIA' });

    it('por defecto incluye solo a quienes confirmaron; permite confirmar o descartar sin crear matrícula', async () => {
      const sinRespuesta = await simularRollover({ origen_id: n.anioId, destino_id: destinoId }, e.admin);
      expect(sinRespuesta.modo_continuidad).toBe('CONFIRMADOS');
      expect(sinRespuesta.filas.find((f) => f.student_id === String(e.estudiante._id))).toMatchObject({ estado: 'SIN_CONFIRMAR' });
      expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);

      await responder(e.estudiante, 'CONTINUA');
      const confirmado = await simularRollover({ origen_id: n.anioId, destino_id: destinoId }, e.admin);
      expect(confirmado.filas.find((f) => f.student_id === String(e.estudiante._id))).toMatchObject({ estado: 'POR_CREAR', grupo_destino: 'Séptimo 701' });
      expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);

      await responder(e.estudiante, 'NO_CONTINUA');
      const noContinua = await simularRollover({ origen_id: n.anioId, destino_id: destinoId }, e.admin);
      expect(noContinua.filas.find((f) => f.student_id === String(e.estudiante._id))).toMatchObject({ estado: 'NO_APLICA', motivo: expect.stringMatching(/no continúa/) });
      expect(await ConfirmacionContinuidad.countDocuments({ student_id: e.estudiante._id, academic_year_id: destinoId })).toBe(1);
      expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);
    });

    it('con «todos» incluye a quien no respondió o indicó que no continúa', async () => {
      await responder(e.estudiante, 'NO_CONTINUA');
      const plan = await simularRollover({ ...filtros(), continuidad: 'TODOS' }, e.admin);
      expect(plan.modo_continuidad).toBe('TODOS');
      expect(plan.filas.find((f) => f.student_id === String(e.estudiante._id))).toMatchObject({ estado: 'POR_CREAR' });
    });

    it('una confirmación no cambia la disponibilidad informativa de cupos', async () => {
      const antes = await obtenerDisponibilidadCupos(destinoId);
      await responder(e.estudiante, 'CONTINUA');
      const despues = await obtenerDisponibilidadCupos(destinoId);
      expect(despues.totales).toEqual(antes.totales);
      expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);
    });

    it('lo que espera recuperaciones no se incluye aunque confirme continuidad', async () => {
      await responder(e.otroEstudiante, 'CONTINUA');
      expect(await filaDe(e.otroEstudiante)).toMatchObject({ destino: 'SIN_DECISION', estado: 'NO_APLICA' });
    });
  });

  describe('capacidad del rollover', () => {
    it('marca SIN_CUPO y no crea una lista de espera cuando los grupos están llenos', async () => {
      await Group.updateOne({ _id: septimoId }, { max_capacity: 1, cupos_ocupados: 1 });
      const plan = await simularRollover(filtros(), e.admin);
      expect(plan.resumen).toMatchObject({ por_crear: 0, sin_cupo: 1 });
      expect(await filaDe(e.estudiante)).toMatchObject({ estado: 'SIN_CUPO', grupo_destino: null });
      expect(await ejecutarRollover(filtros(), CLAVE, e.admin)).toMatchObject({ creadas: 0 });
      expect(await Enrollment.countDocuments({ student_id: e.estudiante._id, academic_year_id: destinoId })).toBe(0);

      await Group.updateOne({ _id: septimoId }, { max_capacity: 2 });
      expect(await ejecutarRollover(filtros(), CLAVE, e.admin)).toMatchObject({ creadas: 1 });
      expect(await Enrollment.findOne({ student_id: e.estudiante._id, academic_year_id: destinoId })).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO' });
    });
  });

  describe('alcance por grupo y secretaría', () => {
    it('se puede procesar un solo grupo de origen; un grupo ajeno al año o a la sede elegida se rechaza', async () => {
      const plan = await simularRollover({ ...filtros(), group_id: n.grupoId }, e.admin);
      expect(plan.resumen.total).toBe(2);
      const otro = await Group.create({ sede_id: (await Group.findById(n.grupoId))!.sede_id, academic_year_id: n.anioId, grade_id: (await Group.findById(n.grupoId))!.grade_id, jornada_id: (await Group.findById(n.grupoId))!.jornada_id, nomenclatura: '602', max_capacity: 30 });
      expect((await simularRollover({ ...filtros(), group_id: String(otro._id) }, e.admin)).resumen.total).toBe(0);
      expect((await simularRollover({ ...filtros(), group_id: septimoId }, e.admin)).resumen.total).toBe(0);
    });

    it('la secretaría procesa solo sus sedes y requiere su contraseña', async () => {
      const sede = (await Group.findById(n.grupoId))!.sede_id;
      await User.updateOne({ _id: e.secretaria._id }, { sedes_ids: [sede] });
      const secretaria = (await User.findById(e.secretaria._id))!;

      expect((await simularRollover(filtros(), secretaria)).resumen.total).toBe(2);
      await expect(simularRollover({ ...filtros(), sede_id: String(new Types.ObjectId()) }, secretaria)).rejects.toMatchObject({ statusCode: 403 });
      await expect(ejecutarRollover(filtros(), 'otra', secretaria)).rejects.toMatchObject({ statusCode: 401 });
      expect(await ejecutarRollover(filtros(), CLAVE, secretaria)).toMatchObject({ creadas: 1 });

      await User.updateOne({ _id: secretaria._id }, { sedes_ids: [] });
      expect((await simularRollover(filtros(), (await User.findById(secretaria._id))!)).resumen.total).toBe(0);
    });
  });

  it('el no promovido repite el grado como REPITENTE; y con todos resueltos el año ya puede cerrarse por promoción', async () => {
    let verificacion = await verificarCierre(n.anioId);
    expect(verificacion.verificaciones.find((v) => v.clave === 'promocion_resuelta')).toMatchObject({ cumple: false });

    await cerrarGrupo(n.anioId, n.grupoId, 'TRAS_RECUPERACION', CLAVE, e.admin);
    verificacion = await verificarCierre(n.anioId);
    expect(verificacion.verificaciones.find((v) => v.clave === 'promocion_resuelta')).toMatchObject({ cumple: true, detalle: null });

    expect(await filaDe(e.otroEstudiante)).toMatchObject({ resultado: 'NO_PROMOVIDO', destino: 'MISMO_GRADO', tipo_ingreso: 'REPITENTE', grupo_destino: 'Sexto 601', estado: 'POR_CREAR' });
    await ejecutarRollover(filtros(), CLAVE, e.admin);
    const repite = (await Enrollment.findOne({ student_id: e.otroEstudiante._id, academic_year_id: destinoId }))!;
    expect(repite).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO', tipo_ingreso: 'REPITENTE' });
  });
});
