import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import ConfirmacionContinuidad from '../../src/models/confirmacionContinuidad.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { cargarDocumento, formalizarMatriculaPreinscrita, grupoSugerido, listarSituacionEstudiantes } from '../../src/services/enrollment.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { crearPreinscritaHeredada } from './preinscritaHeredada';
import { armarEscenario, Escenario } from './escenario';

/**
 * M04: formalizar una matrícula preinscrita desde «Nueva matrícula» con una sola pregunta (¿trae todos los obligatorios?), ver qué ya está subido y
 * sugerir el grupo menos lleno.
 */
describe('M04: formalizar preinscritas y sugerir grupo', () => {
  let e: Escenario;
  let anio: string;
  let grupo: string;
  let contador = 0;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    anio = String((await AcademicYear.findOne())!._id);
    grupo = String((await Group.findOne())!._id);
  });

  /** Una preinscrita heredada: sin folio, con el cupo ocupado y el checklist del grado (ya ningún flujo nuevo las crea, pero siguen formalizándose). */
  const preinscrita = async () => {
    contador += 1;
    return crearPreinscritaHeredada({ grupo, anio, numero_documento: `6600${contador}`, acudiente_telefono: `32000${contador}`, acudiente_email: `familia${contador}@correo.com` });
  };
  const actor = () => ({ id: e.secretaria._id });
  const obligatorios = (checklist: Array<{ obligatorio?: boolean; tipo_documento: string }>) => checklist.filter((c) => c.obligatorio !== false);

  it('con «trae todos» cada obligatorio queda aprobado —el que tenía archivo y el que no— y la matrícula pasa a definitiva con su folio', async () => {
    const { matricula } = await preinscrita();
    expect(matricula).toMatchObject({ estado: 'PREINSCRITO', folio_matricula: null });
    const [conArchivo, ...resto] = obligatorios(matricula.checklist);
    await cargarDocumento(String(matricula._id), conArchivo!.tipo_documento as never, '/ruta/falsa.pdf', { tipo: 'PERSONAL', id: e.secretaria._id, aprobar: false });

    const formal = await formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: true }, actor());
    expect(formal.estado).toBe('MATRICULADO_DEFINITIVO');
    expect(formal.folio_matricula).toBeTruthy();
    expect(formal.fecha_limite_compromiso).toBeNull();
    for (const c of obligatorios(formal.checklist)) expect(c.estado).toBe('APROBADO');
    // El que ya tenía archivo conserva su archivo y no queda marcado como visto en físico; los demás sí.
    const item = formal.checklist.find((c) => c.tipo_documento === conArchivo!.tipo_documento)!;
    expect(item.archivo_path).toBe('/ruta/falsa.pdf');
    expect(item.fecha_verificacion_fisica).toBeNull();
    for (const c of resto) expect(formal.checklist.find((x) => x.tipo_documento === c.tipo_documento)!.fecha_verificacion_fisica).toBeInstanceOf(Date);
  });

  it('sin «trae todos» queda condicional con su fecha y su folio, y no toca los documentos', async () => {
    const { matricula } = await preinscrita();
    await expect(formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: false }, actor())).rejects.toMatchObject({ statusCode: 400 });
    const formal = await formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: false, fecha_limite_compromiso: new Date(Date.now() + 15 * 86_400_000) }, actor());
    expect(formal.estado).toBe('MATRICULADO_CONDICIONAL');
    expect(formal.folio_matricula).toBeTruthy();
    expect(formal.fecha_limite_compromiso).toBeInstanceOf(Date);
    expect(obligatorios(formal.checklist).some((c) => c.estado !== 'APROBADO')).toBe(true);
  });

  it('solo se formaliza una matrícula preinscrita', async () => {
    const { matricula } = await preinscrita();
    await formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: true }, actor());
    await expect(formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: true }, actor())).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/preinscrita/) });
    await expect(formalizarMatriculaPreinscrita('64b000000000000000000000', { trae_todos: true }, actor())).rejects.toMatchObject({ statusCode: 404 });
  });

  it('una discapacidad registrada en la hoja de vida llega a orientación al formalizar, una sola vez', async () => {
    const { estudiante, matricula } = await preinscrita();
    await StudentProfile.updateOne({ user_id: estudiante._id }, { tiene_discapacidad: true, descripcion_inclusion: 'Usa silla de ruedas.' });
    await formalizarMatriculaPreinscrita(String(matricula._id), { trae_todos: true }, actor());
    const solicitudes = await SolicitudApoyo.find({ student_id: estudiante._id });
    expect(solicitudes).toHaveLength(1);
    expect(solicitudes[0]).toMatchObject({ origen: 'MATRICULA', observacion: 'Usa silla de ruedas.' });
  });

  it('la lista de estudiantes dice qué respondió la familia sobre continuar, para el filtro «Continuarán»', async () => {
    const sin = await listarSituacionEstudiantes(anio);
    expect(sin.every((s) => s.continuidad === null)).toBe(true);
    await ConfirmacionContinuidad.create({ student_id: e.estudiante._id, academic_year_id: anio, enrollment_id: (await Enrollment.findOne({ student_id: e.estudiante._id }))!._id, decision: 'CONTINUA', sede_id: (await Group.findById(grupo))!.sede_id, registrada_por: e.secretaria._id, canal: 'SECRETARIA' });
    const con = await listarSituacionEstudiantes(anio);
    expect(con.find((s) => s._id === String(e.estudiante._id))!.continuidad).toBe('CONTINUA');
    expect(con.find((s) => s._id === String(e.otroEstudiante._id))!.continuidad).toBeNull();
  });

  describe('grupo sugerido', () => {
    it('sugiere el menos lleno del grado, y dice cuántos grupos tienen cupo', async () => {
      const base = (await Group.findById(grupo))!;
      await Group.updateOne({ _id: grupo }, { cupos_ocupados: 30, max_capacity: 40 });
      await Group.create({ sede_id: base.sede_id, academic_year_id: anio, grade_id: base.grade_id, jornada_id: base.jornada_id, nomenclatura: '602', max_capacity: 40, cupos_ocupados: 10 });
      await Group.create({ sede_id: base.sede_id, academic_year_id: anio, grade_id: base.grade_id, jornada_id: base.jornada_id, nomenclatura: '603', max_capacity: 10, cupos_ocupados: 10 });
      const r = await grupoSugerido({ academic_year_id: anio, grade_id: String(base.grade_id) });
      expect(r.sugerido).toMatchObject({ nombre: '602', libres: 30, en_preferencia: true });
      expect(r.grupos_con_cupo).toBe(2);
    });

    it('sin cupo en ningún grupo no sugiere nada', async () => {
      const base = (await Group.findById(grupo))!;
      await Group.updateOne({ _id: grupo }, { cupos_ocupados: 40 });
      expect(await grupoSugerido({ academic_year_id: anio, grade_id: String(base.grade_id) })).toEqual({ sugerido: null, grupos_con_cupo: 0 });
    });
  });
});
