import type { AddressInfo } from 'net';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { crearActividad, definirComponentes, EscenarioNotas, prepararNotas } from './escenarioNotas';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// M12 contra la capa HTTP real: rutas, validadores Joi, permisos por rol y el Excel offline.
describe('M12: notas (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let base: string;
  let cerrar: () => Promise<void>;
  let a1: string;
  let a2: string;

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
      { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, origen: 'ACTIVIDADES' },
      { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, origen: 'NOTA_DIRECTA' },
    ]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 1, { titulo: 'Taller 1' }))._id);
    a2 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', 3, { titulo: 'Examen' }))._id);
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
    { student_id: String(e[clave]._id), actividad_id: a1, nota: 4 },
    { student_id: String(e[clave]._id), actividad_id: a2, nota: 2 },
    { student_id: String(e[clave]._id), componente_clave: 'AUTOEVALUACION', nota: 5 },
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
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), actividad_id: a1, componente_clave: 'AUTOEVALUACION', nota: 3 }] }],
      ['PUT', '/notas/planilla', { ...validos, celdas: [{ student_id: String(e.estudiante._id), actividad_id: a1, nota: -1 }] }],
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

  it('el administrador configura los componentes por la API y las actividades se programan sobre ellos', async () => {
    const { AcademicYear } = await import('../../src/models/academicYear.model');
    await Activity.deleteMany({});
    await AcademicYear.updateOne({}, { $set: { estado: 'PLANIFICACION' } });
    const cuerpo = [
      { nombre: 'Heteroevaluación', porcentaje: 80, origen: 'ACTIVIDADES' },
      { nombre: 'Autoevaluación', porcentaje: 20, origen: 'NOTA_DIRECTA' },
    ];
    const ok = await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, cuerpo);
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo.data.componentes_efectivos.map((c: any) => c.clave)).toEqual(['HETEROEVALUACION', 'AUTOEVALUACION']);
    expect((await json('GET', '/academic-years', e.estudiante)).cuerpo.data[0].componentes_efectivos).toHaveLength(2);

    expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [{ nombre: 'Solo', porcentaje: 50, origen: 'ACTIVIDADES' }])).estado).toBe(400);
    expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [{ nombre: 'Mal', porcentaje: 100, origen: 'OTRO' }])).estado).toBe(400);
    expect((await json('PATCH', `/academic-years/${n.anioId}/componentes-evaluativos`, e.admin, [])).estado).toBe(400);
  });

  describe('Excel offline (M22)', () => {
    it('se descarga con fórmulas protegidas y solo las celdas de nota editables, y se reimporta', async () => {
      await json('PUT', '/notas/planilla', e.docenteDeClase, { teacher_assignment_id: asignacionId(), periodo_numero: 1, celdas: [{ student_id: String(e.estudiante._id), actividad_id: a1, nota: 4 }] });

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
      expect(hoja.getCell(2, 3).value).toBe('Heteroevaluación (70%)');
      expect(hoja.getCell(3, 3).value).toBe('Taller 1');
      expect(hoja.getCell(4, 3).value).toBe(1); // peso de la actividad
      expect(hoja.getCell(4, 4).value).toBe(3);

      // Columnas: doc, estudiante, Taller 1, Examen, Promedio hetero, Autoevaluación, Nota, Desempeño, Estado.
      const filaEstudiante = [5, 6, 7].find((r) => hoja.getCell(r, 1).value === e.estudiante.numero_documento)!;
      const notaTaller = hoja.getCell(filaEstudiante, 3);
      expect(notaTaller.value).toBe(4);
      expect(notaTaller.protection?.locked).toBe(false);
      expect(hoja.getCell(filaEstudiante, 6).protection?.locked).toBe(false); // autoevaluación
      for (const columna of [5, 7, 8]) {
        const calculada = hoja.getCell(filaEstudiante, columna);
        expect(typeof (calculada.value as { formula?: string }).formula, `columna ${columna}`).toBe('string');
        expect(calculada.protection?.locked ?? true).toBe(true);
      }
      expect(hoja.getCell(filaEstudiante, 9).value).toBe('PENDIENTE');
      expect(hoja.getCell(filaEstudiante, 3).dataValidation).toMatchObject({ type: 'decimal', formulae: [1, 5] });

      // El docente diligencia sin conexión (con coma decimal en texto, como la guarda Excel en español) y la sube.
      hoja.getCell(filaEstudiante, 4).value = 2;
      hoja.getCell(filaEstudiante, 6).value = '5,0';
      const otra = [5, 6, 7].find((r) => r !== filaEstudiante)!;
      hoja.getCell(otra, 3).value = 3.5;
      const subido = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(subido.estado).toBe(200);
      expect(subido.cuerpo.data).toMatchObject({ asignatura: 'Matemáticas', grupo: '601', periodo: 1, guardadas: 3, sin_cambios: 1 });

      const planilla = (await json('GET', `/notas/planilla?${consulta()}`, e.docenteDeClase)).cuerpo.data;
      const guardada = planilla.estudiantes.find((f: any) => f.estudiante._id === String(e.estudiante._id));
      expect(guardada).toMatchObject({ estado: 'BORRADOR', nota_asignatura: 3.25 });
      expect(planilla.estudiantes.find((f: any) => f.estudiante.numero_documento === String(hoja.getCell(otra, 1).value)).notas_actividad[a1]).toBe(3.5);
    });

    it('no guarda nada si una fila tiene error, y dice cuál', async () => {
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      const hoja = libro.getWorksheet('Planilla')!;
      hoja.getCell(5, 3).value = 4;
      hoja.getCell(6, 3).value = 'excelente';
      hoja.getCell(7, 1).value = '9999999';
      hoja.getCell(7, 3).value = 3;

      const resultado = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(resultado.estado).toBe(400);
      expect(resultado.cuerpo.details).toEqual([
        { fila: 6, documento: expect.any(String), motivo: expect.stringMatching(/no es una nota numérica/) },
        { fila: 7, documento: '9999999', motivo: expect.stringMatching(/no corresponde a un estudiante/) },
      ]);
      expect(await ActivitySubmission.countDocuments()).toBe(0);
    });

    it('una nota fuera de la escala se rechaza aunque el archivo sea válido (la validación real es del servidor)', async () => {
      const { buffer } = await descargarExcel(e.docenteDeClase);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(buffer as unknown as ArrayBuffer);
      libro.getWorksheet('Planilla')!.getCell(5, 3).value = 9;
      const resultado = await subirExcel(e.docenteDeClase, Buffer.from(await libro.xlsx.writeBuffer()));
      expect(resultado.estado).toBe(400);
      expect(resultado.cuerpo.message).toMatch(/fuera de la escala/);
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
      expect(hoja.getCell(5, 3).protection?.locked ?? true).toBe(true);
      expect(hoja.getCell(5, 9).value).toBe('CERRADO');
    });
  });
});
