import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import EvaluacionPromocion from '../../src/models/evaluacionPromocionEstudiante.model';
import Guardian from '../../src/models/guardian.model';
import SesionComision from '../../src/models/sesionComision.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import { generarPdfActaSesion } from '../../src/services/actaSesionPdf.service';
import { actualizarConfiguracion, datosDeConfiguracion, obtenerConfiguracion } from '../../src/services/configuracionComision.service';
import { cerrarGrupo, reevaluarEstudiante } from '../../src/services/evaluacionPromocion.service';
import { fichaDeEstudiante } from '../../src/services/fichaComision.service';
import { tableroDeRiesgo } from '../../src/services/riesgoAcademico.service';
import * as sesiones from '../../src/services/sesionComision.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M20: tablero de riesgo y sesiones de la comisión, del acta firmada a la decisión que pasa a M19.
describe('M20: comisión de evaluación y promoción', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let madre: UserDocument;

  async function cerrarNotas(estudiante: UserDocument, nota: number, periodos = [1, 2, 3, 4]) {
    for (const periodo of periodos) {
      await CalificacionAsignatura.create({
        academic_year_id: n.anioId,
        teacher_assignment_id: n.asignacion._id,
        group_id: n.grupoId,
        subject_id: n.materiaId,
        periodo_numero: periodo,
        student_id: estudiante._id,
        estado: 'DEFINITIVO',
        resultado: { componentes: [], nota_asignatura: nota },
      });
    }
  }

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);
    // La madre de uno de los estudiantes integra la comisión como representante de padres.
    madre = await crearUsuario('DOCENTE', { sedes_ids: e.admin.sedes_ids });
    const guardian = await Guardian.create({ tipo_documento: 'CC', numero_documento: '99887766', nombre: 'Marta', apellido: 'Gómez', telefono_principal: '3001112233', user_id: madre._id });
    await StudentGuardian.create({ student_id: e.otroEstudiante._id, guardian_id: guardian._id, parentesco: 'MADRE', es_principal: true });
  });

  describe('configuración y tablero de riesgo', () => {
    it('nace con los valores de partida y solo el administrador la cambia', async () => {
      const inicial = datosDeConfiguracion(await obtenerConfiguracion());
      expect(inicial.semaforo).toMatchObject({ amarillo_desde: 1, naranja_desde: 2, rojo_desde: 3, inasistencia_roja_pct: 20 });
      expect(inicial.reprobacion_masiva).toMatchObject({ porcentaje: 25, minimo_estudiantes: 8 });
      await expect(actualizarConfiguracion({ ...inicial, quorum_porcentaje: 60 }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(actualizarConfiguracion({ ...inicial, semaforo: { ...inicial.semaforo, rojo_desde: 1 } }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
      expect((await actualizarConfiguracion({ ...inicial, quorum_porcentaje: 60 }, e.admin)).quorum_porcentaje).toBe(60);
    });

    it('clasifica a cada estudiante, y alerta la asignatura y el docente solo con el mínimo de evaluados configurado', async () => {
      await cerrarNotas(e.estudiante, 4, [1]);
      await cerrarNotas(e.otroEstudiante, 2, [1]);
      await cerrarNotas(e.tercerEstudiante, 2, [1]);
      const filtros = { academic_year_id: n.anioId, periodo_numero: 1 };

      const t = await tableroDeRiesgo(filtros, e.coordAcademico);
      expect(t.resumen).toMatchObject({ VERDE: 1, AMARILLO: 2, total: 3, con_piar: 0 });
      expect(t.estudiantes[0]).toMatchObject({ nivel: 'AMARILLO', perdidas: ['Matemáticas'] });
      expect(t.hay_notas_provisionales).toBe(false);
      // Con el mínimo de 8 estudiantes de partida, tres evaluados no alertan.
      expect(t.alertas_masivas.asignaturas).toEqual([]);

      const config = datosDeConfiguracion(await obtenerConfiguracion());
      await actualizarConfiguracion({ ...config, reprobacion_masiva: { porcentaje: 25, minimo_estudiantes: 2 } }, e.admin);
      const t2 = await tableroDeRiesgo(filtros, e.admin);
      expect(t2.alertas_masivas.asignaturas[0]).toMatchObject({ evaluados: 3, reprobados: 2 });
      expect(t2.alertas_masivas.docentes).toHaveLength(1);
    });

    it('solo rectoría y coordinación lo ven', async () => {
      await expect(tableroDeRiesgo({ academic_year_id: n.anioId, periodo_numero: 1 }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(tableroDeRiesgo({ academic_year_id: n.anioId, periodo_numero: 9 }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('sesión de cierre anual', () => {
    let sesionId: string;
    let casoId: string;
    let miembros: Record<string, string>;

    const crear = (extra: Partial<sesiones.EntradaSesion> = {}) =>
      sesiones.crearSesion(
        {
          instancia: 'COMISION_EVALUACION',
          academic_year_id: n.anioId,
          fecha: new Date(),
          orden_del_dia: '1. Verificar quórum. 2. Casos de promoción.',
          miembros: [
            { user_id: String(e.admin._id), cargo: 'Rector', representa: 'DIRECTIVO', es_presidente: true },
            { user_id: String(e.coordAcademico._id), cargo: 'Coordinadora académica', representa: 'DIRECTIVO' },
            { user_id: String(e.docenteDeClase._id), cargo: 'Docente de 6°', representa: 'DOCENTE' },
            { user_id: String(madre._id), cargo: 'Representante de padres', representa: 'PADRES' },
            { nombre: 'Personero estudiantil', cargo: 'Personero', representa: 'ESTUDIANTES' },
          ],
          ...extra,
        },
        e.coordAcademico
      );

    const idDe = (s: Awaited<ReturnType<typeof crear>>) => Object.fromEntries(s.miembros.map((m) => [m.cargo, String(m._id)]));

    beforeEach(async () => {
      await cerrarNotas(e.estudiante, 4);
      await cerrarNotas(e.otroEstudiante, 2);
      await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
      await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
      const sesion = await crear();
      sesionId = String(sesion._id);
      miembros = idDe(sesion);
      await sesiones.convocar(sesionId, e.coordAcademico);
      const conCaso = await sesiones.agregarCaso(sesionId, { student_id: String(e.otroEstudiante._id), tipo: 'PROMOCION' }, e.coordAcademico);
      casoId = String(conCaso.casos[0]!._id);
    });

    const asistencia = (todos = true) => Object.values(miembros).map((miembro_id) => ({ miembro_id, asistio: todos }));
    const preparar = async (votos: Array<[string, 'A_FAVOR' | 'EN_CONTRA' | 'ABSTENCION']>, decision: 'PROMOVER' | 'NO_PROMOVER' = 'PROMOVER') => {
      await sesiones.actualizarSesion(sesionId, { asistencia: asistencia(), desarrollo: 'Se analizó el caso con la ficha técnica del estudiante.' }, e.coordAcademico);
      await sesiones.actualizarCaso(
        sesionId,
        casoId,
        { deliberacion: 'Superó las dificultades en el seguimiento.', votos: votos.map(([cargo, voto]) => ({ miembro_id: miembros[cargo]!, voto })), decision: { tipo: decision, fundamento: 'Alcanzó los logros en el segundo semestre.' } },
        e.coordAcademico
      );
    };

    it('la madre del estudiante queda apartada de su caso y no puede votarlo', async () => {
      const sesion = (await SesionComision.findById(sesionId))!;
      expect(sesion.casos[0]!.recusados_ids.map(String)).toEqual([miembros['Representante de padres']]);
      // El detalle para la pantalla trae los nombres de los estudiantes de sus casos.
      const detalle = await sesiones.detalleDeSesion(sesionId, e.coordAcademico);
      expect(detalle.estudiantes[String(e.otroEstudiante._id)]).toMatchObject({ nombre: e.otroEstudiante.nombre, apellido: e.otroEstudiante.apellido });
      await expect(sesiones.actualizarCaso(sesionId, casoId, { votos: [{ miembro_id: miembros['Representante de padres']!, voto: 'A_FAVOR' }] }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('sin quórum no se realiza la sesión', async () => {
      await sesiones.actualizarSesion(sesionId, { asistencia: [{ miembro_id: miembros['Rector']!, asistio: true }], desarrollo: 'x' }, e.coordAcademico);
      await expect(sesiones.realizar(sesionId, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/No hay quórum/) });
    });

    it('decisión aprobada: el acta se firma con la contraseña de cada asistente y la decisión pasa a M19 con huella verificable', async () => {
      await preparar([['Rector', 'A_FAVOR'], ['Coordinadora académica', 'A_FAVOR'], ['Docente de 6°', 'EN_CONTRA']]);
      await sesiones.agregarCompromiso(sesionId, { student_id: String(e.otroEstudiante._id), caso_id: casoId, responsable_tipo: 'ACUDIENTE', responsable_nombre: 'Marta Gómez', descripcion: 'Acompañar las tareas de matemáticas cada semana.', fecha_limite: new Date(Date.now() + 30 * 86_400_000) }, e.coordAcademico);
      const realizada = await sesiones.realizar(sesionId, e.coordAcademico);
      expect(realizada.casos[0]!.resultado_votacion).toMatchObject({ a_favor: 2, en_contra: 1, habilitados: 4, aprobada: true, quorum: true });

      // Firmar: contraseña correcta, solo integrantes que asistieron.
      await expect(sesiones.firmar(sesionId, 'otra', e.admin)).rejects.toMatchObject({ statusCode: 401 });
      await expect(sesiones.firmar(sesionId, CLAVE, e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
      for (const quien of [e.admin, e.coordAcademico, e.docenteDeClase]) {
        const parcial = await sesiones.firmar(sesionId, CLAVE, quien);
        expect(parcial.estado).toBe('REALIZADA');
        await expect(sesiones.firmar(sesionId, CLAVE, quien)).rejects.toMatchObject({ statusCode: 409 });
      }
      const firmada = await sesiones.firmar(sesionId, CLAVE, madre);
      expect(firmada).toMatchObject({ estado: 'FIRMADA', codigo: `ACE-${new Date().getFullYear()}-001` });
      expect((await sesiones.verificarIntegridad(sesionId, e.admin)).integra).toBe(true);

      // La decisión pasó a M19 como una versión nueva, con la referencia del acta.
      const cierre = (await EvaluacionPromocion.findOne({ student_id: e.otroEstudiante._id, vigente: true }))!;
      expect(cierre).toMatchObject({ resultado: 'PROMOVIDO', version: 2 });
      expect((cierre.detalle as { decision_instancia: { acta: string } }).decision_instancia.acta).toBe(firmada.codigo);
      // Un recálculo no pisa lo que decidió la comisión.
      await expect(reevaluarEstudiante(n.anioId, String(e.otroEstudiante._id), 'Intento de recalcular el cierre', CLAVE, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/instancia colegiada/) });

      // Inmutable, salvo el seguimiento de los compromisos.
      await expect(sesiones.actualizarSesion(sesionId, { desarrollo: 'cambio' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
      const k = (await SesionComision.findById(sesionId))!.compromisos[0]!;
      const seguido = await sesiones.actualizarCompromiso(sesionId, String(k._id), { estado: 'CUMPLIDO', seguimiento: 'La madre entregó el registro semanal.' }, e.coordAcademico);
      expect(seguido.compromisos[0]).toMatchObject({ estado: 'CUMPLIDO' });
      expect((await sesiones.verificarIntegridad(sesionId, e.admin)).integra).toBe(true);

      // Alterar el acta directo en la base se detecta.
      await SesionComision.updateOne({ _id: sesionId }, { $set: { desarrollo: 'Texto alterado' } });
      expect((await sesiones.verificarIntegridad(sesionId, e.admin)).integra).toBe(false);

      const { buffer } = await generarPdfActaSesion(sesionId, e.admin);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('una decisión sin mayoría queda registrada pero no cambia el cierre del estudiante', async () => {
      await preparar([['Rector', 'EN_CONTRA'], ['Coordinadora académica', 'A_FAVOR'], ['Docente de 6°', 'EN_CONTRA']]);
      const realizada = await sesiones.realizar(sesionId, e.coordAcademico);
      expect(realizada.casos[0]!.resultado_votacion?.aprobada).toBe(false);
      for (const quien of [e.admin, e.coordAcademico, e.docenteDeClase, madre]) await sesiones.firmar(sesionId, CLAVE, quien);
      const cierre = (await EvaluacionPromocion.findOne({ student_id: e.otroEstudiante._id, vigente: true }))!;
      expect(cierre).toMatchObject({ resultado: 'PENDIENTE_RECUPERACION', version: 1 });
    });

    it('con firma solo del presidente basta él; el externo firma en papel', async () => {
      const config = datosDeConfiguracion(await obtenerConfiguracion());
      await actualizarConfiguracion({ ...config, firmas_requeridas: 'SOLO_PRESIDENTE' }, e.admin);
      await preparar([['Rector', 'A_FAVOR'], ['Coordinadora académica', 'A_FAVOR']]);
      await sesiones.realizar(sesionId, e.coordAcademico);
      expect((await sesiones.firmar(sesionId, CLAVE, e.admin)).estado).toBe('FIRMADA');
    });

    it('la ficha técnica junta lo de otros módulos para quien delibera, y a quien no está en la sesión no le responde', async () => {
      const ficha = await fichaDeEstudiante(String(e.otroEstudiante._id), n.anioId, e.admin);
      expect(ficha).toMatchObject({ grupo: '601', tiene_piar: false, orientacion: { tiene_remisiones: false }, cierre_promocion: { resultado: 'PENDIENTE_RECUPERACION' } });
      expect(ficha.notas_por_periodo[0]!.periodos.map((p) => p.nota)).toEqual([2, 2, 2, 2]);
      expect(ficha.convivencia.nota).toMatch(/Observador/);
      // Un docente de la sesión ve la ficha del estudiante que se trata; uno ajeno, no.
      await expect(fichaDeEstudiante(String(e.otroEstudiante._id), n.anioId, e.docenteDeClase)).resolves.toBeDefined();
      await expect(fichaDeEstudiante(String(e.otroEstudiante._id), n.anioId, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it('el Consejo Directivo lo gestiona solo el rector, y una sesión no se crea con más de un presidente', async () => {
    const base = { academic_year_id: n.anioId, fecha: new Date(), miembros: [{ user_id: String(e.admin._id), cargo: 'Rector', es_presidente: true }] };
    await expect(sesiones.crearSesion({ ...base, instancia: 'CONSEJO_DIRECTIVO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(sesiones.crearSesion({ ...base, instancia: 'CONSEJO_DIRECTIVO' }, e.admin)).resolves.toBeDefined();
    await expect(
      sesiones.crearSesion({ ...base, instancia: 'CONSEJO_ACADEMICO', miembros: [{ user_id: String(e.admin._id), cargo: 'Rector', es_presidente: true }, { nombre: 'Otro', cargo: 'Coordinador', es_presidente: true }] }, e.coordAcademico)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
