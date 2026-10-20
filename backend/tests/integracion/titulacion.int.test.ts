import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import PazYSalvo from '../../src/models/pazYSalvo.model';
import { RegistroServicioSocial } from '../../src/models/registrosTitulacion.model';
import Titulacion from '../../src/models/titulacion.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { actualizarAjustes } from '../../src/services/institution.service';
import { revisarPazYSalvo } from '../../src/services/pazYSalvo.service';
import { actualizarPolitica, datosDePolitica, obtenerPolitica } from '../../src/services/politicaPromocion.service';
import * as titulacion from '../../src/services/titulacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M26/M19: titulación de bachiller — del cierre de 11° a GRADUADO_EXTEMPORANEO por ventanilla.
/** Registra una tanda de horas con su soporte y la verifica, como lo haría Secretaría: solo así suman. */
async function registrarHorasVerificadas(studentId: string, horas: number, entidad: string, usuario: Parameters<typeof titulacion.registrarServicioSocial>[2]) {
  const registro = await titulacion.registrarServicioSocial(
    { student_id: studentId, horas, entidad },
    { nombre: 'certificado.pdf', archivo_path: 'uploads/servicio-social/prueba.pdf', mimetype: 'application/pdf', tamano: 1024 },
    usuario
  );
  await titulacion.verificarServicioSocial(String(registro._id), 'VERIFICAR', '', usuario);
  return registro;
}

