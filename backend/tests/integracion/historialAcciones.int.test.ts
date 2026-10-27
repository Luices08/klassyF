import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCIONES_DEL_HISTORIAL } from '../../src/constants/tiposEventoAuditoria';
import AuditLog from '../../src/models/auditLog.model';
import Enrollment from '../../src/models/enrollment.model';
import Group, { GroupDocument } from '../../src/models/group.model';
import AcademicYear from '../../src/models/academicYear.model';
import { cambiarGrupo } from '../../src/services/enrollment.service';
import { exportarHistorial, historialDeMatricula, listarHistorial } from '../../src/services/historialAcciones.service';
import { registrarEvento } from '../../src/services/audit.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

// M31: el historial general (solo lectura de la bitácora) y el de una matrícula.
describe('M31: historial de acciones', () => {
  let e: Escenario;
  let grupo: GroupDocument;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    grupo = (await Group.findOne())!;
  }, 120_000);

  const matriculaDe = async (estudianteId: unknown) => (await Enrollment.findOne({ student_id: estudianteId }))!;

  it('el historial de una matrícula junta lo suyo, con usuario y etiqueta, y no mezcla el de otra', async () => {
    const propia = await matriculaDe(e.estudiante._id);
    const ajena = await matriculaDe(e.otroEstudiante._id);
    const destino = await Group.create({ sede_id: grupo.sede_id, academic_year_id: grupo.academic_year_id, grade_id: grupo.grade_id, jornada_id: grupo.jornada_id, nomenclatura: '602', max_capacity: 40 });
    await cambiarGrupo(propia._id, destino._id, { id: e.secretaria._id });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'DOCUMENTO_REVISADO', entidad: 'Enrollment', entidad_id: ajena._id, detalle: 'De otra matrícula' });

    const { eventos } = await historialDeMatricula(String(propia._id));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ accion: 'MATRICULA_GRUPO_CAMBIADO', etiqueta: 'Cambio de grupo', modulo: 'MATRICULA', usuario: { _id: String(e.secretaria._id) } });
    // El detalle ya no lleva ids: dice de qué grupo a qué grupo.
    expect(eventos[0]?.detalle).toMatch(/-> 602$/);
  });

  it('incluye lo que nació de la matrícula (p. ej. un certificado o la admisión) y lista sus otras matrículas', async () => {
    const propia = await matriculaDe(e.estudiante._id);
    const anioAnterior = await AcademicYear.create({ ...(await AcademicYear.findById(grupo.academic_year_id))!.toObject(), _id: undefined, year: 2020, estado: 'CERRADO' });
    await Enrollment.collection.insertOne({ student_id: e.estudiante._id, group_id: grupo._id, academic_year_id: anioAnterior._id, estado: 'RETIRADO', tipo_ingreso: 'NUEVO', folio_matricula: 'F-viejo', checklist: [], trayectoria: [] });
    const admision = await AuditLog.create({ accion: 'ADMISION_APROBADA', entidad: 'AdmissionRequest', entidad_id: propia._id, detalle: 'Aprobada' });

    const { eventos, matriculas_del_estudiante } = await historialDeMatricula(String(propia._id));
    expect(eventos.map((x) => x._id)).toContain(String(admision._id));
    expect(matriculas_del_estudiante).toEqual([expect.objectContaining({ anio: 2020, estado: 'RETIRADO', folio_matricula: 'F-viejo' })]);
  });

  it('una matrícula que no existe responde 404', async () => {
    await expect(historialDeMatricula('64b7f0000000000000000000')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('filtra por módulo, usuario y texto, y pagina del más reciente al más antiguo', async () => {
    // El escenario ya deja eventos (p. ej. el catálogo de convivencia): se cuentan aparte, solo los que el historial muestra.
    const previos = await AuditLog.countDocuments({ accion: { $in: ACCIONES_DEL_HISTORIAL } });
    const propia = await matriculaDe(e.estudiante._id);
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'MATRICULA_CREADA', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'Folio L1-F000001-2026' });
    await registrarEvento({ usuario_id: e.admin._id, accion: 'HORARIO_PUBLICADO', entidad: 'Horario', detalle: 'Versión 1' });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'DOCUMENTO_CARGADO', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'REGISTRO_CIVIL' });

    const matricula = await listarHistorial({ modulo: 'MATRICULA' });
    expect(matricula.total).toBe(2);
    expect(matricula.data[0]?.accion).toBe('DOCUMENTO_CARGADO');
    expect((await listarHistorial({ usuario_id: String(e.admin._id), modulo: 'HORARIOS' })).data.map((x) => x.accion)).toEqual(['HORARIO_PUBLICADO']);
    expect((await listarHistorial({ texto: 'l1-f0000' })).data.map((x) => x.accion)).toEqual(['MATRICULA_CREADA']);
    const total = previos + 3;
    const pagina = await listarHistorial({ limit: 2, page: 2 });
    expect(pagina).toMatchObject({ total, pages: Math.ceil(total / 2), page: 2 });
    expect((await listarHistorial({ limit: 2 })).data[0]?.accion).toBe('DOCUMENTO_CARGADO');
  });

  it('solo muestra crear, editar, matricular y eliminar: consultas, descargas y accesos se guardan pero no salen', async () => {
    const propia = await matriculaDe(e.estudiante._id);
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'MATRICULA_CREADA', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'Folio A' });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'DOCUMENTO_REVISADO', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'Revisado' });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'CERTIFICADO_DESCARGADO', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'PDF' });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'CERTIFICADO_VISTA_PREVIA', entidad: 'Enrollment', entidad_id: propia._id, detalle: 'Vista' });
    await registrarEvento({ usuario_id: e.secretaria._id, accion: 'LOGIN_EXITOSO', entidad: 'User', entidad_id: e.secretaria._id, detalle: 'Entró' });
    await registrarEvento({ usuario_id: e.admin._id, accion: 'ESPACIO_ELIMINADO', entidad: 'Espacio', detalle: 'Aula 3' });

    // La bitácora guarda todo (también lo que no se muestra)…
    expect(await AuditLog.countDocuments({ accion: { $in: ['CERTIFICADO_DESCARGADO', 'CERTIFICADO_VISTA_PREVIA', 'LOGIN_EXITOSO'] } })).toBe(3);

    // …pero el historial general y el de la matrícula solo traen lo que cambia componentes.
    const general = await listarHistorial({ limit: 100 });
    const acciones = general.data.map((x) => x.accion);
    expect(acciones).toEqual(expect.arrayContaining(['MATRICULA_CREADA', 'DOCUMENTO_REVISADO', 'ESPACIO_ELIMINADO']));
    expect(acciones).not.toEqual(expect.arrayContaining(['CERTIFICADO_DESCARGADO']));
    expect(acciones).not.toEqual(expect.arrayContaining(['CERTIFICADO_VISTA_PREVIA']));
    expect(acciones).not.toEqual(expect.arrayContaining(['LOGIN_EXITOSO']));
    expect(general.data.every((x) => x.tipo !== null)).toBe(true);

    const deMatricula = await historialDeMatricula(String(propia._id));
    expect(deMatricula.eventos.map((x) => x.accion).sort()).toEqual(['DOCUMENTO_REVISADO', 'MATRICULA_CREADA']);

    // El filtro por tipo separa cada clase de evento.
    expect((await listarHistorial({ tipo: 'ELIMINACION' })).data.map((x) => x.accion)).toEqual(['ESPACIO_ELIMINADO']);
    expect((await listarHistorial({ tipo: 'MATRICULACION', usuario_id: String(e.secretaria._id) })).data.map((x) => x.accion)).toEqual(['MATRICULA_CREADA']);
    expect((await listarHistorial({ tipo: 'EDICION', usuario_id: String(e.secretaria._id) })).data.map((x) => x.accion)).toEqual(['DOCUMENTO_REVISADO']);

    // Una acción que no se muestra no se puede pedir por nombre: no devuelve nada.
    expect((await listarHistorial({ accion: 'LOGIN_EXITOSO' })).total).toBe(0);
  });

  it('exportar arma el listado y deja constancia en la propia bitácora', async () => {
    await registrarEvento({ usuario_id: e.admin._id, accion: 'HORARIO_PUBLICADO', entidad: 'Horario', detalle: 'Versión 1' });
    const reporte = await exportarHistorial({ modulo: 'HORARIOS' }, e.admin._id, '127.0.0.1');
    expect(reporte.filas).toHaveLength(1);
    expect(reporte.filas[0]).toMatchObject({ accion: 'Horario publicado', modulo: 'Horarios' });
    expect(await AuditLog.countDocuments({ accion: 'HISTORIAL_EXPORTADO', usuario_id: e.admin._id })).toBe(1);
  });
});
