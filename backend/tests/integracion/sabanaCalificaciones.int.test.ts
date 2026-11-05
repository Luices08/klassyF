import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Campus from '../../src/models/campus.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import ValoracionDescriptiva from '../../src/models/valoracionDescriptiva.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { generarSabana } from '../../src/services/sabanaCalificaciones.service';
import { generarExcelSabana } from '../../src/services/sabanaExcel.service';
import { generarPdfSabana } from '../../src/services/sabanaPdf.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// Reporte de cierre anual: la sábana se calcula al descargar, con lo que haya en ese momento.
describe('Sábana de calificaciones', () => {
  let e: Escenario;
  let n: EscenarioNotas;

  async function cerrarNotas(estudianteId: unknown, nota: number, periodos = [1, 2, 3, 4]) {
    for (const periodo of periodos) {
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
  }, 120_000);

  it('antes del cierre sale preliminar, con la decisión proyectada y las notas del año', async () => {
    const r = await generarSabana({ academic_year_id: n.anioId }, e.admin);
    expect(r.estado_datos).toBe('PRELIMINAR');
    expect(r.incluye_promocion).toBe(true);
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0]!;
    expect(g.filas).toHaveLength(3);
    const bien = g.filas.find((f) => f.student_id === String(e.estudiante._id))!;
    const mal = g.filas.find((f) => f.student_id === String(e.otroEstudiante._id))!;
    expect(bien.notas[n.materiaId]?.nota).toBe(4);
    expect(bien.reprobadas).toBe(0);
    expect(mal.reprobadas).toBe(1);
    expect(bien.promocion?.oficial).toBe(false);
    expect(mal.promocion?.oficial).toBe(false);
    // Quien aún no tiene notas queda con la celda vacía (nunca cero), sin promedio ni puesto, y la decisión dice que faltan notas.
    const sinNotas = g.filas.find((f) => f.student_id === String(e.tercerEstudiante._id))!;
    expect(sinNotas.notas[n.materiaId]?.nota).toBeNull();
    expect(sinNotas.promedio).toBeNull();
    expect(sinNotas.puesto).toBeNull();
    expect(sinNotas.promocion?.codigo).toBe('INCOMPLETO');
    expect(bien.puesto).toBe(1);
  });

  it('con el cierre de promoción de todos pasa a definitiva y la decisión es la oficial', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    const r = await generarSabana({ academic_year_id: n.anioId }, e.admin);
    expect(r.grupos[0]!.filas).toHaveLength(2);
    expect(r.grupos[0]!.filas.every((f) => f.promocion?.oficial)).toBe(true);
    expect(r.estado_datos).toBe('DEFINITIVO');
  });

  it('por periodo trae las notas cerradas de ese periodo y no incluye promoción', async () => {
    const r = await generarSabana({ academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
    expect(r.estado_datos).toBe('PERIODO');
    expect(r.incluye_promocion).toBe(false);
    const mal = r.grupos[0]!.filas.find((f) => f.student_id === String(e.otroEstudiante._id))!;
    expect(mal.notas[n.materiaId]?.nota).toBe(2);
    expect(mal.promocion).toBeNull();
  });

  it('Preescolar no tiene notas: muestra la valoración descriptiva (la del último periodo valorado), sin promedio, puesto ni asignaturas perdidas', async () => {
    const grupo = (await Group.findById(n.grupoId))!;
    await Grade.updateOne({ _id: grupo.grade_id }, { nivel: 'PREESCOLAR' });
    await CalificacionAsignatura.deleteMany({});
    const valorar = (estudiante: unknown, periodo: number, nivel: 'INICIADO' | 'EN_PROCESO' | 'ALCANZADO') =>
      ValoracionDescriptiva.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        student_id: estudiante,
        periodo_numero: periodo,
        nivel,
        fortalezas: 'Participa con entusiasmo en clase',
        recomendaciones: 'Practicar el conteo en casa',
        registrado_por: e.docenteDeClase._id,
      });
    await valorar(e.estudiante._id, 1, 'INICIADO');
    await valorar(e.estudiante._id, 2, 'EN_PROCESO');
    await valorar(e.otroEstudiante._id, 1, 'ALCANZADO');

    const r = await generarSabana({ academic_year_id: n.anioId }, e.admin);
    const g = r.grupos[0]!;
    const fila = (id: unknown) => g.filas.find((f) => f.student_id === String(id))!;
    expect(g.descriptiva).toBe(true);
    expect(r.leyenda).toMatch(/Preescolar no lleva notas/);
    expect(fila(e.estudiante._id).notas[n.materiaId]).toMatchObject({ nota: null, valoracion: 'EN_PROCESO' });
    expect(fila(e.otroEstudiante._id).notas[n.materiaId]?.valoracion).toBe('ALCANZADO');
    expect(fila(e.tercerEstudiante._id).notas[n.materiaId]?.valoracion).toBeNull();
    for (const f of g.filas) {
      expect(f.promedio).toBeNull();
      expect(f.puesto).toBeNull();
      expect(f.reprobadas).toBe(0);
    }
    expect(fila(e.tercerEstudiante._id).sin_nota).toBe(1);
    // Preescolar no reprueba: aunque no haya una sola nota, la decisión (proyectada) es promovido.
    expect(fila(e.estudiante._id).promocion?.codigo).toBe('PROMOVIDO');
    expect(g.resumen[0]?.niveles).toEqual({ INICIADO: 0, EN_PROCESO: 1, ALCANZADO: 1 });

    // Por periodo se ve el nivel de ese periodo, no el último.
    const p1 = await generarSabana({ academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
    expect(p1.grupos[0]!.filas.find((f) => f.student_id === String(e.estudiante._id))!.notas[n.materiaId]?.valoracion).toBe('INICIADO');

    // El Excel no trae la columna de promedio y escribe el nombre del nivel; el PDF es un PDF.
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await generarExcelSabana(r)).buffer as unknown as ArrayBuffer);
    const hoja = libro.worksheets[0]!;
    const encabezados = (hoja.getRow(5).values as unknown[]).map(String);
    expect(encabezados).not.toContain('Promedio');
    expect(encabezados).toContain('Fallas');
    const celdas: unknown[] = [];
    hoja.eachRow((f) => f.eachCell((c) => celdas.push(c.value)));
    expect(celdas).toContain('En proceso');
    expect(celdas).toContain('Alcanzado');
    expect((await generarPdfSabana(r)).buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('un periodo que el año no tiene se rechaza con 400', async () => {
    const r = await generarSabana({ academic_year_id: n.anioId, periodo_numero: 5 }, e.admin).catch((err) => err);
    expect(r).toMatchObject({ statusCode: 400 });
  });

  it('filtra por sede, jornada, grado y grupo; sin coincidencias responde 404', async () => {
    const grupo = (await Group.findById(n.grupoId))!;
    const ok = await generarSabana(
      { academic_year_id: n.anioId, sede_id: String(grupo.sede_id), jornada_id: String(grupo.jornada_id), grade_id: String(grupo.grade_id), group_id: n.grupoId },
      e.admin
    );
    expect(ok.grupos).toHaveLength(1);
    await expect(generarSabana({ academic_year_id: n.anioId, sede_id: String(grupo.jornada_id) }, e.admin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('la descargan administración, coordinación y secretaría (esta solo de sus sedes); un docente no', async () => {
    await expect(generarSabana({ academic_year_id: n.anioId }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    // Sin sedes asignadas, secretaría no ve ningún grupo; con la sede del grupo, sí.
    await expect(generarSabana({ academic_year_id: n.anioId }, e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    await expect(generarSabana({ academic_year_id: n.anioId }, e.secretaria)).resolves.toBeTruthy();
    await expect(generarSabana({ academic_year_id: n.anioId }, e.coordAcademico)).resolves.toBeTruthy();
  });

  it('el Excel trae una pestaña por grupo y el PDF es un PDF', async () => {
    const reporte = await generarSabana({ academic_year_id: n.anioId }, e.admin);
    const xlsx = await generarExcelSabana(reporte);
    expect(xlsx.nombreArchivo).toMatch(/\.xlsx$/);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.buffer as unknown as ArrayBuffer);
    expect(libro.worksheets).toHaveLength(reporte.grupos.length);
    const hoja = libro.worksheets[0]!;
    expect(String(hoja.getCell(5, 3).value)).toBe('Apellidos');

    const pdf = await generarPdfSabana(reporte);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
