import type { AddressInfo } from 'net';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import ColumnaPlanilla from '../../src/models/columnaPlanilla.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import Enrollment from '../../src/models/enrollment.model';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { crearActividad, crearCasillaSuelta, definirComponentes, EscenarioNotas, prepararNotas } from './escenarioNotas';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// M12 contra la capa HTTP real: rutas, validadores Joi, permisos por rol y el Excel offline.
describe('M12: notas (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let base: string;
  let cerrar: () => Promise<void>;
  let a1: string;
  let a2: string;
  let au: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes(), CalificacionAsignatura.syncIndexes()]);
    e = await armarEscenario();
    n = await prepararNotas(e);
    await definirComponentes([
      { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 4 },
      { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 },
    ]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 25, { titulo: 'Taller 1' }))._id);
    a2 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 75, { titulo: 'Examen' }))._id);
    au = String((await crearCasillaSuelta(n.asignacion, 'AUTOEVALUACION', 'Autoevaluación'))._id);
  }, 60_000);

  const encabezado = (usuario: UserDocument | null): Record<string, string> => (usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {});
  const asignacionId = () => String(n.asignacion._id);
  const consulta = () => `teacher_assignment_id=${asignacionId()}&periodo_numero=1`;

  const json = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...encabezado(usuario) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; message?: string; details?: any; data?: any; count?: number } };
  };

  const subirExcel = async (usuario: UserDocument, contenido: BlobPart, nombre = 'notas.xlsx') => {
    const formulario = new FormData();
    formulario.append('file', new Blob([contenido], { type: XLSX }), nombre);
    const respuesta = await fetch(`${base}/notas/planilla/excel`, { method: 'POST', headers: encabezado(usuario), body: formulario });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { message?: string; details?: any; data?: any } };
  };

  const descargarExcel = async (usuario: UserDocument) => {
    const respuesta = await fetch(`${base}/notas/planilla/excel?${consulta()}`, { headers: encabezado(usuario) });
    return { respuesta, buffer: Buffer.from(await respuesta.arrayBuffer()) };
  };

  const celdas = (clave: 'estudiante' | 'otroEstudiante' | 'tercerEstudiante') => [
    { student_id: String(e[clave]._id), casilla_id: a1, nota: 4 },
    { student_id: String(e[clave]._id), casilla_id: a2, nota: 2 },
    { student_id: String(e[clave]._id), casilla_id: au, nota: 5 },
  ];
  const todas = () => [...celdas('estudiante'), ...celdas('otroEstudiante'), ...celdas('tercerEstudiante')];

  it('cada ruta exige sesión y el rol que le corresponde', async () => {
    const rutas: Array<[string, string, UserDocument | null, number]> = [
      ['GET', `/notas/planilla?${consulta()}`, null, 401],
      ['GET', `/notas/planilla?${consulta()}`, e.estudiante, 403],
      ['GET', `/notas/planilla?${consulta()}`, e.secretaria, 403],
      ['GET', `/notas/planilla?${consulta()}`, e.docenteAjeno, 403],
      ['PUT', '/notas/planilla', e.coordAcademico, 403],
      ['PUT', '/notas/planilla', e.estudiante, 403],
      ['POST', '/notas/planilla/cerrar', e.coordAcademico, 403],
      ['POST', '/notas/planilla/reabrir', e.estudiante, 403],
      ['POST', '/notas/definitivas', e.docenteDeClase, 403],
      ['GET', `/notas/seguimiento?academic_year_id=${n.anioId}&periodo_numero=1`, e.docenteDeClase, 403],
      ['GET', `/notas/planilla/excel?${consulta()}`, e.coordAcademico, 403],
      ['GET', `/notas/bloques?${consulta()}`, e.estudiante, 403],
      ['GET', `/notas/bloques?${consulta()}`, null, 401],
      ['POST', '/notas/columnas', e.coordAcademico, 403],
      ['PATCH', `/notas/columnas/${au}`, e.admin, 403],
      ['DELETE', `/notas/columnas/${au}`, e.coordAcademico, 403],
      ['PUT', '/notas/pesos', e.admin, 403],
      ['PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.docenteDeClase, 403],
      ['PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.coordAcademico, 403],
    ];
    for (const [metodo, ruta, usuario, esperado] of rutas) {
      expect((await json(metodo, ruta, usuario, metodo === 'GET' ? undefined : {})).estado, `${metodo} ${ruta}`).toBe(esperado);
    }
  });

  it('valida la forma de lo que llega', async () => {
    const validos = { ...JSON.parse(`{"teacher_assignment_id":"${asignacionId()}","periodo_numero":1}`) };
    const intentos: Array<[string, string, unknown]> = [
      ['PUT', '/notas/planilla', { ...validos, celdas: [] }],
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), nota: 3 }] }],
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), casilla_id: 'no-es-un-id', nota: 3 }] }],
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), actividad_id: a1, nota: 3 }] }],
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), casilla_id: a1, nota: -1 }] }],
      ['POST', '/notas/columnas', { ...validos, bloque_clave: 'HETEROEVALUACION', nombre: '' }],
      ['POST', '/notas/columnas', { ...validos, bloque_clave: 'HETEROEVALUACION', nombre: 'Quiz', peso: 101 }],
      ['POST', '/notas/columnas', { ...validos, nombre: 'Quiz' }],
      ['PUT', '/notas/pesos', { ...validos, pesos: [] }],
      ['PUT', '/notas/pesos', { ...validos, pesos: [{ casilla_id: a1 }] }],
      ['PUT', '/notas/planilla', { ...validos, periodo_numero: 7, celdas: celdas('estudiante') }],
      ['POST', '/notas/planilla/reabrir', { ...validos, motivo: 'no' }],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      expect((await json(metodo, ruta, e.docenteDeClase, cuerpo)).estado, JSON.stringify(cuerpo)).toBe(400);
    }
    expect((await json('POST', '/notas/definitivas', e.coordAcademico, { periodo_numero: 1 })).estado).toBe(400);
    expect((await json('GET', '/notas/planilla', e.docenteDeClase)).estado).toBe(400);
  });

  it('flujo completo por la API: digitar, no poder cerrar incompleto, cerrar, definitiva, boletín y reabrir', async () => {
    const guardado = await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: celdas('estudiante') });
    expect(guardado.estado).toBe(200);
    expect(guardado.cuerpo.data).toMatchObject({ guardadas: 3, sin_cambios: 0 });
    expect(guardado.cuerpo.data.planilla.estudiantes.find((f: any) => f.estudiante._id === String(e.estudiante._id))).toMatchObject({ estado: 'BORRADOR', nota_asignatura: 3.25 });

    const incompleta = await json('POST', '/notas/planilla/cerrar', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1 });
    expect(incompleta.estado).toBe(409);
    expect(incompleta.cuerpo.details).toHaveLength(2);

    await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: [...celdas('otroEstudiante'), ...celdas('tercerEstudiante')] });
    const cerrada = await json('POST', '/notas/planilla/cerrar', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1 });
    expect(cerrada.estado).toBe(200);
    expect(cerrada.cuerpo.data.resumen.CERRADO).toBe(3);

    // Cerrada: coordinación la consulta pero nadie la edita.
    expect((await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: celdas('estudiante') })).estado).toBe(409);
    expect((await json('GET', `/notas/planilla?${consulta()}`, e.coordAcademico)).cuerpo.data.edicion).toMatchObject({ puede_editar: false, puede_definitiva: true });
    expect((await json('GET', `/notas/seguimiento?academic_year_id=${n.anioId}&periodo_numero=1`, e.coordAcademico)).cuerpo.data[0]).toMatchObject({ estado: 'CERRADA', cerradas: 3 });

    const definitivas = await json('POST', '/notas/definitivas', e.coordAcademico, { academic_year_id: n.anioId, periodo_numero: 1 });
    expect(definitivas.cuerpo.data).toEqual({ definitivas: 1, omitidas: [] });

    const boletin = await json('GET', `/reports/report-card?student_id=${String(e.estudiante._id)}&academic_year_id=${n.anioId}&periodo=1`, e.estudiante);
    expect(boletin.cuerpo.data).toMatchObject({ completo: true, promedio_general_periodo: 3.25 });
    expect(boletin.cuerpo.data.areas[0].asignaturas[0]).toMatchObject({ estado: 'DEFINITIVO', nota_asignatura: 3.25 });

    expect((await json('POST', '/notas/planilla/reabrir', e.coordAcademico, { teacher_assignment_id: asignacionId(), periodo_numero: 1, motivo: 'Corregir una nota' })).estado).toBe(403);
    const reabierta = await json('POST', '/notas/planilla/reabrir', e.admin, { teacher_assignment_id: asignacionId(), periodo_numero: 1, motivo: 'Corregir una nota' });
    expect(reabierta.estado).toBe(200);
    expect(reabierta.cuerpo.data.resumen.BORRADOR).toBe(3);
    expect((await json('GET', `/reports/report-card?student_id=${String(e.estudiante._id)}&academic_year_id=${n.anioId}&periodo=1`, e.estudiante)).cuerpo.data).toMatchObject({ completo: false, promedio_general_periodo: null });
  });

  it('el administrador configura el molde por la API (bloques, porcentajes y casillas máximas)', async () => {
    const { AcademicYear } = await import('../../src/models/academicYear.model');
    await AcademicYear.updateOne({}, { $set: { estado: 'PLANIFICACION' } });
    const cuerpo = [
      { nombre: 'Heteroevaluación', porcentaje: 80, max_casillas: 30 },
      { nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 },
    ];
    const ok = await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, cuerpo);
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo.data.componentes_efectivos.map((c: any) => [c.clave, c.max_casillas])).toEqual([['HETEROEVALUACION', 30], ['AUTOEVALUACION', 1]]);
    expect((await json('GET', '/academic-years', e.estudiante)).cuerpo.data[0].componentes_efectivos).toHaveLength(2);

    expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [{ nombre: 'Solo', porcentaje: 50, max_casillas: 5 }])).estado).toBe(400);
    for (const mala of [{ nombre: 'Mal', porcentaje: 100 }, { nombre: 'Mal', porcentaje: 100, max_casillas: 0 }, { nombre: 'Mal', porcentaje: 100, max_casillas: 51 }]) {
      expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [mala])).estado, JSON.stringify(mala)).toBe(400);
    }
    // Bajar el máximo de la heteroevaluación por debajo de las casillas que ya tiene (2) lo impide el servidor.
    const bajo = await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [{ clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 80, max_casillas: 1 }, { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 20, max_casillas: 1 }]);
    expect(bajo.estado).toBe(409);
    expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [])).estado).toBe(400);
  });

  describe('plantilla de la planilla (M21 mínimo)', () => {
    const plantilla = () => json('GET', '/notas/plantilla', e.docenteDeClase);

    it('la lee quien digita o consulta y solo el administrador la cambia', async () => {
      expect((await plantilla()).cuerpo.data).toMatchObject({
        titulo: 'Planilla de calificaciones',
        columnas: { documento: true, promedios_componente: true, desempeno: true, estado: true },
        firmas: [{ cargo: 'Docente', usa_docente: true }, { cargo: 'Coordinación académica' }],
      });
      expect((await json('GET', '/notas/plantilla', e.coordAcademico)).estado).toBe(200);
      expect((await json('GET', '/notas/plantilla', e.estudiante)).estado).toBe(403);

      const cambios = { titulo: 'Registro de valoración', pie: 'Documento controlado' };
      expect((await json('PUT', '/notas/plantilla', e.docenteDeClase, cambios)).estado).toBe(403);
      expect((await json('PUT', '/notas/plantilla', e.coordAcademico, cambios)).estado).toBe(403);
      const ok = await json('PUT', '/notas/plantilla', e.admin, { ...cambios, columnas: { estado: false }, firmas: [{ cargo: 'Rectoría', nombre: 'Ana Pérez' }] });
      expect(ok.estado).toBe(200);
      expect(ok.cuerpo.data).toMatchObject({
        titulo: 'Registro de valoración',
        columnas: { estado: false, documento: true },
        firmas: [{ cargo: 'Rectoría', nombre: 'Ana Pérez', usa_docente: false }],
      });
      // La planilla del docente ya viene con la plantilla vigente.
      const planilla = await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase);
      expect(planilla.cuerpo.data.plantilla).toMatchObject({ titulo: 'Registro de valoración', columnas: { estado: false } });
    });

    it('valida la forma de lo que llega', async () => {
      const cincoFirmas = Array.from({ length: 5 }, (_, i) => ({ cargo: `Cargo ${i}` }));
      for (const cuerpo of [{}, { titulo: '' }, { columnas: {} }, { firmas: [{ cargo: '' }] }, { firmas: cincoFirmas }, { mostrar_logo: 'tal vez' }]) {
        expect((await json('PUT', '/notas/plantilla', e.admin, cuerpo)).estado, JSON.stringify(cuerpo)).toBe(400);
      }
    });

    it('el Excel respeta la plantilla: oculta lo que el colegio no quiere ver, agrega título y firmas, y sigue importando', async () => {
      await json('PUT', '/notas/plantilla', e.admin, {
        titulo: 'Registro de valoración',
        pie: 'Documento controlado',
        columnas: { documento: false, promedios_componente: false, desempeno: false, estado: false, pesos: false },
        firmas: [{ cargo: 'Docente', usa_docente: true }, { cargo: 'Rectoría', nombre: 'Ana Pérez' }],
      });
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      expect(String(hoja.getCell('A1').value)).toMatch(/^Registro de valoración — Matem/);
      // Columnas: 1 doc, 2 estudiante, 3-6 casillas de la hetero, 7 nota hetero, 8 autoevaluación, 9 nota auto, 10 nota, 11 desempeño, 12 estado.
      expect([1, 7, 9, 11, 12].map((c) => hoja.getColumn(c).hidden)).toEqual([true, true, true, true, true]);
      expect([2, 3, 4, 5, 6, 8, 10].map((c) => Boolean(hoja.getColumn(c).hidden))).toEqual([false, false, false, false, false, false, false]);
      // Se esconde el peso que realmente cuenta (calculado), no la fila donde el docente escribe los pesos.
      expect(hoja.getRow(5).hidden).toBe(true);
      expect(Boolean(hoja.getRow(4).hidden)).toBe(false);
      const textos: string[] = [];
      hoja.eachRow((fila) => fila.eachCell((celda) => textos.push(String(celda.value))));
      expect(textos).toEqual(expect.arrayContaining(['Documento controlado', 'Ana Pérez', 'Rectoría', 'Docente']));

      // Oculto no es quitado: la importación sigue identificando al estudiante por su documento.
      const fila = [6, 7, 8].find((r) => hoja.getCell(r, 1).value === e.estudiante.numero_documento)!;
      hoja.getCell(fila, 3).value = 4;
      const subido = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(subido.estado).toBe(200);
      expect(subido.cuerpo.data).toMatchObject({ guardadas: 1 });
    });

    it('el PDF se genera con la plantilla y solo lo ven quienes ven la planilla', async () => {
      const ruta = `/notas/planilla/pdf?${consulta()}`;
      const descarga = async (usuario: UserDocument | null) => fetch(`${base}${ruta}`, { headers: encabezado(usuario) });
      const respuesta = await descarga(e.docenteDeClase);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toBe('application/pdf');
      expect(respuesta.headers.get('content-disposition')).toMatch(/planilla-Matem.*periodo-1\.pdf/i);
      const contenido = Buffer.from(await respuesta.arrayBuffer());
      expect(contenido.subarray(0, 4).toString()).toBe('%PDF');
      expect(contenido.length).toBeGreaterThan(1500);

      expect((await descarga(e.coordAcademico)).status).toBe(200);
      expect((await descarga(e.admin)).status).toBe(200);
      expect((await descarga(e.docenteAjeno)).status).toBe(403);
      expect((await descarga(e.estudiante)).status).toBe(403);
      expect((await descarga(null)).status).toBe(401);
    });

    it('el PDF aguanta un grupo grande, de varias páginas, con todas las opciones apagadas', async () => {
      for (let i = 0; i < 45; i += 1) {
        const alumno = await crearUsuario('ESTUDIANTE');
        await Enrollment.create({
          student_id: alumno._id,
          group_id: n.grupoId,
          academic_year_id: n.asignacion.academic_year_id,
          tipo_ingreso: 'NUEVO',
          estado: 'MATRICULADO_DEFINITIVO',
          folio_matricula: `F-${alumno.numero_documento}`,
        });
      }
      await json('PUT', '/notas/plantilla', e.admin, {
        columnas: { documento: false, promedios_componente: false, desempeno: false, estado: false, pesos: false },
        firmas: [],
        mostrar_logo: false,
      });
      const respuesta = await fetch(`${base}/notas/planilla/pdf?${consulta()}`, { headers: encabezado(e.docenteDeClase) });
      expect(respuesta.status).toBe(200);
      const contenido = Buffer.from(await respuesta.arrayBuffer());
      expect(contenido.subarray(0, 4).toString()).toBe('%PDF');
      // 48 estudiantes no caben en una hoja horizontal: el documento tiene más de una página.
      expect((contenido.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    }, 120_000);
  });

  it('la planilla dice qué entregó cada estudiante en las actividades con entrega digital (para revisarlas desde ella)', async () => {
    await ActivitySubmission.create({ activity_id: a1, student_id: e.estudiante._id, fecha_entrega: new Date(), estado: 'ENTREGADA', archivo_path: 'uploads/actividades/x.pdf' });
    await ActivitySubmission.create({ activity_id: a1, student_id: e.otroEstudiante._id, fecha_entrega: new Date(), estado: 'ENTREGADA_TARDE', con_retraso: true, texto_entrega: 'tarde' });
    await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: [{ student_id: String(e.estudiante._id), casilla_id: a1, nota: 4 }] });
    await Activity.updateOne({ _id: a2 }, { $set: { requiere_entrega: false } });

    const planilla = (await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase)).cuerpo.data;
    const de = (id: string) => planilla.estudiantes.find((f: any) => f.estudiante._id === id);
    expect(de(String(e.estudiante._id)).entregas).toEqual({ [a1]: { estado: 'CALIFICADA', tiene_archivo: true } });
    expect(de(String(e.otroEstudiante._id)).entregas).toEqual({ [a1]: { estado: 'ENTREGADA_TARDE', tiene_archivo: false } });
    expect(de(String(e.tercerEstudiante._id)).entregas).toEqual({ [a1]: { estado: 'PROGRAMADA', tiene_archivo: false } });
    // La actividad de aula (sin entrega digital) no aparece entre las entregas.
    expect(planilla.bloques[0].casillas.map((a: any) => [a.titulo, a.requiere_entrega])).toEqual([['Taller 1', true], ['Examen', false]]);
  });

  describe('casillas y pesos por la API', () => {
    const planillaDe = async () => (await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase)).cuerpo.data;
    const ref = () => ({ teacher_assignment_id: asignacionId(), periodo_numero: 1 });

    it('GET /notas/bloques devuelve los bloques con lo usado y su máximo, al titular y a coordinación', async () => {
      const docente = await json('GET', `/notas/bloques?${consulta()}`, e.docenteDeClase);
      expect(docente.estado).toBe(200);
      expect(docente.cuerpo.data.map((b: any) => [b.clave, b.max_casillas, b.casillas.length])).toEqual([['HETEROEVALUACION', 4, 2], ['AUTOEVALUACION', 1, 1]]);
      expect((await json('GET', `/notas/bloques?${consulta()}`, e.coordAcademico)).estado).toBe(200);
      expect((await json('GET', `/notas/bloques?${consulta()}`, e.docenteAjeno)).estado).toBe(403);
    });

    it('crea, edita y elimina una nota suelta; el bloque lleno responde 409', async () => {
      const creada = await json('POST', '/notas/columnas', e.docenteDeClase, { ...ref(), bloque_clave: 'HETEROEVALUACION', nombre: 'Quiz' });
      expect(creada.estado).toBe(201);
      const id = creada.cuerpo.data._id;
      expect((await planillaDe()).bloques[0].casillas.map((c: any) => [c.titulo, c.peso])).toEqual([['Taller 1', 25], ['Examen', 75], ['Quiz', null]]);

      // 25 + 75 ya llenan el 100% del bloque: otro peso puesto lo pasa: el servidor lo rechaza, no solo la pantalla.
      expect((await json('POST', '/notas/columnas', e.docenteDeClase, { ...ref(), bloque_clave: 'HETEROEVALUACION', nombre: 'Otro', peso: 10 })).estado).toBe(400);

      const editada = await json('PATCH', `/notas/columnas/${id}`, e.docenteDeClase, { nombre: 'Quiz 1', peso: null });
      expect(editada.estado).toBe(200);
      expect((await ColumnaPlanilla.findById(id))!).toMatchObject({ nombre: 'Quiz 1', peso: null });

      expect((await json('POST', '/notas/columnas', e.docenteDeClase, { ...ref(), bloque_clave: 'AUTOEVALUACION', nombre: 'Otra' })).estado).toBe(409);

      expect((await json('DELETE', `/notas/columnas/${id}`, e.docenteDeClase)).estado).toBe(200);
      expect(await ColumnaPlanilla.exists({ _id: id })).toBeNull();
      expect((await json('DELETE', `/notas/columnas/${id}`, e.docenteDeClase)).estado).toBe(404);
      expect((await json('DELETE', `/notas/columnas/${a1}`, e.docenteDeClase)).estado).toBe(400);
    });

    it('PUT /notas/pesos fija los pesos en bloque y devuelve los bloques con el peso que realmente cuenta', async () => {
      const ok = await json('PUT', '/notas/pesos', e.docenteDeClase, { ...ref(), pesos: [{ casilla_id: a1, peso: 60 }, { casilla_id: a2, peso: null }] });
      expect(ok.estado).toBe(200);
      expect(ok.cuerpo.data[0].casillas.map((c: any) => [c.peso, c.peso_efectivo])).toEqual([[60, 60], [null, 40]]);

      const excedido = await json('PUT', '/notas/pesos', e.docenteDeClase, { ...ref(), pesos: [{ casilla_id: a1, peso: 80 }, { casilla_id: a2, peso: 40 }] });
      expect(excedido.estado).toBe(400);
      expect(excedido.cuerpo.message).toMatch(/100%/);
    });

    it('una actividad cambia de bloque y de peso desde la planilla; cerrada, nada se mueve', async () => {
      await json('PATCH', `/notas/columnas/${a2}`, e.docenteDeClase, { peso: 50 });
      expect((await Activity.findById(a2))!.peso_en_componente).toBe(50);
      expect((await json('PATCH', `/notas/columnas/${a2}`, e.docenteDeClase, { nombre: 'Otro título' })).estado).toBe(400);

      await json('PUT', '/notas/planilla', e.docenteDeClase, { ...ref(), celdas: todas() });
      await json('POST', '/notas/planilla/cerrar', e.docenteDeClase, ref());
      expect((await json('PATCH', `/notas/columnas/${a2}`, e.docenteDeClase, { peso: 10 })).estado).toBe(409);
      expect((await json('PUT', '/notas/pesos', e.docenteDeClase, { ...ref(), pesos: [{ casilla_id: a1, peso: 10 }] })).estado).toBe(409);
    });
  });

  describe('Excel offline (M22)', () => {
    // Columnas: 1 doc, 2 estudiante, 3 Taller 1, 4 Examen, 5-6 casillas en blanco, 7 nota hetero, 8 Autoevaluación, 9 nota auto,
    // 10 nota de la asignatura, 11 desempeño, 12 estado. Filas: 2 bloques, 3 nombres, 4 pesos, 5 peso efectivo, estudiantes desde la 6.
    const FILAS = [6, 7, 8];

    it('se descarga con fórmulas protegidas, las casillas del molde y solo las celdas de entrada editables, y se reimporta', async () => {
      await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: [{ student_id: String(e.estudiante._id), casilla_id: a1, nota: 4 }] });

      const { respuesta, buffer } = await descargarExcel(e.docenteDeClase);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toContain('spreadsheetml');
      expect(respuesta.headers.get('content-disposition')).toMatch(/notas-Matem.*periodo-1\.xlsx/i);

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      expect(libro.getWorksheet('Datos')!.state).toBe('hidden');
      expect(hoja.sheetProtection).toBeTruthy();
      expect(String(hoja.getCell('A1').value)).toMatch(/Matemáticas · Grupo 601 · Periodo 1/);
      expect(hoja.getCell(2, 3).value).toBe('Heteroevaluación (70%) — hasta 4 casillas');
      expect(hoja.getCell(2, 8).value).toBe('Autoevaluación (30%) — hasta 1 casilla');
      expect(hoja.getCell(3, 3).value).toBe('Taller 1');
      expect(hoja.getCell(4, 3).value).toBe(25); // peso que puso el docente
      expect(hoja.getCell(4, 4).value).toBe(75);
      expect(hoja.getCell(4, 5).value).toBeNull(); // casilla en blanco: sin peso
      expect(typeof (hoja.getCell(5, 3).value as { formula?: string }).formula).toBe('string'); // peso efectivo calculado
      expect(hoja.getCell(3, 8).value).toBe('Autoevaluación');
      // El título de una actividad lo manda M11; el de una casilla en blanco y el de una nota suelta los pone el docente.
      expect(hoja.getCell(3, 3).protection?.locked ?? true).toBe(true);
      expect(hoja.getCell(3, 5).protection?.locked).toBe(false);
      expect(hoja.getCell(3, 8).protection?.locked).toBe(false);
      expect(hoja.getCell(4, 3).protection?.locked).toBe(false);

      const filaEstudiante = FILAS.find((r) => hoja.getCell(r, 1).value === e.estudiante.numero_documento)!;
      const notaTaller = hoja.getCell(filaEstudiante, 3);
      expect(notaTaller.value).toBe(4);
      expect(notaTaller.protection?.locked).toBe(false);
      expect(hoja.getCell(filaEstudiante, 5).protection?.locked).toBe(false); // casilla en blanco
      expect(hoja.getCell(filaEstudiante, 8).protection?.locked).toBe(false); // autoevaluación
      for (const columna of [7, 9, 10, 11]) {
        const calculada = hoja.getCell(filaEstudiante, columna);
        expect(typeof (calculada.value as { formula?: string }).formula, `columna ${columna}`).toBe('string');
        expect(calculada.protection?.locked ?? true).toBe(true);
      }
      expect(hoja.getCell(filaEstudiante, 12).value).toBe('PENDIENTE');
      expect(hoja.getCell(filaEstudiante, 3).dataValidation).toMatchObject({ type: 'decimal', formulae: [1, 5] });

      // El docente diligencia sin conexión (con coma decimal en texto, como la guarda Excel en español) y la sube.
      hoja.getCell(filaEstudiante, 4).value = 2;
      hoja.getCell(filaEstudiante, 8).value = '5,0';
      const otra = FILAS.find((r) => r !== filaEstudiante)!;
      hoja.getCell(otra, 3).value = 3.5;
      const subido = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(subido.estado).toBe(200);
      expect(subido.cuerpo.data).toMatchObject({ asignatura: 'Matemáticas', grupo: '601', periodo: 1, guardadas: 3, sin_cambios: 1, casillas_creadas: 0, pesos_actualizados: 0 });

      const planilla = (await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase)).cuerpo.data;
      const guardada = planilla.estudiantes.find((f: any) => f.estudiante._id === String(e.estudiante._id));
      expect(guardada).toMatchObject({ estado: 'BORRADOR', nota_asignatura: 3.25 });
      expect(planilla.estudiantes.find((f: any) => f.estudiante.numero_documento === String(hoja.getCell(otra, 1).value)).notas[a1]).toBe(3.5);
    });

    it('crea casillas nuevas desde el Excel (nombre, peso y notas), renombra la suelta y reparte los pesos', async () => {
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      const filaEstudiante = FILAS.find((r) => hoja.getCell(r, 1).value === e.estudiante.numero_documento)!;

      hoja.getCell(3, 5).value = 'Quiz 1';
      hoja.getCell(4, 3).value = 30;
      hoja.getCell(4, 4).value = 30;
      hoja.getCell(4, 5).value = 40;
      hoja.getCell(filaEstudiante, 5).value = 5;
      hoja.getCell(3, 8).value = 'Mi autoevaluación';
      hoja.getCell(filaEstudiante, 8).value = 4;

      const subido = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(subido.estado).toBe(200);
      expect(subido.cuerpo.data).toMatchObject({ guardadas: 2, casillas_creadas: 1, casillas_renombradas: 1, pesos_actualizados: 3 });

      const planilla = (await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase)).cuerpo.data;
      const hetero = planilla.bloques[0];
      expect(hetero.casillas.map((c: any) => [c.titulo, c.peso])).toEqual([['Taller 1', 30], ['Examen', 30], ['Quiz 1', 40]]);
      expect(planilla.bloques[1].casillas[0].titulo).toBe('Mi autoevaluación');
      const nueva = hetero.casillas[2].id;
      expect(planilla.estudiantes.find((f: any) => f.estudiante._id === String(e.estudiante._id)).notas[nueva]).toBe(5);

      // Volver a bajar la planilla trae la casilla ya creada con su nombre y su peso.
      const { buffer: otra } = await descargarExcel(e.docenteDeClase);
      const libro2 = new ExcelJS.Workbook();
      await libro2.xlsx.load(otra as unknown as ArrayBuffer);
      expect(libro2.getWorksheet('Planilla')!.getCell(3, 5).value).toBe('Quiz 1');
      expect(libro2.getWorksheet('Planilla')!.getCell(4, 5).value).toBe(40);
    });

    it('no guarda nada si el archivo tiene errores en los encabezados: nombre que falta, pesos que pasan de 100', async () => {
      const bajar = async () => {
        const { buffer } = await descargarExcel(e.docenteDeClase);
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(buffer as unknown as ArrayBuffer);
        return libro;
      };
      const subir = async (libro: ExcelJS.Workbook) => subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));

      const sinNombre = await bajar();
      sinNombre.getWorksheet('Planilla')!.getCell(6, 5).value = 4;
      const r1 = await subir(sinNombre);
      expect(r1.estado).toBe(400);
      expect(r1.cuerpo.details).toEqual([{ fila: 3, motivo: expect.stringMatching(/no tiene nombre/) }]);

      const pesado = await bajar();
      pesado.getWorksheet('Planilla')!.getCell(3, 5).value = 'Quiz';
      pesado.getWorksheet('Planilla')!.getCell(4, 3).value = 60;
      pesado.getWorksheet('Planilla')!.getCell(4, 4).value = 60;
      const r2 = await subir(pesado);
      expect(r2.estado).toBe(400);
      expect(r2.cuerpo.details).toEqual([{ fila: 4, motivo: expect.stringMatching(/no pueden sumar más de 100%/) }]);

      const pesoMalo = await bajar();
      pesoMalo.getWorksheet('Planilla')!.getCell(4, 3).value = 150;
      expect((await subir(pesoMalo)).estado).toBe(400);

      const sinRenombre = await bajar();
      sinRenombre.getWorksheet('Planilla')!.getCell(3, 8).value = null;
      expect((await subir(sinRenombre)).cuerpo.details).toEqual([{ fila: 3, motivo: expect.stringMatching(/quedó sin nombre/) }]);

      expect(await ColumnaPlanilla.countDocuments()).toBe(1); // solo la autoevaluación del escenario
      expect((await Activity.findById(a1))!.peso_en_componente).toBe(25);
    });

    it('no guarda nada si una fila tiene error, y dice cuál', async () => {
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      hoja.getCell(6, 3).value = 4;
      hoja.getCell(7, 3).value = 'excelente';
      hoja.getCell(8, 1).value = '9999999';
      hoja.getCell(8, 3).value = 3;

      const resultado = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(resultado.estado).toBe(400);
      expect(resultado.cuerpo.details).toEqual([
        { fila: 7, documento: expect.any(String), motivo: expect.stringMatching(/no es una nota numérica/) },
        { fila: 8, documento: '9999999', motivo: expect.stringMatching(/no corresponde a un estudiante/) },
      ]);
      expect(await ActivitySubmission.countDocuments()).toBe(0);
    });

    it('una nota fuera de la escala se rechaza antes de guardar nada', async () => {
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      libro.getWorksheet('Planilla')!.getCell(6, 3).value = 9;
      const resultado = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(resultado.estado).toBe(400);
      expect(resultado.cuerpo.details).toEqual([{ fila: 6, documento: expect.any(String), motivo: expect.stringMatching(/fuera de la escala/) }]);
      expect(await ActivitySubmission.countDocuments()).toBe(0);
    });

    it('rechaza lo que no es una planilla de Klassy, o de otro docente, o ya cerrada', async () => {
      expect((await subirExcel(e.docenteDeClase, 'hola', 'notas.txt')).estado).toBe(400);
      expect((await subirExcel(e.docenteDeClase, 'esto no es un excel', 'notas.xlsx')).cuerpo.message).toMatch(/no es un Excel/);
      const ajeno = new ExcelJS.Workbook();
      ajeno.addWorksheet('Hoja1').getCell('A1').value = 'x';
      expect((await subirExcel(e.docenteDeClase, Buffer.from(await ajeno.xlsx.writeBuffer()))).cuerpo.message).toMatch(/no es una planilla de notas de Klassy/);

      const { buffer } = await descargarExcel(e.docenteDeClase);
      expect((await subirExcel(e.docenteAjeno, buffer)).estado).toBe(403);
      expect((await subirExcel(e.coordAcademico, buffer)).estado).toBe(403);

      await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: todas() });
      await json('POST', '/notas/planilla/cerrar', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1 });
      const cerrada = await subirExcel(e.docenteDeClase, buffer);
      expect(cerrada.estado).toBe(409);
      expect(cerrada.cuerpo.message).toMatch(/cerrada/);

      // La planilla cerrada se puede bajar para archivarla, con todas las celdas protegidas.
      const { buffer: archivada } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(archivada as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      expect(hoja.getCell(6, 3).protection?.locked ?? true).toBe(true);
      expect(hoja.getCell(3, 5).protection?.locked ?? true).toBe(true);
      expect(hoja.getCell(4, 3).protection?.locked ?? true).toBe(true);
      expect(hoja.getCell(6, 12).value).toBe('CERRADO');
    });
  });
});
