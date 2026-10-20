import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERIODO_INFORME_FINAL } from '../../src/constants/boletin';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import { informeFinalParaFamilia, informeFinalParaPersonal } from '../../src/services/informeFinal.service';
import { generarPdfInformeFinal } from '../../src/services/informeFinalPdf.service';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { establecerAccesoEstudiante, establecerPublicacionGrupo } from '../../src/services/publicacionBoletin.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// El informe final del año se calcula al pedirlo; la familia solo lo ve cuando el administrador lo publica.
describe('Informe final del año', () => {
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
  const filtros = (extra: { student_id?: string } = {}) => ({ academic_year_id: n.anioId, group_id: n.grupoId, ...extra });
  const referencia = () => ({ group_id: n.grupoId, academic_year_id: n.anioId, periodo_numero: PERIODO_INFORME_FINAL });

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

  it('trae la nota de cada periodo, la del año y la decisión proyectada mientras no haya cierre', async () => {
    const r = await informeFinalParaPersonal(filtros(), e.admin);
    expect(r.estado_datos).toBe('PRELIMINAR');
    expect(r.periodos).toHaveLength(4);
    const bien = r.estudiantes.find((s) => s.student_id === String(e.estudiante._id))!;
    const asignatura = bien.areas.flatMap((a) => a.asignaturas)[0]!;
    expect(asignatura.periodos.map((p) => p.nota)).toEqual([4, 4, 4, 4]);
    expect(asignatura.nota_anual).toBe(4);
    expect(asignatura.nota_recuperacion).toBeNull();
    expect(bien.promocion.oficial).toBe(false);
    expect(bien.puesto).toBe(1);
    // Quien no tiene notas: huecos, nunca ceros, y sin promedio ni puesto.
    const sinNotas = r.estudiantes.find((s) => s.student_id === String(e.tercerEstudiante._id))!;
    expect(sinNotas.areas.flatMap((a) => a.asignaturas)[0]!.periodos.every((p) => p.nota === null)).toBe(true);
    expect(sinNotas.promedio_general).toBeNull();
    expect(sinNotas.puesto).toBeNull();
    expect(sinNotas.completo).toBe(false);
  });

  it('con el cierre de promoción de todos es definitivo y la decisión es la oficial', async () => {
    // Quien no tiene notas no se puede cerrar: se retira para que el grupo cierre completo.
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    const r = await informeFinalParaPersonal(filtros(), e.admin);
    expect(r.estudiantes).toHaveLength(2);
    expect(r.estudiantes.every((s) => s.promocion.oficial)).toBe(true);
    expect(r.estado_datos).toBe('DEFINITIVO');
  });

  it('un estudiante o todo el grupo; el PDF es un PDF', async () => {
    const uno = await informeFinalParaPersonal(filtros({ student_id: String(e.estudiante._id) }), e.coordAcademico);
    expect(uno.estudiantes).toHaveLength(1);
    await expect(informeFinalParaPersonal(filtros({ student_id: String(e.docenteDeClase._id) }), e.admin)).rejects.toMatchObject({ statusCode: 404 });
    const { buffer, nombreArchivo } = await generarPdfInformeFinal(filtros(), e.admin);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(nombreArchivo).toMatch(/^informe_final_.*\.pdf$/);
  });

  it('un docente no lo descarga; secretaría solo de sus sedes', async () => {
    await expect(informeFinalParaPersonal(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(informeFinalParaPersonal(filtros(), e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    await expect(informeFinalParaPersonal(filtros(), e.secretaria)).resolves.toBeTruthy();
  });

  it('la familia no lo ve hasta que el administrador lo publica, y una excepción manda sobre el grupo', async () => {
    const familia = { academic_year_id: n.anioId, student_id: String(e.estudiante._id) };
    await expect(informeFinalParaFamilia(familia, e.estudiante)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/informe final/) });
    await establecerPublicacionGrupo(referencia(), true, e.admin);
    const visto = await informeFinalParaFamilia(familia, e.estudiante);
    expect(visto.estudiantes).toHaveLength(1);
    expect(visto.estudiantes[0]!.student_id).toBe(String(e.estudiante._id));
    // Otro estudiante no puede pedir el de su compañero.
    await expect(informeFinalParaFamilia(familia, e.otroEstudiante)).rejects.toMatchObject({ statusCode: 404 });
    // Bloquear a uno aunque el grupo esté publicado.
    await establecerAccesoEstudiante(referencia(), String(e.estudiante._id), false, e.admin);
    await expect(informeFinalParaFamilia(familia, e.estudiante)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('publicar el informe final no publica el boletín de ningún periodo', async () => {
    await establecerPublicacionGrupo(referencia(), true, e.admin);
    const { default: PublicacionBoletin } = await import('../../src/models/publicacionBoletin.model');
    expect(await PublicacionBoletin.countDocuments({ group_id: n.grupoId, periodo_numero: { $gte: 1 }, publicado: true })).toBe(0);
  });
});
