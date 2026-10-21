import type { AddressInfo } from 'net';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { vaciarCacheCorta } from '../../src/utils/cacheCorta';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// Reporte tipo C-600 y consolidado (M30) contra la capa HTTP real: cifras, una sola hoja, permisos y auditoría.
describe('M30: reporte tipo C-600 y consolidado institucional (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let base: string;
  let cerrar: () => Promise<void>;
  const anio = new Date().getUTCFullYear();
  const inicioDelAnio = new Date(Date.UTC(anio, 0, 1));

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
    vaciarCacheCorta();
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    // El periodo 1 empieza 100 días antes de hoy (`prepararNotas`): el estudiante ya estaba matriculado al empezar; los otros dos entraron después o se retiraron.
    const inicioPeriodo1 = new Date(Date.now() - 100 * 86_400_000);
    await StudentProfile.create({ user_id: e.estudiante._id, fecha_nacimiento: new Date(Date.UTC(anio - 12, 2, 10)), genero: 'M' });
    await StudentProfile.create({ user_id: e.otroEstudiante._id, fecha_nacimiento: new Date(Date.UTC(anio - 13, 5, 1)), genero: 'F' });
    await StudentProfile.create({ user_id: e.tercerEstudiante._id, fecha_nacimiento: new Date(Date.UTC(anio - 11, 8, 20)), genero: 'OTRO' });
    await Enrollment.updateOne({ student_id: e.estudiante._id }, { fecha_matricula: new Date(inicioPeriodo1.getTime() - 5 * 86_400_000) });
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { fecha_matricula: new Date(inicioPeriodo1.getTime() - 5 * 86_400_000), estado: 'RETIRADO' });
    void inicioDelAnio;
  }, 120_000);

  const consulta = (extra = '') => `academic_year_id=${n.anioId}${extra}`;
  const pedir = async (ruta: string, usuario: UserDocument | null, extra = '') =>
    fetch(`${base}/reportes/${ruta}?${consulta(extra)}`, { headers: usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {} });
  const vista = async (usuario: UserDocument, extra = '') => {
    const r = await pedir('c600', usuario, extra);
    return { estado: r.status, cuerpo: (await r.json()) as { data?: any; message?: string } };
  };

  it('quién lo ve y quién lo baja', async () => {
    expect((await pedir('c600', null)).status).toBe(401);
    for (const permitido of [e.admin, e.coordAcademico]) expect((await pedir('c600', permitido)).status, permitido.rol).toBe(200);
    for (const no of [e.docenteDeClase, e.estudiante, e.orientador, e.coordConvivencia]) expect((await pedir('c600', no)).status, no.rol).toBe(403);

    // Bajarlo: administración y secretaría (esta, solo de sus sedes); coordinación solo lo ve.
    expect((await pedir('c600/excel', e.coordAcademico)).status).toBe(403);
    expect((await pedir('c600/pdf', e.coordAcademico)).status).toBe(403);
    expect((await pedir('c600/excel', e.admin)).status).toBe(200);
    expect((await pedir('c600/excel', e.secretaria)).status).toBe(404);
    e.secretaria.sedes_ids = [(await Campus.findOne({ es_principal: true }))!._id];
    await e.secretaria.save();
    expect((await pedir('c600/excel', e.secretaria)).status).toBe(200);
    expect((await vista(e.secretaria)).estado).toBe(200);
  }, 120_000);

  it('el balance cuadra y los retirados son los desertores', async () => {
    const { cuerpo } = await vista(e.admin);
    const d = cuerpo.data;
    expect(d.estado_datos).toBe('PRELIMINAR');
    expect(d.institucion).toMatchObject({ nombre: 'Colegio de prueba', codigo_dane: '123456789012' });
    expect(d.sede).toMatchObject({ nombre: 'Principal', codigo_dane: '123456789001' });
    expect(d.balance.filas).toHaveLength(1);
    expect(d.balance.filas[0]).toMatchObject({ grado: 'Sexto', matricula_inicial: 2, ingresados: 1, retirados: 1, matricula_final: 2 });
    expect(d.balance.total).toEqual({ matricula_inicial: 2, ingresados: 1, retirados: 1, matricula_final: 2 });
  });

  it('resultados por sexo: sin cierre quedan sin resultado final, y el retirado de sexo «otro» abre esa columna', async () => {
    const d = (await vista(e.admin)).cuerpo.data;
    const fila = d.resultados.filas[0];
    expect(fila.sin_resultado).toBe(2);
    expect(fila.promovidos.total).toBe(0);
    expect(fila.desertores).toEqual({ H: 0, M: 0, O: 1, total: 1 });
    expect(d.hay_otro_sin_dato).toBe(true);
  });

  it('edades a la fecha de corte: por defecto el inicio del periodo 1, y se puede elegir otra', async () => {
    const d = (await vista(e.admin)).cuerpo.data;
    const porClave = Object.fromEntries(d.edades.filas.map((f: { clave: string; total: { total: number } }) => [f.clave, f.total.total]));
    const sexto = d.grados[0].grado_id;
    // El corte por defecto es hace 100 días: la edad exacta depende de la fecha de hoy, pero entre los dos activos suman 2 y ninguno es de 4 años.
    expect(Object.values(porClave).reduce((s: number, v) => s + (v as number), 0)).toBe(2);
    expect(d.edades.total_por_grado[sexto].total).toBe(2);
    expect(d.fecha_corte_edad).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const fijo = (await vista(e.admin, `&fecha_corte=${anio}-12-31`)).cuerpo.data;
    expect(fijo.fecha_corte_edad).toBe(`${anio}-12-31`);
    // A 31 de diciembre el de 12 años (nacido el 10 de marzo hace 12 años) ya cumplió 12 y la de 13 (1 de junio) ya cumplió 13.
    const edades = Object.fromEntries(fijo.edades.filas.map((f: { clave: string; total: { total: number } }) => [f.clave, f.total.total]));
    expect(edades['12']).toBe(1);
    expect(edades['13']).toBe(1);
  });

  it('rechaza una fecha de corte mal escrita y un alcance sin grupos', async () => {
    expect((await vista(e.admin, '&fecha_corte=01/02/2026')).estado).toBe(400);
    const rural = await Campus.findOne({ es_principal: { $ne: true } });
    expect((await vista(e.admin, `&sede_id=${rural!._id}`)).estado).toBe(404);
  });

  it('el Excel es una sola hoja con las cuatro secciones y las líneas para lo que el sistema no guarda', async () => {
    const respuesta = await pedir('c600/excel', e.admin);
    expect(respuesta.headers.get('content-type')).toContain('spreadsheetml');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await respuesta.arrayBuffer()) as unknown as ArrayBuffer);
    expect(libro.worksheets).toHaveLength(1);
    const hoja = libro.worksheets[0]!;
    const textos: string[] = [];
    hoja.eachRow((fila) => fila.eachCell((c) => typeof c.value === 'string' && textos.push(c.value)));
    const todo = textos.join('\n');
    expect(textos[0]).toContain('REPORTE ESTADÍSTICO DE EFICIENCIA INTERNA (DANE C-600)');
    for (const seccion of ['BALANCE GENERAL DE MATRÍCULA', 'RESULTADOS ACADÉMICOS Y EFICIENCIA INTERNA', 'DISTRIBUCIÓN POR EDAD Y GRADO', 'DECLARACIÓN Y FIRMAS']) expect(todo).toContain(seccion);
    expect(todo).toContain('Sector (oficial / no oficial): ________________');
    expect(todo).toContain('Sexto');
  });

  it('el PDF es un PDF y bajar cualquiera de los dos queda en la auditoría; verlo en pantalla no', async () => {
    const antes = await AuditLog.countDocuments({ accion: 'REPORTE_CIERRE_GENERADO' });
    await vista(e.admin);
    expect(await AuditLog.countDocuments({ accion: 'REPORTE_CIERRE_GENERADO' })).toBe(antes);

    const pdf = Buffer.from(await (await pedir('c600/pdf', e.admin)).arrayBuffer());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    await pedir('c600/excel', e.admin);
    expect(await AuditLog.countDocuments({ accion: 'REPORTE_CIERRE_GENERADO' })).toBe(antes + 2);
  }, 60_000);

  describe('consolidado general', () => {
    it('solo administración y coordinación lo bajan', async () => {
      expect((await pedir('consolidado/excel', e.secretaria)).status).toBe(403);
      expect((await pedir('consolidado/excel', e.docenteDeClase)).status).toBe(403);
      expect((await pedir('consolidado/excel', e.admin)).status).toBe(200);
      expect((await pedir('consolidado/pdf', e.coordAcademico)).status).toBe(200);
    }, 60_000);

    it('trae los indicadores y una fila por grado, con su total', async () => {
      const respuesta = await pedir('consolidado/excel', e.admin);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load((await respuesta.arrayBuffer()) as unknown as ArrayBuffer);
      const textos: string[] = [];
      libro.worksheets[0]!.eachRow((fila) => fila.eachCell((c) => typeof c.value === 'string' && textos.push(c.value)));
      expect(textos.some((t) => t.includes('Consolidado general de la institución'))).toBe(true);
      expect(textos).toContain('Sexto');
      expect(textos).toContain('Total');
      expect(textos.some((t) => t.startsWith('2 de 40 cupos'))).toBe(true);
    }, 60_000);
  });
});
