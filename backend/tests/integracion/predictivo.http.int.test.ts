import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AuditLog from '../../src/models/auditLog.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import ModeloPredictivo from '../../src/modulos/predictivo/models/modeloPredictivo.model';
import { procesarSiguiente } from '../../src/modulos/predictivo/services/modelos.service';
import { generateToken } from '../../src/services/token.service';
import { vaciarCacheCorta } from '../../src/utils/cacheCorta';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario, crearUsuario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// Módulo predictivo contra la capa HTTP real: quién entra a qué, qué ve cada perfil del análisis y la cola de entrenamiento.
describe('Módulo predictivo (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let acudiente: UserDocument;
  let base: string;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1/predictivo`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    vaciarCacheCorta();
    await limpiarBaseDeDatos();
    await Promise.all([CalificacionAsignatura.syncIndexes(), ModeloPredictivo.syncIndexes()]);
    e = await armarEscenario();
    n = await prepararNotas(e);
    // Periodo 1 cerrado: un estudiante va bien y otro pierde la asignatura.
    const anio = (await AcademicYear.findById(n.anioId))!;
    anio.periodos[0]!.estado = 'CERRADO';
    await anio.save();
    for (const [estudiante, nota] of [
      [e.estudiante, 4.2],
      [e.otroEstudiante, 2.1],
    ] as const) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: 1,
        student_id: estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      });
    }
    acudiente = await crearUsuario('ACUDIENTE');
    const guardian = await Guardian.create({ tipo_documento: 'CC', numero_documento: acudiente.numero_documento, nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233', user_id: acudiente._id });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: guardian._id, parentesco: 'PADRE', es_principal: true });
  }, 120_000);

  const pedir = async (ruta: string, usuario: UserDocument | null, metodo = 'GET') => {
    const cabecera: Record<string, string> = usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {};
    const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers: cabecera });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; data?: any; message?: string } };
  };

  it('solo el ADMIN administra los modelos y solo el personal busca estudiantes', async () => {
    expect((await pedir('/modelos', null)).estado).toBe(401);
    for (const u of [e.coordAcademico, e.docenteDeClase, e.orientador, e.secretaria, e.estudiante]) {
      expect((await pedir('/modelos', u)).estado).toBe(403);
      expect((await pedir('/modelos/entrenar', u, 'POST')).estado).toBe(403);
    }
    expect((await pedir('/modelos', e.admin)).estado).toBe(200);

    const ruta = `/estudiantes/${String(e.estudiante._id)}`;
    for (const u of [e.secretaria, e.estudiante, acudiente]) expect((await pedir(ruta, u)).estado).toBe(403);
    for (const u of [e.admin, e.coordAcademico, e.coordConvivencia, e.orientador, e.docenteDeClase]) expect((await pedir(ruta, u)).estado).toBe(200);
    expect((await pedir('/mio', e.docenteDeClase)).estado).toBe(403);
    expect((await pedir(`/hijos/${String(e.estudiante._id)}`, e.estudiante)).estado).toBe(403);
  }, 120_000);

  it('el personal ve la probabilidad; el estudiante y su familia ven el FODA y la nota requerida, nunca el porcentaje', async () => {
    const personal = await pedir(`/estudiantes/${String(e.otroEstudiante._id)}`, e.docenteDeClase);
    expect(personal.cuerpo.data.corte).toBe(1);
    expect(personal.cuerpo.data.estado).toBe('LISTO');
    expect([null, 'DEMOSTRACION', 'ENTRENADO']).toContain(personal.cuerpo.data.modelo.origen);
    const materia = personal.cuerpo.data.asignaturas.find((a: { subject_id: string }) => a.subject_id === n.materiaId);
    expect(materia.nota).toBe(2.1);
    expect(materia).toHaveProperty('probabilidad');
    expect(materia.nota_requerida.estado).toBe('ALCANZABLE');
    expect(personal.cuerpo.data.ve).toEqual({ probabilidad: true, convivencia: false });

    const propio = await pedir('/mio', e.estudiante);
    expect(propio.estado).toBe(200);
    expect(propio.cuerpo.data.estudiante._id).toBe(String(e.estudiante._id));
    expect(propio.cuerpo.data.general).not.toHaveProperty('riesgo');
    for (const a of propio.cuerpo.data.asignaturas) {
      expect(a).not.toHaveProperty('probabilidad');
      expect(a).not.toHaveProperty('riesgo');
    }
    expect(JSON.stringify(propio.cuerpo.data)).not.toMatch(/probabilidad"\s*:\s*\d/);

    const hijo = await pedir(`/hijos/${String(e.estudiante._id)}`, acudiente);
    expect(hijo.estado).toBe(200);
    expect(hijo.cuerpo.data.asignaturas[0]).not.toHaveProperty('probabilidad');
    // Un estudiante que no es su hijo responde igual que uno que no existe.
    expect((await pedir(`/hijos/${String(e.otroEstudiante._id)}`, acudiente)).estado).toBe(404);

    expect(await AuditLog.countDocuments({ accion: 'PREDICTIVO_ANALISIS_CONSULTADO' })).toBe(3);
  }, 120_000);

  it('el buscador exige 3 letras y solo trae estudiantes con matrícula activa', async () => {
    expect((await pedir('/estudiantes?q=Ap', e.orientador)).cuerpo.data).toEqual([]);
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    const encontrados = (await pedir(`/estudiantes?q=${encodeURIComponent(e.estudiante.numero_documento)}`, e.orientador)).cuerpo.data;
    expect(encontrados.map((x: { _id: string }) => x._id)).toEqual([String(e.estudiante._id)]);
    expect((await pedir(`/estudiantes?q=${encodeURIComponent(e.tercerEstudiante.numero_documento)}`, e.orientador)).cuerpo.data).toEqual([]);
    // Sin matrícula activa no hay análisis: 404 para el personal y 409 para el propio estudiante.
    expect((await pedir(`/estudiantes/${String(e.tercerEstudiante._id)}`, e.admin)).estado).toBe(404);
    expect((await pedir('/mio', e.tercerEstudiante)).estado).toBe(409);
  }, 120_000);

  it('el entrenamiento se encola, no admite dos a la vez y falla con un mensaje claro si no hay años cerrados', async () => {
    const primero = await pedir('/modelos/entrenar', e.admin, 'POST');
    expect(primero.estado).toBe(202);
    expect(primero.cuerpo.data.estado).toBe('PENDIENTE');
    expect((await pedir('/modelos/entrenar', e.admin, 'POST')).estado).toBe(409);
    expect(await AuditLog.countDocuments({ accion: 'PREDICTIVO_ENTRENAMIENTO_SOLICITADO' })).toBe(1);

    expect(await procesarSiguiente({ enHilo: false })).toBe(true);
    const lista = (await pedir('/modelos', e.admin)).cuerpo.data;
    expect(lista.en_cola).toBe(false);
    expect(lista.modelos[0].estado).toBe('FALLIDO');
    expect(lista.modelos[0].error).toMatch(/años cerrados/);
    // Un modelo fallido no se activa; ya sin nada en cola se puede volver a pedir.
    expect((await pedir(`/modelos/${String(lista.modelos[0]._id)}/activar`, e.admin, 'POST')).estado).toBe(409);
    expect((await pedir('/modelos/entrenar', e.admin, 'POST')).estado).toBe(202);
  }, 120_000);
});
