import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import LibroCalificaciones from '../../src/models/libroCalificaciones.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { anularLibro, emitirLibro, listarLibros, pdfDeLibro, verificarIntegridadLibro } from '../../src/services/libroCalificaciones.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// El libro de calificaciones: emitido una vez con el cierre hecho, foliado, con huella y sin editarse.
describe('Libro de calificaciones', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let entrada: { academic_year_id: string; sede_id: string; grade_id: string };

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
  /** Todos con un resultado final: quien no tiene notas se retira y quien perdió pasa por el cierre posterior a la recuperación. */
  async function cerrarElAnio() {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    await cerrarGrupo(n.anioId, n.grupoId, 'TRAS_RECUPERACION', CLAVE, e.admin);
  }

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await LibroCalificaciones.syncIndexes();
    e = await armarEscenario();
    n = await prepararNotas(e);
    await cerrarNotas(e.estudiante._id, 4);
    await cerrarNotas(e.otroEstudiante._id, 2);
    const grupo = (await Group.findById(n.grupoId))!;
    entrada = { academic_year_id: n.anioId, sede_id: String(grupo.sede_id), grade_id: String(grupo.grade_id) };
  }, 120_000);

  it('no se emite mientras falte el cierre de promoción oficial, y dice quiénes faltan', async () => {
    const r = await emitirLibro(entrada, e.admin).catch((err) => err);
    expect(r).toMatchObject({ statusCode: 409 });
    expect(r.details.total).toBeGreaterThan(0);
    expect(await LibroCalificaciones.countDocuments()).toBe(0);
  });

  it('quien perdió y espera la recuperación también bloquea: solo vale un resultado final', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    await expect(emitirLibro(entrada, e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('emite con consecutivo, folios y huella; se reimprime idéntico y la huella lo respalda', async () => {
    await cerrarElAnio();
    const libro = await emitirLibro(entrada, e.admin);
    expect(libro.codigo).toMatch(/^LC-\d{4}-001$/);
    expect(libro.folio_inicial).toBe(1);
    expect(libro.folio_final).toBeGreaterThanOrEqual(3);
    expect(libro.estado).toBe('VIGENTE');
    expect(libro.huella).toHaveLength(64);

    const { buffer, nombreArchivo } = await pdfDeLibro(String(libro._id), e.admin);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(nombreArchivo).toBe(`libro-calificaciones-${libro.codigo}.pdf`);
    expect((await verificarIntegridadLibro(String(libro._id), e.admin)).integro).toBe(true);
  });

  it('un solo libro vigente por año, sede y grado; anulado, el siguiente sigue los folios sin repetirlos', async () => {
    await cerrarElAnio();
    const primero = await emitirLibro(entrada, e.admin);
    await expect(emitirLibro(entrada, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Ya hay un libro vigente/) });
    await anularLibro(String(primero._id), 'Se emitió con una firma equivocada.', e.admin);
    const segundo = await emitirLibro(entrada, e.admin);
    expect(segundo.codigo).toMatch(/-002$/);
    expect(segundo.folio_inicial).toBe(primero.folio_final + 1);
    // El anulado sigue verificándose e imprimiéndose, marcado.
    expect((await verificarIntegridadLibro(String(primero._id), e.admin)).integro).toBe(true);
    await expect(pdfDeLibro(String(primero._id), e.admin)).resolves.toBeTruthy();
    const lista = await listarLibros({ academic_year_id: n.anioId }, e.admin);
    expect(lista.map((l) => l.estado)).toEqual(['ANULADO', 'VIGENTE']);
    expect(lista[0]!.anulacion?.motivo).toMatch(/firma equivocada/);
  });

  it('lo emitido no se edita; alterarlo directo en la base se detecta y bloquea la impresión', async () => {
    await cerrarElAnio();
    const libro = await emitirLibro(entrada, e.admin);
    const guardado = (await LibroCalificaciones.findById(libro._id))!;
    (guardado.snapshot as { institucion: string }).institucion = 'Otra institución';
    guardado.markModified('snapshot');
    await expect(guardado.save()).rejects.toThrow(/no se edita/);

    await LibroCalificaciones.collection.updateOne({ _id: libro._id }, { $set: { 'snapshot.institucion': 'Alterada' } });
    expect((await verificarIntegridadLibro(String(libro._id), e.admin)).integro).toBe(false);
    await expect(pdfDeLibro(String(libro._id), e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('administración y secretaría emiten; coordinación consulta; un docente no entra; secretaría solo de sus sedes', async () => {
    await cerrarElAnio();
    await expect(emitirLibro(entrada, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(emitirLibro(entrada, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(emitirLibro(entrada, e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    const libro = await emitirLibro(entrada, e.secretaria);
    await expect(pdfDeLibro(String(libro._id), e.coordAcademico)).resolves.toBeTruthy();
    await expect(anularLibro(String(libro._id), 'Motivo de prueba largo.', e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(listarLibros({ academic_year_id: n.anioId }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });
});
