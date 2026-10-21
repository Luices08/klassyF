import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AjusteAsignatura from '../../src/models/ajusteAsignatura.model';
import Campus from '../../src/models/campus.model';
import DocumentoPiar from '../../src/models/documentoPiar.model';
import ExpedienteInclusion from '../../src/models/expedienteInclusion.model';
import Subject from '../../src/models/subject.model';
import Area from '../../src/models/area.model';
import Institution from '../../src/models/institution.model';
import { UserDocument } from '../../src/models/user.model';
import { reporteBalanceInclusion } from '../../src/services/balanceInclusion.service';
import { generarExcelTabular } from '../../src/services/reporteTabularExcel.service';
import { generarPdfTabular } from '../../src/services/reporteTabularPdf.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario, crearUsuario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

// Balance anual de inclusión: confidencial, se calcula al descargar y nunca muestra diagnósticos.
describe('Balance anual de inclusión', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let orientador: UserDocument;
  let sedeId: unknown;

  const filtros = () => ({ academic_year_id: n.anioId });
  async function abrir(estudiante: UserDocument, tipo: 'PIAR' | 'PLAN_APOYO', extra: Record<string, unknown> = {}) {
    return ExpedienteInclusion.create({
      student_id: estudiante._id,
      academic_year_id: n.anioId,
      sede_id: sedeId,
      tipo,
      estado: 'ACTIVO',
      // Una categoría real, para comprobar que el balance no la deja salir.
      categoria_discapacidad: 'TEA',
      creado_por: e.admin._id,
      consentimiento: { otorgado: true, otorgado_por_nombre: 'Marta Gómez', parentesco: 'MADRE', fecha: new Date() },
      ...extra,
    });
  }
  const seguimiento = (periodo: number) => ({ periodo_numero: periodo, fecha: new Date(), efectividad: 'MUY_EFECTIVO', observacion: 'Avanza', nueva_accion: '', por: e.admin._id });

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    const sede = await Campus.findOne({ es_principal: true });
    sedeId = sede!._id;
    orientador = await crearUsuario('ORIENTADOR', { sedes_ids: [sede!._id] });
    e.coordAcademico.sedes_ids = [sede!._id];
    await e.coordAcademico.save();
  }, 120_000);

  it('lista cada expediente con su estado, autorización, seguimientos e informe anual, sin diagnósticos', async () => {
    const piar = await abrir(e.estudiante, 'PIAR');
    await abrir(e.otroEstudiante, 'PLAN_APOYO', { estado: 'EN_CONSTRUCCION' });
    const institucion = (await Institution.findOne())!;
    const area = await Area.create({ institucion_id: institucion._id, nombre: 'Matemáticas', descripcion: 'x', codigo: 'BAL' });
    const materia = await Subject.create({ area_id: area._id, nombre: 'Matemáticas', abreviatura: 'BAL', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
    // Un ajuste con seguimientos en tres periodos distintos cumple el mínimo (3); el que tiene dos, no.
    await AjusteAsignatura.create({ expediente_id: piar._id, subject_id: materia._id, seguimientos: [seguimiento(1), seguimiento(2), seguimiento(3)] });
    await AjusteAsignatura.create({ expediente_id: piar._id, subject_id: n.materiaId, seguimientos: [seguimiento(1), seguimiento(1), seguimiento(2)] });
    await DocumentoPiar.create({ expediente_id: piar._id, student_id: e.estudiante._id, academic_year_id: n.anioId, clave: 'INFORME_ANUAL', version: 1, consecutivo: 1, codigo: 'IAP-1', snapshot: {}, hash: 'x', estado: 'EMITIDO', emitido_por: e.admin._id, fecha_emision: new Date() });

    const r = await reporteBalanceInclusion(filtros(), orientador);
    expect(r.filas).toHaveLength(2);
    const a = r.filas.find((f) => f.documento === e.estudiante.numero_documento)!;
    expect(a).toMatchObject({ modalidad: 'PIAR', estado: 'Activo', consentimiento: 'Vigente', seguimientos: '1 de 2', informe: 'Emitido' });
    const b = r.filas.find((f) => f.documento === e.otroEstudiante.numero_documento)!;
    expect(b).toMatchObject({ modalidad: 'Plan de apoyo', estado: 'En construcción', seguimientos: 'No aplica', informe: 'No aplica' });
    expect(JSON.stringify(r)).not.toMatch(/\bTEA\b|espectro autista/i);
    expect(r.resumen).toContainEqual(['PIAR', 1]);
    expect(r.leyenda).toMatch(/CONFIDENCIAL/);
    expect((await generarPdfTabular(r)).buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect((await generarExcelTabular(r)).nombreArchivo).toMatch(/^balance-inclusion-.*\.xlsx$/);
  });

  it('coordinación supervisa pero no ve la modalidad de nadie', async () => {
    await abrir(e.estudiante, 'PIAR');
    const r = await reporteBalanceInclusion(filtros(), e.coordAcademico);
    expect(r.filas).toHaveLength(1);
    expect(r.columnas.map((c) => c.clave)).not.toContain('modalidad');
    expect(JSON.stringify(r.filas)).not.toMatch(/PIAR|Plan de apoyo/);
    expect(r.resumen.map(([etiqueta]) => etiqueta)).not.toContain('PIAR');
  });

  it('secretaría, docentes y convivencia no entran; orientación y coordinación solo ven sus sedes', async () => {
    await abrir(e.estudiante, 'PIAR');
    await expect(reporteBalanceInclusion(filtros(), e.secretaria)).rejects.toMatchObject({ statusCode: 403 });
    await expect(reporteBalanceInclusion(filtros(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    const otraSede = await crearUsuario('ORIENTADOR', { sedes_ids: [(await Campus.create({ institucion_id: (await Institution.findOne())!._id, nombre: 'Otra sede', codigo_dane_sede: '999999999999', direccion: 'x', telefono: '1', es_principal: false }))._id] });
    await expect(reporteBalanceInclusion(filtros(), otraSede)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reporteBalanceInclusion(filtros(), e.admin)).resolves.toBeTruthy();
  });

  it('sin expedientes, lo dice', async () => {
    const r = await reporteBalanceInclusion(filtros(), e.admin);
    expect(r.filas).toHaveLength(0);
    expect(r.mensaje_vacio).toMatch(/No hay expedientes/);
  });
});

