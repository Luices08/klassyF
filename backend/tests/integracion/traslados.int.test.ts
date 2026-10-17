import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Enrollment from '../../src/models/enrollment.model';
import NotaHomologada from '../../src/models/notaHomologada.model';
import TrasladoExtemporaneo from '../../src/models/trasladoExtemporaneo.model';
import { crearEscala } from '../../src/services/escalaExterna.service';
import { cargarContextoPlanilla } from '../../src/services/notas.service';
import { generateReportCard } from '../../src/services/reportCard.service';
import * as traslados from '../../src/services/traslado.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

describe('Traslados extemporáneos y homologación de notas (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let trasladoId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([TrasladoExtemporaneo.syncIndexes(), NotaHomologada.syncIndexes()]);
    e = await armarEscenario();
    n = await prepararNotas(e);
    const escala = await crearEscala(
      { nombre: '1 a 10', tipo: 'NUMERICA', valor_minimo: 1, valor_maximo: 10, valor_aprobatorio: 6, metodo: 'LINEAL' },
      e.admin
    );
    const matricula = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    const traslado = await traslados.crearTraslado(
      {
        enrollment_id: String(matricula._id),
        fecha_ingreso: new Date(),
        periodo_ingreso: 2,
        institucion_procedencia: { nombre: 'Colegio de Origen' },
        periodos_origen: [{ nombre: 'Trimestre 1' }, { nombre: 'Trimestre 2' }, { nombre: 'Trimestre 3' }],
        escala_externa_id: String(escala._id),
      },
      e.secretaria
    );
    trasladoId = String(traslado._id);
  }, 60_000);

  const fila = (valor: string, extra: Partial<traslados.FilaHomologacionInput> = {}): traslados.FilaHomologacionInput => ({
    subject_id: n.materiaId,
    exenta: false,
    valores: [{ indice_origen: 0, valor_original: valor }],
    ...extra,
  });

  it('el docente no califica al estudiante en los periodos anteriores a su ingreso', async () => {
    const p1 = await cargarContextoPlanilla(n.asignacion, 1);
    expect(p1.estudiantes.map((x) => x._id)).not.toContain(String(e.estudiante._id));
    expect(p1.ingresaron_despues.map((x) => x._id)).toContain(String(e.estudiante._id));
    const p2 = await cargarContextoPlanilla(n.asignacion, 2);
    expect(p2.estudiantes.map((x) => x._id)).toContain(String(e.estudiante._id));
  });

  it('la nota homologada entra como definitiva del periodo, con la nota y la escala de origen', async () => {
    const detalle = await traslados.guardarHomologacion(trasladoId, { filas: [fila('8')] }, e.secretaria);
    const resultado = detalle.filas.find((f) => f.subject_id === n.materiaId)?.resultados[0];
    expect(resultado).toMatchObject({ periodo_numero: 1, estado: 'HOMOLOGADA_EXTERNA', nota: 4 });
    expect(resultado?.fuentes[0]).toMatchObject({ valor_original: '8', nota_convertida: 4 });
    expect(resultado?.fuentes[0]?.escala.nombre).toBe('1 a 10');

    const boletin = await generateReportCard({ student_id: String(e.estudiante._id), academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
    const asignatura = boletin.areas[0]?.asignaturas[0];
    expect(asignatura).toMatchObject({ estado: 'HOMOLOGADA_EXTERNA', nota_asignatura: 4 });
    expect(asignatura?.homologacion?.detalle).toMatch(/Trimestre 1: 8/);
    expect(boletin.traslado?.institucion).toBe('Colegio de Origen');
    expect(boletin.pendientes).toEqual([]);
  });

  it('corregir o volver exenta una nota ya registrada exige motivo y deja la anterior en el historial', async () => {
    await traslados.guardarHomologacion(trasladoId, { filas: [fila('8')] }, e.secretaria);
    await expect(traslados.guardarHomologacion(trasladoId, { filas: [fila('', { exenta: true, motivo: 'No se impartía allá' })] }, e.secretaria)).rejects.toMatchObject({
      statusCode: 400,
    });
    await traslados.guardarHomologacion(
      trasladoId,
      { filas: [fila('', { exenta: true, motivo: 'No se impartía allá' })], motivo_cambio: 'Revisado el certificado' },
      e.secretaria
    );
    const nota = (await NotaHomologada.findOne({ subject_id: n.materiaId }))!;
    expect(nota.estado).toBe('EXENTA_POR_TRASLADO');
    expect(nota.historial[0]).toMatchObject({ estado_anterior: 'HOMOLOGADA_EXTERNA', nota_anterior: 4, motivo: 'Revisado el certificado' });

    const boletin = await generateReportCard({ student_id: String(e.estudiante._id), academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
    expect(boletin.areas[0]?.exenta).toBe(true);
    expect(boletin.pendientes).toEqual([]);
  });

  it('un valor que no es de la escala no guarda nada', async () => {
    await expect(traslados.guardarHomologacion(trasladoId, { filas: [fila('11')] }, e.secretaria)).rejects.toMatchObject({ statusCode: 400 });
    expect(await NotaHomologada.countDocuments()).toBe(0);
  });

  it('no se adelanta el ingreso por encima de notas ya homologadas', async () => {
    await traslados.guardarHomologacion(trasladoId, { filas: [fila('8')] }, e.secretaria);
    const traslado = (await TrasladoExtemporaneo.findById(trasladoId))!;
    await expect(
      traslados.actualizarTraslado(
        trasladoId,
        {
          fecha_ingreso: traslado.fecha_ingreso,
          periodo_ingreso: 1,
          institucion_procedencia: traslado.institucion_procedencia,
          periodos_origen: traslado.periodos_origen,
          escala_externa_id: String(traslado.escala_externa_id),
        },
        e.secretaria
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
