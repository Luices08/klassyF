import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Area from '../../src/models/area.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../../src/models/teacherAssignment.model';
import { crearEvento } from '../../src/services/academicYear.service';
import { hoyColombia } from '../../src/services/attendance.service';
import { aplicarDecisionDeInstancia, cerrarGrupo, simularGrupo } from '../../src/services/evaluacionPromocion.service';
import { actualizarPolitica } from '../../src/services/politicaPromocion.service';
import { listarCandidatos, registrarIntento } from '../../src/services/recuperacion.service';
import { politicaInicial } from '../../src/utils/promocion';
import runTransaction from '../../src/utils/runTransaction';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { DIA_MS, EscenarioNotas, prepararNotas } from './escenarioNotas';

// Con la política de promoción por ÁREAS (M19), la recuperación final de M18 mide el tope en áreas y solo recupera lo de un área perdida.
describe('M18 ↔ M19: recuperación final cuando la promoción evalúa por áreas', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let geometria: TeacherAssignmentDocument;
  let biologia: TeacherAssignmentDocument;
  let quimica: TeacherAssignmentDocument;

  const enDias = (dias: number): Date => new Date(hoyColombia().getTime() + dias * DIA_MS);

  async function agregarClase(areaId: unknown, nombre: string, abreviatura: string) {
    const materia = await Subject.create({ area_id: areaId, nombre, abreviatura, descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
    return TeacherAssignment.create({ docente_id: e.docenteDeClase._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: n.grupoId, subject_id: materia._id, horas_semanales: 2 });
  }

  /** Una nota anual de `nota` en los cuatro periodos. */
  async function cerrar(estudiante: { _id: unknown }, clase: TeacherAssignmentDocument, nota: number) {
    await CalificacionAsignatura.insertMany(
      [1, 2, 3, 4].map((periodo) => ({
        academic_year_id: n.anioId,
        teacher_assignment_id: clase._id,
        group_id: n.grupoId,
        subject_id: clase.subject_id,
        periodo_numero: periodo,
        student_id: estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      }))
    );
  }

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    // Matemáticas (la clase del escenario) + Geometría forman el área MAT; Biología y Química, el área CIE.
    const ciencias = await Area.create({ institucion_id: (await Area.findById(n.areaId))!.institucion_id, nombre: 'Ciencias', descripcion: 'Área', codigo: 'CIE' });
    geometria = await agregarClase(n.areaId, 'Geometría', 'GEO');
    biologia = await agregarClase(ciencias._id, 'Biología', 'BIO');
    quimica = await agregarClase(ciencias._id, 'Química', 'QUI');

    // Estudiante: pierde Matemáticas y Geometría (un área). Otro: pierde solo Matemáticas, el área sigue en 3.25. Tercero: pierde las dos áreas.
    for (const [est, notas] of [
      [e.estudiante, [2, 2, 4, 4]],
      [e.otroEstudiante, [2, 4.5, 4, 4]],
      [e.tercerEstudiante, [2, 2, 2, 2]],
    ] as const) {
      for (const [clase, nota] of [n.asignacion, geometria, biologia, quimica].map((c, i) => [c, notas[i]!] as const)) await cerrar(est, clase, nota);
    }
    const base = politicaInicial();
    await actualizarPolitica(n.anioId, { ...base, unidad: 'AREA', umbrales: { ...base.umbrales, recuperacion_hasta: 1 } }, e.admin);
    await crearEvento(n.anioId, { tipo: 'RECUPERACION_FINAL', nombre: 'Recuperación de fin de año', fecha_inicio: enDias(0), fecha_fin: enDias(10) }, { usuarioId: e.admin._id });
  }, 120_000);

  const candidatos = async () => (await listarCandidatos({ academic_year_id: n.anioId, tipo: 'ANUAL', group_id: n.grupoId }, e.admin)).filas;
  const delEstudiante = (filas: Awaited<ReturnType<typeof candidatos>>, u: { _id: unknown }) => filas.filter((f) => f.estudiante._id === String(u._id));
  const intento = (clase: TeacherAssignmentDocument, u: { _id: unknown }) =>
    registrarIntento({ teacher_assignment_id: String(clase._id), student_id: String(u._id), tipo: 'ANUAL', nota: 4 }, e.docenteDeClase);

  it('el motor y la política dicen lo mismo: un área perdida recupera, dos reprueban, y un área aprobada no pierde nada', async () => {
    const filas = await simularGrupo(n.anioId, n.grupoId, 'CIERRE', e.admin);
    const resultado = (u: { _id: unknown }) => filas.find((f) => f.student_id === String(u._id))?.motor?.resultado;
    expect(resultado(e.estudiante)).toBe('PENDIENTE_RECUPERACION');
    expect(resultado(e.otroEstudiante)).toBe('PROMOVIDO');
    expect(resultado(e.tercerEstudiante)).toBe('NO_PROMOVIDO');
  });

  it('quien perdió un área con dos asignaturas puede recuperar ambas, aunque el tope sea 1 (se mide en áreas)', async () => {
    const suyas = delEstudiante(await candidatos(), e.estudiante);
    expect(suyas.map((f) => f.asignatura).sort()).toEqual(['Geometría', 'Matemáticas']);
    expect(suyas.every((f) => f.habilitado)).toBe(true);
    await expect(intento(geometria, e.estudiante)).resolves.toBeTruthy();
  });

  it('una asignatura perdida dentro de un área aprobada no se lista ni se puede registrar', async () => {
    expect(delEstudiante(await candidatos(), e.otroEstudiante)).toHaveLength(0);
    await expect(intento(n.asignacion, e.otroEstudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/área está aprobada/) });
  });

  it('quien perdió más áreas de las que el colegio deja recuperar sale marcado, con el motivo en áreas', async () => {
    const suyas = delEstudiante(await candidatos(), e.tercerEstudiante);
    expect(suyas.length).toBeGreaterThan(0);
    for (const f of suyas) {
      expect(f.habilitado).toBe(false);
      expect(f.motivo_no_habilitado).toMatch(/Perdió 2 áreas; el colegio permite recuperar hasta 1/);
    }
    await expect(intento(biologia, e.tercerEstudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Perdió 2 áreas/) });
    void quimica;
  });

  it('si la comisión manda a recuperar a quien excede el tope, el tope ya no lo frena (M20 → M19 → M18)', async () => {
    const cierre = await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', 'Clave-segura-1', e.admin);
    expect(cierre.por_resultado).toMatchObject({ NO_PROMOVIDO: 1, PENDIENTE_RECUPERACION: 1, PROMOVIDO: 1 });
    // Antes del acta de la comisión el tope lo bloquea.
    await expect(intento(biologia, e.tercerEstudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Perdió 2 áreas/) });

    await runTransaction((session) =>
      aplicarDecisionDeInstancia(
        { anioId: n.anioId, studentId: String(e.tercerEstudiante._id), resultado: 'PENDIENTE_RECUPERACION', sesionId: String(new Types.ObjectId()), codigoActa: 'ACE-2026-001', instancia: 'Comisión de Evaluación y Promoción', fundamento: 'Oportunidad de recuperar' },
        e.admin,
        session
      )
    );
    const suyas = delEstudiante(await candidatos(), e.tercerEstudiante);
    expect(suyas.length).toBeGreaterThan(0);
    expect(suyas.every((f) => f.habilitado)).toBe(true);
    await expect(intento(biologia, e.tercerEstudiante)).resolves.toBeTruthy();
  });
});
