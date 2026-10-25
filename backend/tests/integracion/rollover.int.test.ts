import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import ListaEsperaRematricula from '../../src/models/listaEsperaRematricula.model';
import User from '../../src/models/user.model';
import { UserDocument } from '../../src/models/user.model';
import { verificarCierre } from '../../src/services/academicYear.service';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { asignarDesdeEspera, descartarDeEspera, listarEspera } from '../../src/services/listaEsperaRematricula.service';
import { ejecutarRollover, simularRollover } from '../../src/services/rolloverPromocion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M19 fase 7: del cierre del año a las pre-matrículas del siguiente.
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

  const filtros = () => ({ origen_id: n.anioId, destino_id: destinoId });
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
  }, 60_000);

  it('simula sin escribir: el promovido va al grado siguiente; quien espera recuperación y el retirado no se pre-matriculan', async () => {
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

  it('ejecutar reserva cupo con una PRE-matrícula (sin folio), solo el rector con su contraseña, y repetirlo no duplica', async () => {
    await expect(ejecutarRollover(filtros(), CLAVE, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(ejecutarRollover(filtros(), 'otra', e.admin)).rejects.toMatchObject({ statusCode: 401 });

    const r = await ejecutarRollover(filtros(), CLAVE, e.admin);
    expect(r).toMatchObject({ creadas: 1, en_espera: 0 });
    const m = (await Enrollment.findOne({ student_id: e.estudiante._id, academic_year_id: destinoId }))!;
    expect(m).toMatchObject({ estado: 'PREINSCRITO', tipo_ingreso: 'ANTIGUO', folio_matricula: null });
    expect(String(m.group_id)).toBe(septimoId);
    expect(m.fecha_limite_legalizacion).toBeInstanceOf(Date);
    // El paz y salvo del año que termina es el candado de la formalización: queda pendiente en el checklist.
    expect(m.checklist.find((c) => c.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR')).toMatchObject({ estado: 'PENDIENTE' });
    expect((await Group.findById(septimoId))!.cupos_ocupados).toBe(1);

    const otra = await ejecutarRollover(filtros(), CLAVE, e.admin);
    expect(otra).toMatchObject({ creadas: 0 });
    expect(otra.plan.ya_tienen_matricula).toBe(1);
    expect(await Enrollment.countDocuments({ student_id: e.estudiante._id, academic_year_id: destinoId })).toBe(1);
  });

  it('sin ningún grupo del grado en el año siguiente no hay dónde ponerlo: sin cupo', async () => {
    await Group.deleteOne({ _id: septimoId });
    expect(await filaDe(e.estudiante)).toMatchObject({ estado: 'SIN_CUPO', grupo_destino: null });
    expect(await ejecutarRollover(filtros(), CLAVE, e.admin)).toMatchObject({ creadas: 0, en_espera: 0 });
  });

  describe('lista de espera, alcance por grupo y secretaría', () => {
    it('con los grupos llenos el estudiante queda en lista de espera (no se pierde ni bloquea) y repetir no la duplica', async () => {
      await Group.updateOne({ _id: septimoId }, { max_capacity: 1, cupos_ocupados: 1 });
      const plan = await simularRollover(filtros(), e.admin);
      expect(plan.resumen).toMatchObject({ en_espera: 1, por_crear: 0, sin_cupo: 0 });
      expect(plan.alertas.join(' ')).toMatch(/lista de espera/);
      expect(await filaDe(e.estudiante)).toMatchObject({ estado: 'EN_ESPERA', posicion_espera: 1, grupo_destino: null });

      expect(await ejecutarRollover(filtros(), CLAVE, e.admin)).toMatchObject({ creadas: 0, en_espera: 1 });
      await ejecutarRollover(filtros(), CLAVE, e.admin);
      expect(await ListaEsperaRematricula.countDocuments({ student_id: e.estudiante._id, estado: 'EN_ESPERA' })).toBe(1);
      expect(await Enrollment.countDocuments({ academic_year_id: destinoId })).toBe(0);
      expect((await Group.findById(septimoId))!.cupos_ocupados).toBe(1);
    });

    it('la dirección asigna a mano desde la lista de espera cuando hay cupo; descartar exige motivo y secretaría no resuelve', async () => {
      await Group.updateOne({ _id: septimoId }, { max_capacity: 1, cupos_ocupados: 1 });
      await ejecutarRollover(filtros(), CLAVE, e.admin);
      const [espera] = await listarEspera({ destino_id: destinoId }, e.coordAcademico);
      expect(espera).toMatchObject({ posicion: 1, grado_destino: 'Séptimo', grupos_con_cupo: [] });

      await expect(asignarDesdeEspera(espera!._id, septimoId, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya no tiene cupo/) });
      await expect(asignarDesdeEspera(espera!._id, septimoId, e.secretaria)).rejects.toMatchObject({ statusCode: 403 });

      await Group.updateOne({ _id: septimoId }, { max_capacity: 2 });
      expect((await listarEspera({ destino_id: destinoId }, e.admin))[0]!.grupos_con_cupo).toMatchObject([{ id: septimoId, libres: 1 }]);
      await asignarDesdeEspera(espera!._id, septimoId, e.coordAcademico);
      expect(await Enrollment.findOne({ student_id: e.estudiante._id, academic_year_id: destinoId })).toMatchObject({ estado: 'PREINSCRITO', tipo_ingreso: 'ANTIGUO' });
      expect((await Group.findById(septimoId))!.cupos_ocupados).toBe(2);
      expect(await ListaEsperaRematricula.findById(espera!._id)).toMatchObject({ estado: 'ASIGNADA' });
      await expect(asignarDesdeEspera(espera!._id, septimoId, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('descartar de la lista de espera deja el motivo y la saca de la cola', async () => {
      await Group.updateOne({ _id: septimoId }, { max_capacity: 1, cupos_ocupados: 1 });
      await ejecutarRollover(filtros(), CLAVE, e.admin);
      const [espera] = await listarEspera({ destino_id: destinoId }, e.admin);
      await descartarDeEspera(espera!._id, 'La familia desistió del cupo.', e.coordAcademico);
      expect(await listarEspera({ destino_id: destinoId }, e.admin)).toEqual([]);
      expect(await ListaEsperaRematricula.findById(espera!._id)).toMatchObject({ estado: 'DESCARTADA', motivo: 'La familia desistió del cupo.' });
    });

    it('se puede procesar un solo grupo de origen; un grupo ajeno al año o a la sede elegida se rechaza', async () => {
      const plan = await simularRollover({ ...filtros(), group_id: n.grupoId }, e.admin);
      expect(plan.resumen.total).toBe(2);
      const otro = await Group.create({ sede_id: (await Group.findById(n.grupoId))!.sede_id, academic_year_id: n.anioId, grade_id: (await Group.findById(n.grupoId))!.grade_id, nomenclatura: '602', max_capacity: 30 });
      expect((await simularRollover({ ...filtros(), group_id: String(otro._id) }, e.admin)).resumen.total).toBe(0);
      await expect(simularRollover({ ...filtros(), group_id: septimoId }, e.admin)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('la secretaría procesa solo sus sedes y reserva con su contraseña', async () => {
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
    expect(repite).toMatchObject({ estado: 'PREINSCRITO', tipo_ingreso: 'REPITENTE' });
  });
});
