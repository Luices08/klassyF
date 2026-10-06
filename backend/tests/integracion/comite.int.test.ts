import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import { MiembroComite, SesionComite } from '../../src/dominios/bienestar/comite/comiteConvivencia.model';
import { User } from '../../src/models/user.model';
import { generarPdfActa } from '../../src/dominios/bienestar/comite/actaComitePdf.service';
import * as casos from '../../src/dominios/bienestar/convivencia/caso.service';
import * as comite from '../../src/dominios/bienestar/comite/comite.service';
import * as catalogo from '../../src/dominios/bienestar/comun/convivenciaCatalogo.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

describe('M15 comité y actas (con base de datos)', () => {
  let e: Escenario;
  let miembros: string[];
  let casoId: string;
  let casoCodigo: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await SesionComite.syncIndexes();
    await MiembroComite.syncIndexes();
    e = await armarEscenario();

    // Cinco miembros: dos son usuarios del sistema (el rector y el coordinador de convivencia) y tres, designaciones externas.
    const cargos = [
      { cargo: 'Rector', usuario_id: String(e.admin._id), es_presidente: true },
      { cargo: 'Coordinador de convivencia', usuario_id: String(e.coordConvivencia._id) },
      { cargo: 'Personero estudiantil', nombre: 'Laura Personera' },
      { cargo: 'Representante de padres', nombre: 'Pedro Padre' },
      { cargo: 'Docente', nombre: 'Marta Docente' },
    ];
    miembros = [];
    for (const c of cargos) miembros.push(String((await comite.crearMiembro(c, e.admin))._id));

    const caso = (await casos.abrirCaso(
      { tipo_situacion: 'II', fecha_hecho: hoy(), hechos: 'Discusión en el patio durante el descanso.', involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] },
      e.coordConvivencia
    )) as { _id: string; codigo: string };
    casoId = caso._id;
    casoCodigo = caso.codigo;
  }, 60_000);

  const crear = () => comite.crearSesion({ tipo: 'ORDINARIA', fecha: hoy(), hora: '08:30', lugar: 'Sala de juntas', orden_del_dia: '1. Casos del periodo.' }, e.coordConvivencia);
  const asistencia = (quienes: number[]) => miembros.map((m, i) => ({ miembro_id: m, asistio: quienes.includes(i) }));

  it('los miembros usan el nombre de su cuenta, hay un solo presidente y un usuario no se repite', async () => {
    const rector = await MiembroComite.findById(miembros[0]);
    expect(rector).toMatchObject({ nombre: `${e.admin.nombre} ${e.admin.apellido}`, es_presidente: true });

    const nuevo = await comite.crearMiembro({ cargo: 'Vicerrector', nombre: 'Vicente Vicerrector', es_presidente: true }, e.coordConvivencia);
    expect(await MiembroComite.countDocuments({ es_presidente: true })).toBe(1);
    expect(nuevo.es_presidente).toBe(true);
    await expect(comite.crearMiembro({ cargo: 'Otro', usuario_id: String(e.admin._id) }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(comite.crearMiembro({ cargo: 'Otro', nombre: 'X' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('una sesión toma a los miembros activos como asistentes y calcula el quórum al marcar la asistencia', async () => {
    const sesion = await crear();
    expect(sesion.asistentes).toHaveLength(5);
    expect(sesion.quorum).toMatchObject({ total_miembros: 5, presentes: 0, alcanzado: false });

    const actualizada = await comite.actualizarSesion(String(sesion._id), { asistencia: asistencia([0, 1, 2]) }, e.coordConvivencia);
    expect(actualizada.quorum).toMatchObject({ presentes: 3, alcanzado: true });
    await expect(comite.actualizarSesion(String(sesion._id), { asistencia: [{ miembro_id: String(new Types.ObjectId()), asistio: true }] }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('solo el ADMIN firma, con quórum y desarrollo; el consecutivo nace al firmar', async () => {
    const sesion = await crear();
    const id = String(sesion._id);
    await comite.actualizarSesion(id, { asistencia: asistencia([0, 1]), desarrollo: 'Se revisaron los casos.' }, e.coordConvivencia);

    await expect(comite.firmarSesion(id, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    await expect(comite.firmarSesion(id, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('quórum') });

    await comite.actualizarSesion(id, { asistencia: asistencia([0, 1, 2]), desarrollo: '' }, e.coordConvivencia);
    await expect(comite.firmarSesion(id, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('desarrollo') });

    await comite.actualizarSesion(id, { desarrollo: 'Se revisaron los casos.' }, e.coordConvivencia);
    const firmada = await comite.firmarSesion(id, e.admin);
    expect(firmada).toMatchObject({ estado: 'FIRMADA', codigo: expect.stringMatching(/^AC-\d{4}-001$/) });
    expect(firmada.firma?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un acta firmada es inmutable: no se edita ni se anula, solo admite anexos', async () => {
    const sesion = await crear();
    const id = String(sesion._id);
    await comite.actualizarSesion(id, { asistencia: asistencia([0, 1, 2]), desarrollo: 'Se revisaron los casos.' }, e.coordConvivencia);
    await comite.firmarSesion(id, e.admin);

    await expect(comite.actualizarSesion(id, { desarrollo: 'Cambio posterior.' }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await expect(comite.anularSesion(id, 'Quiero anularla.', e.admin)).rejects.toMatchObject({ statusCode: 409 });
    const conAnexo = await comite.agregarAnexo(id, 'Se corrige la hora de inicio.', e.coordConvivencia);
    expect(conAnexo.anexos).toHaveLength(1);
    const borrador = await crear();
    await expect(comite.agregarAnexo(String(borrador._id), 'No debe poder.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });

    // La protección vive en el modelo: ni siquiera guardando el documento directamente se puede alterar.
    const doc = await SesionComite.findById(id);
    doc!.desarrollo = 'Alterado por otra ruta.';
    await expect(doc!.save()).rejects.toThrow(/inmutable|no se puede modificar/i);
  });

  it('la huella detecta una alteración hecha directamente en la base', async () => {
    const sesion = await crear();
    const id = String(sesion._id);
    await comite.actualizarSesion(id, { asistencia: asistencia([0, 1, 2]), desarrollo: 'Se revisaron los casos.' }, e.coordConvivencia);
    await comite.firmarSesion(id, e.admin);
    expect(await comite.verificarIntegridad(id, e.admin)).toMatchObject({ integra: true });

    await SesionComite.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { desarrollo: 'Texto adulterado.' } });
    expect(await comite.verificarIntegridad(id, e.admin)).toMatchObject({ integra: false });
  });

  it('los consecutivos de actas no tienen huecos y un borrador anulado no consume uno', async () => {
    const borrador = await crear();
    await comite.anularSesion(String(borrador._id), 'Se creó por error.', e.coordConvivencia);

    const firmar = async () => {
      const s = await crear();
      await comite.actualizarSesion(String(s._id), { asistencia: asistencia([0, 1, 2]), desarrollo: 'Desarrollo de la sesión.' }, e.coordConvivencia);
      return comite.firmarSesion(String(s._id), e.admin);
    };
    expect((await firmar()).codigo).toMatch(/-001$/);
    expect((await firmar()).codigo).toMatch(/-002$/);
  });

  it('un recusado no cuenta para deliberar el caso aunque asista, y quien se declaró impedido queda recusado solo', async () => {
    const sesion = await crear();
    const id = String(sesion._id);
    // Asisten 3 de 5: hay quórum. Si se recusa a uno de ellos, quedan 2 de 4 deliberantes: no hay quórum para ese caso.
    await comite.actualizarSesion(id, { asistencia: asistencia([0, 2, 3]), desarrollo: 'Se trató el caso.', casos_tratados: [{ caso_id: casoId, decisiones: 'Se cita a los acudientes.' }] }, e.coordConvivencia);
    await comite.firmarSesion(id, e.admin).then((s) => expect(s.estado).toBe('FIRMADA'));

    const otra = await crear();
    const otraId = String(otra._id);
    await comite.actualizarSesion(otraId, { asistencia: asistencia([0, 2, 3]), desarrollo: 'Se trató el caso.', casos_tratados: [{ caso_id: casoId, decisiones: 'Decisión.', recusados_ids: [miembros[2]!] }] }, e.coordConvivencia);
    await expect(comite.firmarSesion(otraId, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining(casoCodigo) });

    // El coordinador de convivencia se declara impedido en el caso: queda recusado de la deliberación sin que nadie lo marque.
    await casos.declararImpedimento(casoId, { motivo: 'Es familiar de un involucrado.' }, e.coordConvivencia);
    const tercera = await crear();
    const actualizada = await comite.actualizarSesion(String(tercera._id), { asistencia: asistencia([0, 1, 2]), casos_tratados: [{ caso_id: casoId }] }, e.admin);
    expect(actualizada.casos_tratados[0]!.recusados_ids.map(String)).toContain(miembros[1]);
  });

  it('solo se tratan casos a los que el usuario tiene acceso', async () => {
    const sesion = await crear();
    await expect(comite.actualizarSesion(String(sesion._id), { casos_tratados: [{ caso_id: casoId }] }, e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el PDF del acta se genera con sesión y queda auditado; un borrador sale marcado', async () => {
    const sesion = await crear();
    const id = String(sesion._id);
    await comite.actualizarSesion(id, { asistencia: asistencia([0, 1, 2]), desarrollo: 'Se revisaron los casos.', casos_tratados: [{ caso_id: casoId, decisiones: 'Seguimiento.' }] }, e.coordConvivencia);

    const borrador = await generarPdfActa(id, e.coordConvivencia);
    expect(borrador.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(borrador.nombreArchivo).toBe('borrador-acta.pdf');

    await comite.firmarSesion(id, e.admin);
    expect((await generarPdfActa(id, e.admin)).nombreArchivo).toMatch(/^AC-\d{4}-001\.pdf$/);
    await expect(generarPdfActa(id, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    expect(await AuditLog.countDocuments({ accion: 'ACTA_COMITE_PDF_GENERADO' })).toBe(2);
  });

  it('un miembro que figura en un acta no se elimina, se desactiva; y sin miembros no hay sesión', async () => {
    const sesion = await crear();
    await expect(comite.eliminarMiembro(miembros[2]!, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await comite.anularSesion(String(sesion._id), 'Prueba.', e.admin);
    await MiembroComite.deleteMany({});
    await expect(crear()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('las alertas listan los casos con tipo III sin remisión o seguimiento vencido', async () => {
    expect(await casos.casosConAlertas(e.coordConvivencia)).toEqual([]);
    const tipoIII = (await casos.abrirCaso(
      { tipo_situacion: 'III', fecha_hecho: hoy(), hechos: 'Hechos graves en el colegio.', involucrados: [{ student_id: String(e.otroEstudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] },
      e.coordConvivencia
    )) as { _id: string; codigo: string };
    const antiguo = new Date(Date.now() - 72 * 3_600_000);
    const { CasoConvivencia } = await import('../../src/dominios/bienestar/convivencia/casoConvivencia.model');
    await CasoConvivencia.collection.updateOne({ _id: new Types.ObjectId(tipoIII._id) }, { $set: { createdAt: antiguo } });

    const alertas = await casos.casosConAlertas(e.coordConvivencia);
    expect(alertas.map((a) => a.codigo)).toEqual([tipoIII.codigo]);
    expect(alertas[0]!.alertas[0]!.codigo).toBe('REMISION_TIPO_III_PENDIENTE');
    expect(await casos.casosConAlertas(e.coordConvivenciaOtraSede)).toEqual([]);
    await expect(casos.casosConAlertas(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await catalogo.actualizarConfiguracion({ plazo_remision_tipo_iii_horas: 200 }, actor(e.admin), 'ADMIN');
    expect(await casos.casosConAlertas(e.coordConvivencia)).toEqual([]);
  });

  it('un usuario inactivo o inexistente no puede ser miembro', async () => {
    await User.updateOne({ _id: e.docenteAjeno._id }, { estado: 'inactivo' });
    await expect(comite.crearMiembro({ cargo: 'Docente', usuario_id: String(e.docenteAjeno._id) }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });
});
