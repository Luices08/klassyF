import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import StudentProfile from '../../src/models/studentProfile.model';
import { UserDocument } from '../../src/models/user.model';
import { updateEnrollmentStatus } from '../../src/services/enrollment.service';
import { actuarSobreDependencia } from '../../src/services/pazYSalvoSalida.service';
import { detalleDeSalida, listarSalidas, matriculasParaSalida, registrarSalida } from '../../src/services/salidaMatricula.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario, hoy } from './escenario';

const DEPENDENCIAS = ['academica', 'biblioteca', 'financiera', 'inventario'];

// M04: retiro o traslado durante el año. Desvincula del aula sin borrar nada y deja el paz y salvo por dependencia.
describe('Retiro y traslado durante el año', () => {
  let e: Escenario;
  let matriculaId: string;

  const aprobarTodas = async (usuario: UserDocument) => {
    for (const clave of DEPENDENCIAS) await actuarSobreDependencia(matriculaId, clave, { accion: 'APROBACION' }, usuario);
  };

  beforeAll(async () => {
    await iniciarBaseDeDatos();
    await Enrollment.init();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const matricula = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
    matriculaId = String(matricula._id);
    await Group.updateOne({ _id: matricula.group_id }, { cupos_ocupados: 3 });
    await StudentProfile.updateOne({ user_id: e.estudiante._id }, { estado: 'ACTIVO' }, { upsert: true });
    // La secretaría solo trabaja las sedes que tiene asignadas.
    e.secretaria.sedes_ids = [(await Group.findById(matricula.group_id))!.sede_id];
    await e.secretaria.save();
  });

  it('registra el retiro con sus metadatos, cierra la trayectoria y libera el cupo de inmediato', async () => {
    const detalle = await registrarSalida(matriculaId, { tipo: 'RETIRO', fecha_efectiva: hoy(), motivo: 'Cambio de ciudad de la familia' }, e.secretaria);

    expect(detalle.estado_matricula).toBe('RETIRADO');
    expect(detalle.salida).toMatchObject({ tipo: 'RETIRO', motivo: 'Cambio de ciudad de la familia', cupo_liberado: true });
    expect(detalle.salida!.registrado_por).toContain(e.secretaria.nombre);
    expect(detalle.trayectoria).toHaveLength(1);
    expect(detalle.trayectoria[0].hasta).not.toBeNull();
    expect((await Group.findOne({ nomenclatura: '601' }))!.cupos_ocupados).toBe(2);
    expect((await StudentProfile.findOne({ user_id: e.estudiante._id }))!.estado).toBe('RETIRADO');
    // Sin soporte cargado queda anotado como faltante, pero no impide registrar (M29 aún no existe).
    expect(detalle.faltantes.join(' ')).toMatch(/soporte/i);
  });

  it('un traslado exige la institución receptora y una fecha que no sea futura', async () => {
    await expect(registrarSalida(matriculaId, { tipo: 'TRASLADO', motivo: 'Cambio de colegio' }, e.secretaria)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/receptora/i) });
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await expect(registrarSalida(matriculaId, { tipo: 'RETIRO', fecha_efectiva: manana, motivo: 'Cambio de colegio' }, e.secretaria)).rejects.toMatchObject({ statusCode: 400 });
    expect((await Enrollment.findById(matriculaId))!.estado).toBe('MATRICULADO_DEFINITIVO');

    const detalle = await registrarSalida(matriculaId, { tipo: 'TRASLADO', motivo: 'Cambio de colegio', institucion_receptora: { nombre: 'Colegio Nuevo' } }, e.secretaria);
    expect(detalle.salida).toMatchObject({ tipo: 'TRASLADO', institucion_receptora: { nombre: 'Colegio Nuevo' } });
    // El estado de la matrícula sigue siendo RETIRADO: lo que distingue el traslado es el tipo de salida.
    expect(detalle.estado_matricula).toBe('RETIRADO');
  });

  it('no se registra dos veces y el estudiante sale de las matrículas disponibles', async () => {
    expect((await matriculasParaSalida(String((await Group.findOne())!.academic_year_id), e.admin)).map((m) => m.enrollment_id)).toContain(matriculaId);
    await registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.admin);
    await expect(registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Otra vez' }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    expect((await matriculasParaSalida(String((await Group.findOne())!.academic_year_id), e.admin)).map((m) => m.enrollment_id)).not.toContain(matriculaId);
  });

  it('el retiro del flujo anterior (cambiar estado) también deja la salida completa', async () => {
    await updateEnrollmentStatus(matriculaId, 'RETIRADO', 'Cambio de colegio', { id: e.secretaria._id });
    const matricula = (await Enrollment.findById(matriculaId))!;
    expect(matricula.salida).toMatchObject({ tipo: 'RETIRO', motivo: 'Cambio de colegio' });
    expect((await detalleDeSalida(matriculaId, e.admin)).paz_y_salvo.dependencias).toHaveLength(DEPENDENCIAS.length);
  });

  describe('paz y salvo de salida', () => {
    beforeEach(async () => {
      await registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.secretaria);
    });

    it('abre una dependencia por cada una activa del colegio, todas pendientes', async () => {
      const { paz_y_salvo } = await detalleDeSalida(matriculaId, e.secretaria);
      expect(paz_y_salvo.estado).toBe('PENDIENTE');
      expect(paz_y_salvo.dependencias.map((d) => d.clave)).toEqual(DEPENDENCIAS);
    });

    it('bloquear exige indicar qué se debe y un bloqueo en una dependencia bloquea el global', async () => {
      await expect(actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'BLOQUEO' }, e.secretaria)).rejects.toMatchObject({ statusCode: 400 });
      const vista = await actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'BLOQUEO', motivo: 'Debe 2 libros' }, e.secretaria);
      expect(vista.estado).toBe('BLOQUEADO');
      expect(vista.dependencias.find((d) => d.clave === 'biblioteca')).toMatchObject({ estado: 'BLOQUEADO', detalle: 'Debe 2 libros' });
    });

    it('la excepción solo la autorizan Rectoría y Secretaría, y únicamente sobre una dependencia bloqueada', async () => {
      await expect(actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'EXCEPCION', motivo: 'Autorizado' }, e.secretaria)).rejects.toMatchObject({ statusCode: 409 });
      await actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'BLOQUEO', motivo: 'Debe 2 libros' }, e.coordAcademico);
      await expect(actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'EXCEPCION', motivo: 'Autorizado' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });

      const vista = await actuarSobreDependencia(matriculaId, 'biblioteca', { accion: 'EXCEPCION', motivo: 'Familia en convenio de pago' }, e.admin);
      const biblioteca = vista.dependencias.find((d) => d.clave === 'biblioteca')!;
      expect(biblioteca.estado).toBe('APROBADO');
      expect(biblioteca.excepcion).toMatchObject({ motivo: 'Familia en convenio de pago' });
      expect(biblioteca.historial.map((h) => h.accion)).toEqual(['APERTURA', 'BLOQUEO', 'EXCEPCION']);
    });

    it('anular una aprobación la devuelve a pendiente, solo por Rectoría o Secretaría', async () => {
      await actuarSobreDependencia(matriculaId, 'academica', { accion: 'APROBACION' }, e.coordAcademico);
      await expect(actuarSobreDependencia(matriculaId, 'academica', { accion: 'ANULACION', motivo: 'Faltaba una nota' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      const vista = await actuarSobreDependencia(matriculaId, 'academica', { accion: 'ANULACION', motivo: 'Faltaba una nota' }, e.secretaria);
      expect(vista.dependencias.find((d) => d.clave === 'academica')!.estado).toBe('PENDIENTE');
    });

    it('con todas las dependencias aprobadas el paz y salvo queda aprobado y el listado lo refleja', async () => {
      await aprobarTodas(e.secretaria);
      expect((await detalleDeSalida(matriculaId, e.secretaria)).paz_y_salvo.estado).toBe('APROBADO');
      const filas = await listarSalidas({ academic_year_id: String((await Group.findOne())!.academic_year_id), estado_paz_y_salvo: 'APROBADO' }, e.admin);
      expect(filas.map((f) => f.enrollment_id)).toContain(matriculaId);
    });
  });

  it('con la política «al aprobar el paz y salvo» el cupo se retiene hasta que todas las dependencias estén aprobadas', async () => {
    await Institution.updateOne({}, { politica_cupo_salida: 'AL_APROBAR_PAZ_Y_SALVO' });
    const detalle = await registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.secretaria);
    expect(detalle.salida!.cupo_liberado).toBe(false);
    expect((await Group.findOne({ nomenclatura: '601' }))!.cupos_ocupados).toBe(3);

    for (const clave of DEPENDENCIAS.slice(0, -1)) await actuarSobreDependencia(matriculaId, clave, { accion: 'APROBACION' }, e.secretaria);
    expect((await Group.findOne({ nomenclatura: '601' }))!.cupos_ocupados).toBe(3);

    await actuarSobreDependencia(matriculaId, DEPENDENCIAS[DEPENDENCIAS.length - 1], { accion: 'APROBACION' }, e.secretaria);
    expect((await Group.findOne({ nomenclatura: '601' }))!.cupos_ocupados).toBe(2);
    expect((await detalleDeSalida(matriculaId, e.secretaria)).salida!.cupo_liberado).toBe(true);

    // Anular y volver a aprobar no descuenta el cupo dos veces.
    await actuarSobreDependencia(matriculaId, 'academica', { accion: 'ANULACION', motivo: 'Faltaba una nota' }, e.secretaria);
    await actuarSobreDependencia(matriculaId, 'academica', { accion: 'APROBACION' }, e.secretaria);
    expect((await Group.findOne({ nomenclatura: '601' }))!.cupos_ocupados).toBe(2);
  });

  describe('inmutabilidad', () => {
    beforeEach(async () => {
      await registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.secretaria);
    });

    it('los datos de la salida no se pueden reescribir después de registrados', async () => {
      const matricula = (await Enrollment.findById(matriculaId))!;
      matricula.salida!.motivo = 'Otro motivo';
      await expect(matricula.save()).rejects.toThrow();
    });

    it('una matrícula con folio no se borra, y lo que se registró a su nombre sigue ahí', async () => {
      const matricula = (await Enrollment.findById(matriculaId))!;
      await expect(matricula.deleteOne()).rejects.toThrow();
      expect(await Enrollment.countDocuments({ _id: matriculaId })).toBe(1);
    });

    it('la bitácora de auditoría es de solo escritura y registró la salida', async () => {
      const evento = await AuditLog.findOne({ accion: 'SALIDA_MATRICULA_REGISTRADA' });
      expect(evento).not.toBeNull();
      expect(evento!.detalle).not.toContain('Cambio de ciudad');
      evento!.detalle = 'alterado';
      await expect(evento!.save()).rejects.toThrow();
      await expect(AuditLog.deleteOne({ _id: evento!._id })).rejects.toThrow();
    });
  });

  it('secretaría de otra sede no ve la salida', async () => {
    await registrarSalida(matriculaId, { tipo: 'RETIRO', motivo: 'Cambio de ciudad' }, e.admin);
    const ajena = e.secretaria;
    ajena.sedes_ids = [];
    await expect(detalleDeSalida(matriculaId, ajena)).rejects.toMatchObject({ statusCode: 404 });
  });
});