describe('titulación de bachiller', () => {
  let e: Escenario;
  let n: EscenarioNotas;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    // El grupo del escenario pasa a ser un 11°; la carpeta pide solo el certificado de 10° para no armar diez grados.
    await Grade.updateMany({}, { numero: 11, nombre: 'Once' });
    for (const periodo of [1, 2, 3, 4]) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: e.estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: 4 },
      });
    }
    await Enrollment.updateMany({ student_id: { $ne: e.estudiante._id } }, { estado: 'RETIRADO' });
    const politica = datosDePolitica(await obtenerPolitica(n.anioId));
    politica.titulacion.carpeta_academica.desde_grado = 10;
    await actualizarPolitica(n.anioId, politica, e.admin);
  });

  const cerrar = () => cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
  const titulacionDe = () => Titulacion.findOne({ student_id: e.estudiante._id });

  it('aprueba 11° pero con requisitos pendientes: aprobó no graduado, con las razones', async () => {
    await cerrar();
    const t = (await titulacionDe())!;
    expect(t.estado).toBe('APROBO_NO_GRADUADO');
    // La carpeta académica nace apagada: solo bloquean servicio social, Saber 11 y paz y salvo.
    expect(t.pendientes.map((p) => p.requisito).sort()).toEqual(['PAZ_Y_SALVO', 'SABER_11', 'SERVICIO_SOCIAL']);
    expect(t.pendientes.find((p) => p.requisito === 'SERVICIO_SOCIAL')!.detalle).toMatch(/Debe 80 horas/);
    expect(t.titulo).toBe('Bachiller Académico');
  });

  it('el título sale del grupo si lo tiene y, si no, de la institución', async () => {
    await actualizarAjustes({ titulo_bachiller_defecto: 'Bachiller Técnico en Sistemas' }, { usuarioId: e.admin._id });
    await cerrar();
    expect((await titulacionDe())!.titulo).toBe('Bachiller Técnico en Sistemas');

    await Group.updateOne({ _id: n.grupoId }, { titulo_bachiller: 'Bachiller Académico' });
    await titulacion.reevaluarTitulacion(String(e.estudiante._id), n.anioId, e.admin);
    expect((await titulacionDe())!.titulo).toBe('Bachiller Académico');
    expect((await Institution.findOne())!.titulo_bachiller_defecto).toBe('Bachiller Técnico en Sistemas');
  });

  it('al completar el último requisito pasa solo a graduado extemporáneo, con historial', async () => {
    await cerrar();
    const usuario = e.admin;
    await registrarHorasVerificadas(String(e.estudiante._id), 40, 'Hogar Geriátrico', usuario);
    expect((await titulacionDe())!.estado).toBe('APROBO_NO_GRADUADO');
    expect((await titulacionDe())!.pendientes.find((p) => p.requisito === 'SERVICIO_SOCIAL')!.detalle).toMatch(/Debe 40 horas/);

    await registrarHorasVerificadas(String(e.estudiante._id), 40, 'Biblioteca municipal', usuario);
    await titulacion.registrarSaber11(String(e.estudiante._id), 'AC202612345678', null, usuario);
    expect((await titulacionDe())!.estado).toBe('APROBO_NO_GRADUADO');

    // El paz y salvo de M04 es lo último: confirmarlo reevalúa solo.
    await PazYSalvo.create({ student_id: e.estudiante._id, academic_year_id: n.anioId, estado: 'CARGADO' });
    await revisarPazYSalvo({ id: String(e.admin._id), rol: e.admin.rol }, String(e.estudiante._id), n.anioId, { estado: 'CONFIRMADO' });
    const t = (await titulacionDe())!;
    expect(t.estado).toBe('GRADUADO_EXTEMPORANEO');
    expect(t.pendientes).toHaveLength(0);
    expect(t.historial.map((h) => h.estado)).toEqual(['APROBO_NO_GRADUADO', 'GRADUADO_EXTEMPORANEO']);
  });

  it('quien no aprobó 11° no queda en titulación', async () => {
    await CalificacionAsignatura.updateMany({ student_id: e.estudiante._id }, { 'resultado.nota_asignatura': 2 });
    await cerrar();
    expect(await Titulacion.countDocuments()).toBe(0);
  });

  it('las horas anuladas no suman, y la secretaría de otra sede no ve al estudiante', async () => {
    const registro = await registrarHorasVerificadas(String(e.estudiante._id), 80, 'Fundación', e.admin);
    await titulacion.anularServicioSocial(String(registro._id), 'Registro duplicado por error', e.admin);
    expect((await titulacion.requisitosDeEstudiante(String(e.estudiante._id), e.admin)).horas_servicio_social).toBe(0);
    await expect(titulacion.requisitosDeEstudiante(String(e.estudiante._id), e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('las horas sin verificar o rechazadas no suman; las anteriores al soporte (heredadas) sí', async () => {
    const id = String(e.estudiante._id);
    const soporte = { nombre: 'certificado.pdf', archivo_path: 'uploads/servicio-social/prueba.pdf', mimetype: 'application/pdf', tamano: 1024 };
    const pendiente = await titulacion.registrarServicioSocial({ student_id: id, horas: 30, entidad: 'Fundación A' }, soporte, e.admin);
    let r = await titulacion.requisitosDeEstudiante(id, e.admin);
    expect([r.horas_servicio_social, r.horas_por_verificar]).toEqual([0, 30]);

    await titulacion.verificarServicioSocial(String(pendiente._id), 'RECHAZAR', 'Certificado ilegible', e.admin);
    r = await titulacion.requisitosDeEstudiante(id, e.admin);
    expect([r.horas_servicio_social, r.horas_por_verificar]).toEqual([0, 0]);
    // Un registro ya resuelto no se vuelve a verificar, y un rechazo exige explicación.
    await expect(titulacion.verificarServicioSocial(String(pendiente._id), 'VERIFICAR', '', e.admin)).rejects.toMatchObject({ statusCode: 409 });
    const otra = await titulacion.registrarServicioSocial({ student_id: id, horas: 10, entidad: 'Fundación B' }, soporte, e.admin);
    await expect(titulacion.verificarServicioSocial(String(otra._id), 'RECHAZAR', '', e.admin)).rejects.toMatchObject({ statusCode: 400 });

    // Una tanda guardada antes de que existiera el soporte no tiene el campo `verificacion`: sigue contando.
    await RegistroServicioSocial.collection.insertOne({ student_id: e.estudiante._id, horas: 50, entidad: 'Antigua', estado: 'VIGENTE', registrado_por: e.admin._id, createdAt: new Date() });
    expect((await titulacion.requisitosDeEstudiante(id, e.admin)).horas_servicio_social).toBe(50);
    expect((await titulacion.listarServicioSocial(id, e.admin)).find((x) => x.entidad === 'Antigua')).toMatchObject({ verificacion: 'HEREDADO', cuenta: true, tiene_soporte: false });
  });

  it('el soporte es obligatorio por el servicio, el formato de Saber 11 se valida y el servicio social exige 10° u 11°', async () => {
    const id = String(e.estudiante._id);
    await expect(titulacion.registrarSaber11(id, 'AC2026', null, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    await expect(titulacion.registrarSaber11(id, 'ac-2324 5678', null, e.admin)).resolves.toMatchObject({ codigo_registro: 'AC23245678' });
    await expect(titulacion.registrarSaber11(id, 'ac 2026 12345678', null, e.admin)).resolves.toMatchObject({ codigo_registro: 'AC202612345678' });
    // Quien no tiene matrícula en 10° u 11° no registra horas.
    await Enrollment.updateMany({ student_id: e.estudiante._id }, { estado: 'ANULADO' });
    await expect(
      titulacion.registrarServicioSocial({ student_id: id, horas: 10, entidad: 'X' }, { nombre: 'c.pdf', archivo_path: 'uploads/servicio-social/p.pdf', mimetype: 'application/pdf', tamano: 1 }, e.admin)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
