import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Observacion from '../../src/models/observacion.model';
import * as casos from '../../src/services/caso.service';
import { contarPorEstudiante, faltasContadas } from '../../src/services/faltasConvivencia.service';
import * as observaciones from '../../src/services/observacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario, hoy } from './escenario';

describe('Faltas de convivencia que cuentan en otros módulos (con base de datos)', () => {
  let e: Escenario;
  let anioId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    e = await armarEscenario();
    anioId = String((await AcademicYear.findOne())!._id);
  }, 60_000);

  const abrirGrave = async (tipo: 'II' | 'III' = 'II') =>
    (await casos.abrirCaso(
      {
        tipo_situacion: tipo,
        fecha_hecho: hoy(),
        hechos: 'Agresión física durante el descanso.',
        involucrados: [
          { student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' },
          { student_id: String(e.otroEstudiante._id), rol: 'AFECTADO' },
          { student_id: String(e.tercerEstudiante._id), rol: 'TESTIGO' },
        ],
      },
      e.coordConvivencia
    )) as unknown as { _id: string };

  const conDecision = async (casoId: string, faltaId: string) => {
    await casos.agregarRegistroCaso(casoId, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.estudiante._id), fecha: hoy(), texto: 'Da su versión de los hechos.' }, e.coordConvivencia);
    await casos.registrarDecision(casoId, { motivacion: 'Con fundamento en el manual y lo narrado por las partes.', faltas_ids: [faltaId] }, e.coordConvivencia);
  };

  it('una falta tipo I del Observador cuenta; una situación grave sin decisión no', async () => {
    await observaciones.registrarFalta({ falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Llegó tarde varias veces.', estudiantes_ids: [String(e.estudiante._id)] }, e.docenteDeClase);
    await abrirGrave('II');

    const faltas = await faltasContadas({ academic_year_id: anioId });
    expect(faltas).toEqual([expect.objectContaining({ student_id: String(e.estudiante._id), gravedad: 'I' })]);
  });

  it('un caso II o III cuenta solo con decisión en firme, una vez por presunto responsable y no por afectados ni testigos', async () => {
    const caso = await abrirGrave('III');
    await conDecision(caso._id, e.faltaIII);

    const faltas = await faltasContadas({ academic_year_id: anioId });
    expect(faltas).toEqual([expect.objectContaining({ student_id: String(e.estudiante._id), gravedad: 'III', periodo_numero: null })]);
    expect(contarPorEstudiante(faltas).get(String(e.estudiante._id))).toEqual({ III: 1 });
  });

  it('un caso anulado deja de contar', async () => {
    const caso = await abrirGrave('II');
    await conDecision(caso._id, e.faltaII);
    expect(await faltasContadas({ academic_year_id: anioId })).toHaveLength(1);

    await CasoConvivencia.updateOne({ _id: caso._id }, { $set: { estado: 'ANULADO' } });
    expect(await faltasContadas({ academic_year_id: anioId })).toEqual([]);
  });

  it('una falta grave guardada como observación antes del reporte urgente cuenta, pero no si ya tiene caso (sin contarla dos veces)', async () => {
    const { registros } = await observaciones.registrarFalta({ falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Registro anterior.', estudiantes_ids: [String(e.estudiante._id)] }, e.docenteDeClase);
    await Observacion.updateOne({ _id: registros[0]!._id }, { $set: { 'falta.gravedad': 'II' } });
    expect((await faltasContadas({ academic_year_id: anioId })).map((f) => f.gravedad)).toEqual(['II']);

    // Ya se abrió un caso con ese registro: cuenta el caso, y solo con decisión.
    const caso = await abrirGrave('II');
    await CasoConvivencia.updateOne({ _id: caso._id }, { $set: { observacion_ids: [registros[0]!._id] } });
    expect(await faltasContadas({ academic_year_id: anioId })).toEqual([]);

    await conDecision(caso._id, e.faltaII);
    expect((await faltasContadas({ academic_year_id: anioId })).map((f) => f.gravedad)).toEqual(['II']);
  });

  it('una falta Tipo II que el docente resolvió él mismo cuenta como II; una Tipo I escalada que se vuelve caso con decisión cuenta como el caso, no dos veces', async () => {
    await observaciones.registrarFalta({ falta_id: e.faltaII, fecha_hecho: hoy(), hechos: 'Empujó a un compañero; ya lo hablé con ambos.', estudiantes_ids: [String(e.otroEstudiante._id)] }, e.docenteDeClase);
    expect((await faltasContadas({ academic_year_id: anioId })).map((f) => f.gravedad)).toEqual(['II']);

    const { registros } = await observaciones.registrarFalta({ falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Reincidente.', estudiantes_ids: [String(e.estudiante._id)], escalar_a_coordinacion: true }, e.docenteDeClase);
    const caso = await abrirGrave('II');
    await CasoConvivencia.updateOne({ _id: caso._id }, { $set: { observacion_ids: [registros[0]!._id] } });
    // Sin decisión, la I sigue contando.
    expect(contarPorEstudiante(await faltasContadas({ academic_year_id: anioId })).get(String(e.estudiante._id))).toEqual({ I: 1 });

    await conDecision(caso._id, e.faltaII);
    expect(contarPorEstudiante(await faltasContadas({ academic_year_id: anioId })).get(String(e.estudiante._id))).toEqual({ II: 1 });
    // Pedir solo a ese estudiante da lo mismo (el filtro no cambia la cuenta).
    expect(contarPorEstudiante(await faltasContadas({ academic_year_id: anioId, estudiantes_ids: [e.estudiante._id] })).get(String(e.estudiante._id))).toEqual({ II: 1 });
  });

  it('el filtro por fecha, por estudiante y por declararse impedido acota lo que se cuenta', async () => {
    const caso = await abrirGrave('II');
    await conDecision(caso._id, e.faltaII);

    const manana = new Date(Date.now() + 86_400_000);
    expect(await faltasContadas({ academic_year_id: anioId, desde: manana })).toEqual([]);
    expect(await faltasContadas({ academic_year_id: anioId, estudiantes_ids: [e.otroEstudiante._id] })).toEqual([]);
    expect(await faltasContadas({ academic_year_id: anioId, estudiantes_ids: [e.estudiante._id] })).toHaveLength(1);

    await casos.declararImpedimento(caso._id, { motivo: 'Es familiar de un involucrado.' }, e.coordConvivencia);
    expect(await faltasContadas({ academic_year_id: anioId, excluirImpedido: e.coordConvivencia._id })).toEqual([]);
    expect(await faltasContadas({ academic_year_id: anioId })).toHaveLength(1);
  });
});
