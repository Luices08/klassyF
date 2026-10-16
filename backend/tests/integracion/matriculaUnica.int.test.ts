import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Enrollment from '../../src/models/enrollment.model';
import Group, { GroupDocument } from '../../src/models/group.model';
import { UserDocument } from '../../src/models/user.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { cambiarGrupo, createEnrollment, listarSituacionEstudiantes, updateEnrollmentStatus } from '../../src/services/enrollment.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);

// M04: un estudiante tiene una sola matrícula viva por año lectivo; para moverlo de grupo se cambia el de la existente.
describe('M04: una matrícula viva por estudiante y año', () => {
  let e: Escenario;
  let grupoActual: GroupDocument;
  let otroGrupo: GroupDocument;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
    await Enrollment.init();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Enrollment.syncIndexes();
    e = await armarEscenario();
    grupoActual = (await Group.findOne())!;
    otroGrupo = (await Group.create({
      sede_id: grupoActual.sede_id,
      academic_year_id: grupoActual.academic_year_id,
      grade_id: grupoActual.grade_id,
      jornada_id: grupoActual.jornada_id,
      nomenclatura: '602',
      max_capacity: 40,
    })) as GroupDocument;
  });

  const matricularEn = (grupo: GroupDocument) =>
    createEnrollment(
      { student_id: e.estudiante._id, group_id: grupo._id, academic_year_id: grupo.academic_year_id, tipo_ingreso: 'NUEVO', fecha_limite_compromiso: PLAZO },
      como(e.secretaria)
    );

  it('matricular a quien ya está matriculado en el año se rechaza y dice dónde está', async () => {
    await expect(matricularEn(otroGrupo)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/ya está matriculado en .*601/),
    });
    expect(await Enrollment.countDocuments({ student_id: e.estudiante._id })).toBe(1);
  });

  it('el mensaje manda a «Cambiar grupo» y trae la matrícula existente', async () => {
    const existente = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    await expect(matricularEn(otroGrupo)).rejects.toMatchObject({
      message: expect.stringMatching(/Cambiar grupo/),
      details: { enrollment_id: String(existente._id) },
    });
  });

  it('una matrícula retirada o anulada no bloquea una nueva en el mismo año', async () => {
    const existente = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    await updateEnrollmentStatus(existente._id, 'RETIRADO', 'Cambio de colegio', { id: e.secretaria._id });
    const nueva = await matricularEn(otroGrupo);
    expect(nueva.estado).toBe('MATRICULADO_CONDICIONAL');
    expect(await Enrollment.countDocuments({ student_id: e.estudiante._id })).toBe(2);
  });

  it('la base también lo impide: dos matrículas vivas del mismo estudiante y año chocan por índice', async () => {
    await expect(
      Enrollment.create({
        student_id: e.estudiante._id,
        group_id: otroGrupo._id,
        academic_year_id: otroGrupo.academic_year_id,
        tipo_ingreso: 'NUEVO',
        estado: 'PREINSCRITO',
      })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('cambiar de grupo actualiza la matrícula existente: mismo folio, un solo registro y los cupos se mueven', async () => {
    const existente = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    const ocupadosAntes = (await Group.findById(grupoActual._id))!.cupos_ocupados;

    const cambiada = await cambiarGrupo(existente._id, otroGrupo._id, { id: e.secretaria._id });

    expect(String(cambiada._id)).toBe(String(existente._id));
    expect(String(cambiada.group_id)).toBe(String(otroGrupo._id));
    expect(cambiada.folio_matricula).toBe(existente.folio_matricula);
    expect(await Enrollment.countDocuments({ student_id: e.estudiante._id })).toBe(1);
    expect((await Group.findById(otroGrupo._id))!.cupos_ocupados).toBe(1);
    expect((await Group.findById(grupoActual._id))!.cupos_ocupados).toBe(Math.max(ocupadosAntes - 1, 0));
  });
  describe('situación del estudiante y reingreso', () => {
    const anio = () => String(grupoActual.academic_year_id);

    it('lista a cada estudiante con su situación: matriculado con grupo y folio, o disponible', async () => {
      const lista = await listarSituacionEstudiantes(anio());
      const propio = lista.find((x) => x._id === String(e.estudiante._id))!;
      expect(propio.situacion).toBe('MATRICULADO');
      expect(propio.matricula).toMatchObject({ estado: 'MATRICULADO_CONDICIONAL', folio: expect.any(String) });
      expect(lista.find((x) => x._id === String(e.otroEstudiante._id))!.situacion).toBe('DISPONIBLE');
    });

    it('un retirado figura en reingreso y no se matricula sin confirmar la reincorporación', async () => {
      await StudentProfile.updateOne({ user_id: e.otroEstudiante._id }, { estado: 'RETIRADO' }, { upsert: true });
      const lista = await listarSituacionEstudiantes(anio());
      expect(lista.find((x) => x._id === String(e.otroEstudiante._id))!.situacion).toBe('REINGRESO');

      const datos = { student_id: e.otroEstudiante._id, group_id: otroGrupo._id, academic_year_id: otroGrupo.academic_year_id, tipo_ingreso: 'ANTIGUO' as const, fecha_limite_compromiso: PLAZO };
      await expect(createEnrollment(datos, como(e.secretaria))).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Reingreso/) });

      await createEnrollment({ ...datos, reingreso: true }, como(e.secretaria));
      expect((await StudentProfile.findOne({ user_id: e.otroEstudiante._id }))!.estado).toBe('ACTIVO');
    });
  });
});
