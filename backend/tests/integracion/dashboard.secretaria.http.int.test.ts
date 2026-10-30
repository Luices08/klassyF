import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import User, { UserDocument } from '../../src/models/user.model';
import { generateToken } from '../../src/services/token.service';
import { vaciarCacheCorta } from '../../src/utils/cacheCorta';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// Panel de secretaría (M30) contra la capa HTTP real: solo secretaría entra, cada una ve únicamente sus sedes y solo salen conteos.
describe('M30: panel de secretaría (capa HTTP)', () => {
  let e: Escenario;
  let anioId: string;
  let sedePrincipal: string;
  let sedeRural: string;
  let base: string;
  let cerrar: () => Promise<void>;

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
    anioId = String((await AcademicYear.findOne())!._id);
    sedePrincipal = String((await Campus.findOne({ es_principal: true }))!._id);
    sedeRural = String((await Campus.findOne({ es_principal: { $ne: true } }))!._id);
  }, 120_000);

  const pedir = async (usuario: UserDocument, query = '') => {
    const respuesta = await fetch(`${base}/dashboard/secretaria?academic_year_id=${anioId}${query}`, { headers: { Authorization: `Bearer ${generateToken(usuario)}` } });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { data?: any; message?: string } };
  };
  const conSedes = async (sedes: string[]) => (await User.findByIdAndUpdate(e.secretaria._id, { sedes_ids: sedes }, { new: true }))!;

  it('solo entra secretaría: rectoría tiene su panel y los demás roles no', async () => {
    expect((await pedir(e.secretaria)).estado).toBe(200);
    for (const otro of [e.admin, e.coordAcademico, e.coordConvivencia, e.orientador, e.docenteDeClase, e.estudiante]) expect((await pedir(otro)).estado).toBe(403);
  });

  it('sin sedes asignadas no ve nada', async () => {
    const { estado, cuerpo } = await pedir(e.secretaria);
    expect(estado).toBe(200);
    expect(cuerpo.data.matricula).toMatchObject({ matriculados: 0, capacidad: 0 });
  });

  it('cuenta las matrículas de sus sedes y una sede ajena no se abre pidiéndola', async () => {
    const secretaria = await conSedes([sedePrincipal]);
    const propio = (await pedir(secretaria)).cuerpo.data;
    expect(propio.matricula).toMatchObject({ matriculados: 3, capacidad: 40, disponibles: 37 });
    expect(propio.matricula.por_estado.MATRICULADO_DEFINITIVO).toBe(3);

    expect((await pedir(secretaria, `&sede_id=${sedeRural}`)).cuerpo.data.matricula.matriculados).toBe(0);
    vaciarCacheCorta(); // el alcance de una secretaria se cachea unos segundos, como todo el panel
    expect((await pedir(await conSedes([sedeRural]))).cuerpo.data.matricula.matriculados).toBe(0);
  });

  it('cuenta los documentos por revisar y las condicionales con plazo vencido', async () => {
    const secretaria = await conSedes([sedePrincipal]);
    const matricula = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    await Enrollment.collection.updateOne(
      { _id: matricula._id },
      { $set: { estado: 'MATRICULADO_CONDICIONAL', fecha_limite_compromiso: new Date('2020-01-01T00:00:00Z'), checklist: [{ tipo_documento: 'DOCUMENTO_IDENTIDAD', estado: 'CARGADO' }, { tipo_documento: 'FOTO', estado: 'APROBADO' }] } }
    );
    const { documentos, matricula: resumen } = (await pedir(secretaria)).cuerpo.data;
    expect(documentos.por_revisar).toBe(1);
    expect(documentos.condicionales).toEqual({ total: 1, plazo_vencido: 1 });
    expect(resumen.matriculados).toBe(3);
  });

  it('solo trae conteos: nada de nombres ni documentos de identidad', async () => {
    const texto = JSON.stringify((await pedir(await conSedes([sedePrincipal]))).cuerpo.data);
    for (const persona of [e.estudiante, e.otroEstudiante]) {
      expect(texto).not.toContain(persona.numero_documento);
      expect(texto).not.toContain(persona.nombre);
    }
  });
});
