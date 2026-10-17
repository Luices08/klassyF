import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import PazYSalvo from '../../src/models/pazYSalvo.model';
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
    expect(t.pendientes.map((p) => p.requisito).sort()).toEqual(['CARPETA_ACADEMICA', 'PAZ_Y_SALVO', 'SABER_11', 'SERVICIO_SOCIAL']);
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
    await titulacion.registrarServicioSocial({ student_id: String(e.estudiante._id), horas: 40, entidad: 'Hogar Geriátrico' }, usuario);
    expect((await titulacionDe())!.estado).toBe('APROBO_NO_GRADUADO');
    expect((await titulacionDe())!.pendientes.find((p) => p.requisito === 'SERVICIO_SOCIAL')!.detalle).toMatch(/Debe 40 horas/);

    await titulacion.registrarServicioSocial({ student_id: String(e.estudiante._id), horas: 40, entidad: 'Biblioteca municipal' }, usuario);
    await titulacion.registrarSaber11(String(e.estudiante._id), 'AC20261234567', null, usuario);
    await titulacion.registrarCertificadoExterno({ student_id: String(e.estudiante._id), grado_numero: 10, institucion_origen: 'Colegio anterior' }, usuario);
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
    const registro = await titulacion.registrarServicioSocial({ student_id: String(e.estudiante._id), horas: 80, entidad: 'Fundación' }, e.admin);
    await titulacion.anularServicioSocial(String(registro._id), 'Registro duplicado por error', e.admin);
    expect((await titulacion.requisitosDeEstudiante(String(e.estudiante._id), e.admin)).horas_servicio_social).toBe(0);
    await expect(titulacion.requisitosDeEstudiante(String(e.estudiante._id), e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
  });
});
