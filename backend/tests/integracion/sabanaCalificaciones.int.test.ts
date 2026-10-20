import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Campus from '../../src/models/campus.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
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
