import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import JornadaOperativa from '../../src/models/jornadaOperativa.model';
import Observacion from '../../src/models/observacion.model';
import SolicitudCaso from '../../src/models/solicitudCaso.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import * as casos from '../../src/services/caso.service';
import * as observaciones from '../../src/services/observacion.service';
import * as solicitudes from '../../src/services/solicitudCaso.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario, hoy } from './escenario';

const PAGINA = { pagina: 1, limite: 20 };

// Una pelea entre estudiantes de grupos distintos: el docente nombra a los de los grupos que dicta o dirige, y coordinación completa el caso.
describe('incidente entre estudiantes de distintos grupos (con base de datos)', () => {
  let e: Escenario;
  let deOtroGrupo: UserDocument;
  let deGrupoAjeno: UserDocument;
  let otroGrupoId: Types.ObjectId;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    e = await armarEscenario();
    const anio = (await AcademicYear.findOne())!;
    const base = (await Group.findOne())!;
    const crearGrupo = async (nomenclatura: string, estudiante: UserDocument) => {
      const grupo = await Group.create({
        sede_id: base.sede_id,
        academic_year_id: anio._id,
        grade_id: base.grade_id,
        jornada_id: base.jornada_id,
        nomenclatura,
        max_capacity: 40,
      });
      await Enrollment.create({ student_id: estudiante._id, group_id: grupo._id, academic_year_id: anio._id, tipo_ingreso: 'NUEVO', estado: 'MATRICULADO_DEFINITIVO', folio_matricula: `F-${estudiante.numero_documento}` });
      return grupo;
    };
    deOtroGrupo = await crearUsuario('ESTUDIANTE');
    deGrupoAjeno = await crearUsuario('ESTUDIANTE');
    const otro = await crearGrupo('602', deOtroGrupo);
    await crearGrupo('603', deGrupoAjeno);
    otroGrupoId = otro._id;
    // El docente de la clase dicta también en el grupo 602, pero no en el 603.
    await TeacherAssignment.create({ docente_id: e.docenteDeClase._id, academic_year_id: anio._id, tipo_asignacion: 'CLASE', group_id: otro._id, subject_id: new Types.ObjectId(), horas_semanales: 3 });
  }, 60_000);

  const id = (u: UserDocument) => String(u._id);

  it('el docente registra una falta con estudiantes de dos grupos que dicta, y cada registro queda en el grupo del estudiante', async () => {
    const { registros } = await observaciones.registrarFalta(
      { falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Discusión entre dos estudiantes de grupos distintos.', estudiantes_ids: [id(e.estudiante), id(deOtroGrupo)] },
      e.docenteDeClase
    );
    expect(registros).toHaveLength(2);
    const grupos = (await Observacion.find().select('group_id')).map((o) => String(o.group_id));
    expect(new Set(grupos).size).toBe(2);
    expect(grupos).toContain(String(otroGrupoId));
  });

  it('un reporte grave con estudiantes de dos grupos llega como una sola solicitud y coordinación abre un solo caso con los dos', async () => {
    await observaciones.reportarSituacionGrave(
      { falta_id: e.faltaII, fecha_hecho: hoy(), hechos: 'Pelea en el patio.', acciones_contencion: 'Se separó a los estudiantes.', estudiantes_ids: [id(e.estudiante), id(deOtroGrupo)] },
      e.docenteDeClase
    );
    const solicitudesPendientes = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data;
    expect(solicitudesPendientes).toHaveLength(1);
    expect(new Set(solicitudesPendientes[0]!.involucrados.map((i) => i.grupo)).size).toBe(2);

    const caso = (await casos.abrirCaso(
      {
        tipo_situacion: 'II',
        fecha_hecho: hoy(),
        hechos: 'Pelea en el patio.',
        solicitud_id: solicitudesPendientes[0]!._id,
        involucrados: [
          { student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' },
          { student_id: id(deOtroGrupo), rol: 'AFECTADO' },
        ],
      },
      e.coordConvivencia
    )) as unknown as { _id: string };
    const guardado = await CasoConvivencia.findById(caso._id);
    expect(guardado!.involucrados).toHaveLength(2);
    expect(new Set(guardado!.involucrados.map((i) => String(i.group_id))).size).toBe(2);
  });

  it('un docente registra sobre un estudiante de un grupo que no dicta ni dirige, sea falta de cualquier tipo u observación', async () => {
    // Una falta grave (el docente vio la pelea en el patio) y una llegada tarde (el docente que anota en la puerta).
    await observaciones.reportarSituacionGrave(
      { falta_id: e.faltaIII, fecha_hecho: hoy(), hechos: 'Pelea en el patio.', acciones_contencion: 'Se separó a los estudiantes.', estudiantes_ids: [id(e.estudiante), id(deGrupoAjeno)] },
      e.docenteDeClase
    );
    expect(await SolicitudCaso.countDocuments()).toBe(1);
    expect(await Observacion.countDocuments()).toBe(0);

    const { registros } = await observaciones.registrarFalta({ falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Llegó tarde.', estudiantes_ids: [id(deGrupoAjeno)] }, e.docenteDeClase);
    expect(registros).toHaveLength(1);
    await observaciones.registrarObservacion({ estudiantes_ids: [id(deGrupoAjeno)], tipo_id: e.tipoComportamental, descripcion: 'Respeta.', fecha_hecho: hoy() }, e.docenteDeClase);
    expect(await Observacion.countDocuments()).toBe(2);
    // El registro queda con el contexto de «docente de la sede», no de clase.
    expect((await Observacion.findOne({ student_id: deGrupoAjeno._id }))!.contexto).toBe('SEDE');
  });

  it('un reporte no mezcla estudiantes de sedes distintas', async () => {
    const anio = (await AcademicYear.findOne())!;
    const base = (await Group.findOne())!;
    const otraSedeId = e.coordConvivenciaOtraSede.sedes_ids[0]!;
    const jornada = await JornadaOperativa.create({ sede_id: otraSedeId, nombre: 'MANANA', hora_inicio: '06:00', hora_fin: '12:00' });
    const grupoRural = await Group.create({ sede_id: otraSedeId, academic_year_id: anio._id, grade_id: base.grade_id, jornada_id: jornada._id, nomenclatura: '601', max_capacity: 40 });
    const rural = await crearUsuario('ESTUDIANTE');
    await Enrollment.create({ student_id: rural._id, group_id: grupoRural._id, academic_year_id: anio._id, tipo_ingreso: 'NUEVO', estado: 'MATRICULADO_DEFINITIVO', folio_matricula: `F-${rural.numero_documento}` });
    const docente = await crearUsuario('DOCENTE', { sedes_ids: [base.sede_id, otraSedeId] });
    await expect(
      observaciones.reportarSituacionGrave({ fecha_hecho: hoy(), hechos: 'Pelea.', acciones_contencion: 'Se separó a los estudiantes.', estudiantes_ids: [id(e.estudiante), id(rural)] }, docente)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('misma sede') });
    expect(await SolicitudCaso.countDocuments()).toBe(0);
  });

  it('el docente elige cualquier grupo de su sede y ve sus estudiantes sin documento; los de sus grupos sí lo traen', async () => {
    const grupos = await observaciones.gruposAccesibles(e.docenteDeClase);
    expect(grupos.map((g) => g.nomenclatura)).toEqual(expect.arrayContaining(['601', '602', '603']));
    // Con la vía de M16 (solo su vínculo) no aparece el 603, que no dicta ni dirige.
    expect((await observaciones.gruposAccesibles(e.docenteDeClase, true)).map((g) => g.nomenclatura)).not.toContain('603');

    const delGrupoAjeno = await observaciones.buscarEstudiantes(e.docenteDeClase, { group_id: String(grupos.find((g) => g.nomenclatura === '603')!._id) });
    expect(delGrupoAjeno.map((s) => s.student_id)).toEqual([id(deGrupoAjeno)]);
    expect(delGrupoAjeno[0]!.numero_documento).toBe('');
    const delGrupoPropio = await observaciones.buscarEstudiantes(e.docenteDeClase, { group_id: String(otroGrupoId) });
    expect(delGrupoPropio[0]!.numero_documento).not.toBe('');

    // Un docente de otra sede no encuentra a nadie, ni por grupo ni por nombre.
    expect(await observaciones.buscarEstudiantes(e.docenteOtraSede, { group_id: String(otroGrupoId) })).toEqual([]);
    expect(await observaciones.buscarEstudiantes(e.docenteOtraSede, { q: deGrupoAjeno.apellido.slice(0, 5) })).toEqual([]);
  });

  it('coordinación sí puede sumar al caso a un estudiante de otro grupo de la sede', async () => {
    await observaciones.reportarSituacionGrave(
      { fecha_hecho: hoy(), hechos: 'Pelea; participó también un estudiante del 603.', acciones_contencion: 'Se separó a los estudiantes.', estudiantes_ids: [id(e.estudiante)] },
      e.docenteDeClase
    );
    const [solicitud] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data;
    const caso = (await casos.abrirCaso(
      {
        tipo_situacion: 'II',
        fecha_hecho: hoy(),
        hechos: 'Pelea.',
        solicitud_id: solicitud!._id,
        involucrados: [
          { student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' },
          { student_id: id(deGrupoAjeno), rol: 'PRESUNTO_RESPONSABLE' },
        ],
      },
      e.coordConvivencia
    )) as unknown as { _id: string };
    expect((await CasoConvivencia.findById(caso._id))!.involucrados).toHaveLength(2);
  });
});
