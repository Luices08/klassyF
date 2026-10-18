import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Grade from '../../src/models/grade.model';
import { obtenerPromocion } from '../../src/services/certificadoEstudios.service';
import Enrollment from '../../src/models/enrollment.model';
import EvaluacionPromocion from '../../src/models/evaluacionPromocionEstudiante.model';
import Recuperacion from '../../src/models/recuperacion.model';
import { cerrarGrupo, listarEvaluaciones, reevaluarEstudiante, simularGrupo, verificarIntegridad } from '../../src/services/evaluacionPromocion.service';
import { actualizarPolitica, obtenerPolitica } from '../../src/services/politicaPromocion.service';
import { politicaInicial } from '../../src/utils/promocion';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario } from './escenario';
import { armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M19: cierre de promoción de un grupo con notas cerradas reales (M12), recuperación final (M18) y versiones.
describe('M19: cierre de promoción', () => {
  let e: Escenario;
  let n: EscenarioNotas;

  async function cerrarNotas(estudianteId: unknown, nota: number) {
    for (const periodo of [1, 2, 3, 4]) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: estudianteId,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      });
    }
  }

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    await cerrarNotas(e.estudiante._id, 4);
    await cerrarNotas(e.otroEstudiante._id, 2);
  });

  const simular = (momento: 'CIERRE' | 'TRAS_RECUPERACION' = 'CIERRE') => simularGrupo(n.anioId, n.grupoId, momento, e.admin);

  it('la política nace con el valor de partida y solo el contenido válido se guarda', async () => {
    const politica = await obtenerPolitica(n.anioId);
    expect(politica.reglas).toHaveLength(0);
    expect(politica.sin_regla.cierre).toBe('PENDIENTE_RECUPERACION');

    const mala = { ...politicaInicial(), arrastre: { ...politicaInicial().arrastre, admite: true } };
    await expect(actualizarPolitica(n.anioId, mala, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('simula sin guardar: promovido, pendiente de recuperación e incompleto', async () => {
    const filas = await simular();
    const porId = new Map(filas.map((f) => [f.student_id, f.motor?.resultado]));
    expect(porId.get(String(e.estudiante._id))).toBe('PROMOVIDO');
    expect(porId.get(String(e.otroEstudiante._id))).toBe('PENDIENTE_RECUPERACION');
    expect(porId.get(String(e.tercerEstudiante._id))).toBe('INCOMPLETO');
    expect(await EvaluacionPromocion.countDocuments()).toBe(0);
  });

  it('solo el ADMIN cierra, con su contraseña, y no si falta alguna nota', async () => {
    await expect(cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', 'otra-clave', e.admin)).rejects.toMatchObject({ statusCode: 401 });
    await expect(cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/notas anuales/) });
    expect(await EvaluacionPromocion.countDocuments()).toBe(0);
  });

  it('cierra el grupo, es idempotente y deja la huella verificable', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    const resumen = await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    expect(resumen).toMatchObject({ cerrados: 2, omitidos: 0, por_resultado: { PROMOVIDO: 1, PENDIENTE_RECUPERACION: 1 } });
    expect(await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin)).toMatchObject({ cerrados: 0, omitidos: 2 });

    const [cierre] = await EvaluacionPromocion.find({ student_id: e.estudiante._id });
    expect((await verificarIntegridad(String(cierre._id), e.admin)).integra).toBe(true);
    await EvaluacionPromocion.updateOne({ _id: cierre._id }, { $set: { resultado: 'NO_PROMOVIDO' } });
    expect((await verificarIntegridad(String(cierre._id), e.admin)).integra).toBe(false);
  });

  it('tras la recuperación final solo se vuelve a evaluar a quien quedó pendiente, con una versión nueva', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    await Recuperacion.create({
      academic_year_id: n.anioId,
      teacher_assignment_id: n.asignacion._id,
      group_id: n.grupoId,
      subject_id: n.materiaId,
      student_id: e.otroEstudiante._id,
      tipo: 'ANUAL',
      periodo_numero: 0,
      nota_original: 2,
      efecto_aplicado: 'REEMPLAZA',
      intentos: [{ nota: 3.5, fecha: new Date(), registrado_por: e.docenteDeClase._id, observacion: '' }],
      nota_resultante: 3.5,
      estado: 'SUPERADA',
    });

    const resumen = await cerrarGrupo(n.anioId, n.grupoId, 'TRAS_RECUPERACION', CLAVE, e.admin);
    expect(resumen).toMatchObject({ cerrados: 1, omitidos: 1, por_resultado: { PROMOVIDO_POR_RECUPERACION: 1 } });

    const vigentes = await listarEvaluaciones({ academic_year_id: n.anioId }, e.admin);
    expect(vigentes).toHaveLength(2);
    const historial = await listarEvaluaciones({ academic_year_id: n.anioId, student_id: String(e.otroEstudiante._id), historial: true }, e.admin);
    expect(historial.map((x) => [x.version, x.vigente])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it('corregir a un estudiante crea una versión con motivo sin tocar a los demás', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    const nueva = await reevaluarEstudiante(n.anioId, String(e.estudiante._id), 'Reclamación aprobada por el Consejo Académico', CLAVE, e.admin);
    expect(nueva.version).toBe(2);
    expect(await EvaluacionPromocion.countDocuments({ student_id: e.otroEstudiante._id })).toBe(1);
  });

  it('M26 lee el concepto del cierre: sin cierre o pendiente no hay concepto oficial; con cierre sí, hacia el grado siguiente', async () => {
    await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    const matricula = async (estudiante: { _id: unknown }) => String((await Enrollment.findOne({ student_id: estudiante._id }))!._id);

    expect(await obtenerPromocion(await matricula(e.estudiante))).toBeNull();
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    expect(await obtenerPromocion(await matricula(e.estudiante))).toEqual({ concepto: 'APROBO', texto: 'APROBÓ el grado Sexto y es PROMOVIDO al grado Séptimo' });
    // Pendiente de recuperación todavía puede cambiar: no se certifica como oficial.
    expect(await obtenerPromocion(await matricula(e.otroEstudiante))).toBeNull();
  });
});
