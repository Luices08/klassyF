import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import ConfiguracionRecuperaciones from '../../src/models/configuracionRecuperaciones.model';
import Guardian from '../../src/models/guardian.model';
import Insignia from '../../src/models/insignia.model';
import Notificacion from '../../src/models/notificacion.model';
import Recuperacion from '../../src/models/recuperacion.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import { crearEvento } from '../../src/services/academicYear.service';
import * as notas from '../../src/services/notas.service';
import { listarNotificaciones, resumenNotificaciones } from '../../src/services/notificaciones.service';
import { recordarEventosDelCalendario } from '../../src/services/notificacionesEventos.service';
import { registrarIntento } from '../../src/services/recuperacion.service';
import { recordarRecuperaciones } from '../../src/services/recuperacionAvisos.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { crearActividad, crearCasillaSuelta, definirComponentes, DIA_MS, EscenarioNotas, prepararNotas } from './escenarioNotas';
import { hoyColombia } from '../../src/services/attendance.service';

const HETERO = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 10 };
const AUTO = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 };

/** Un día de calendario a partir de hoy (medianoche UTC, como se guardan las fechas del calendario). */
const enDias = (dias: number): Date => new Date(hoyColombia().getTime() + dias * DIA_MS);

describe('M18 → M28: avisos de las recuperaciones (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let acudiente: UserDocument;
  let a1: string;
  let au: string;
  const idEst = (u: UserDocument) => String(u._id);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes(), CalificacionAsignatura.syncIndexes(), Recuperacion.syncIndexes(), Notificacion.syncIndexes()]);
    e = await armarEscenario();
    docente = e.docenteDeClase;
    n = await prepararNotas(e);
    await definirComponentes([HETERO, AUTO]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', null))._id);
    au = String((await crearCasillaSuelta(n.asignacion, 'AUTOEVALUACION', 'Autoevaluación'))._id);

    acudiente = await crearUsuario('ACUDIENTE');
    const guardian = await Guardian.create({ tipo_documento: 'CC', numero_documento: '79111222', nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233', user_id: acudiente._id });
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: guardian._id, parentesco: 'PADRE', es_principal: true });

    // Periodo 1 cerrado: el primer estudiante lo pierde (2.00); los otros dos lo aprueban (4.30).
    const ref = { teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 };
    await notas.guardarCeldas(
      {
        ...ref,
        celdas: [
          { student_id: idEst(e.estudiante), casilla_id: a1, nota: 2 },
          { student_id: idEst(e.estudiante), casilla_id: au, nota: 2 },
          ...[e.otroEstudiante, e.tercerEstudiante].flatMap((u) => [
            { student_id: idEst(u), casilla_id: a1, nota: 4 },
            { student_id: idEst(u), casilla_id: au, nota: 5 },
          ]),
        ],
      },
      docente
    );
    await notas.cerrarPlanilla(ref, docente);
  }, 90_000);

  /** Quita las alertas y los puntos que dejó el cierre de la planilla del setup: cada caso mide solo lo suyo. */
  const limpiarAvisos = async () => {
    await Notificacion.deleteMany({});
    await Insignia.deleteMany({});
  };
  const abrirVentana = (desde: Date, hasta: Date) =>
    crearEvento(n.anioId, { tipo: 'RECUPERACION_PERIODO', nombre: 'Recuperaciones del Periodo 1', periodo_numero: 1, fecha_inicio: desde, fecha_fin: hasta }, { usuarioId: e.admin._id });
  const alertas = async (u: UserDocument) => (await listarNotificaciones(u)).filter((x) => x.evento.startsWith('RECUPERACION'));
  const contadorDeRecuperaciones = async (u: UserDocument) => (await resumenNotificaciones(u)).insignias.find((i) => i.ruta === '/recuperaciones')?.contador ?? 0;
  const registrar = (nota: number) =>
    registrarIntento({ teacher_assignment_id: String(n.asignacion._id), student_id: idEst(e.estudiante), tipo: 'PERIODO', periodo_numero: 1, nota }, docente);

  describe('al fijar las fechas en el calendario', () => {
    it('avisa solo al docente que tiene estudiantes por recuperar y pone el número en el menú', async () => {
      await abrirVentana(enDias(0), enDias(10));

      const [aviso] = await alertas(docente);
      expect(aviso).toMatchObject({ evento: 'RECUPERACION_FECHAS', titulo: 'Fechas de recuperación', ruta: '/recuperaciones' });
      expect(aviso!.mensaje).toContain('La recuperación del periodo 1');
      expect(aviso!.mensaje).toContain('Tienes 1 estudiante por recuperar');
      expect(await alertas(e.docenteAjeno)).toHaveLength(0);
      expect(await contadorDeRecuperaciones(docente)).toBe(1);
      expect(await contadorDeRecuperaciones(e.docenteAjeno)).toBe(0);
    });

    it('administración y coordinación solo reciben el número, sin ninguna alerta', async () => {
      await abrirVentana(enDias(0), enDias(10));

      for (const u of [e.admin, e.coordAcademico]) {
        expect(await contadorDeRecuperaciones(u)).toBe(1);
        expect((await resumenNotificaciones(u)).no_leidas).toBe(0);
      }
    });

    it('el número se apaga cuando entran a Recuperaciones y no vuelve solo', async () => {
      await abrirVentana(enDias(0), enDias(10));
      const { marcarVisto } = await import('../../src/services/notificaciones.service');
      await marcarVisto(e.admin, '/recuperaciones');
      expect(await contadorDeRecuperaciones(e.admin)).toBe(0);
    });

    it('si nadie debe recuperar, no avisa a nadie', async () => {
      await CalificacionAsignatura.updateMany({ student_id: e.estudiante._id }, { $set: { 'resultado.nota_asignatura': 4 } });
      await abrirVentana(enDias(0), enDias(10));
      expect(await alertas(docente)).toHaveLength(0);
      expect(await contadorDeRecuperaciones(e.admin)).toBe(0);
    });
  });

  describe('avisos diarios', () => {
    it('el día que empieza avisa al docente, al estudiante y a su acudiente (no a quien aprobó)', async () => {
      await abrirVentana(enDias(0), enDias(10));
      await limpiarAvisos();

      await recordarRecuperaciones(new Date());

      expect((await alertas(docente))[0]).toMatchObject({ evento: 'RECUPERACION_INICIA', titulo: 'Hoy empieza la recuperación' });
      const delEstudiante = (await alertas(e.estudiante))[0]!;
      expect(delEstudiante.evento).toBe('RECUPERACION_HABILITADA');
      expect(delEstudiante.mensaje).toContain('Tienes 1 asignatura por recuperar');
      const delAcudiente = (await alertas(acudiente))[0]!;
      expect(delAcudiente.mensaje).toContain(`${e.estudiante.nombre} ${e.estudiante.apellido} tiene 1 asignatura por recuperar`);
      expect(await alertas(e.otroEstudiante)).toHaveLength(0);
      expect((await resumenNotificaciones(e.estudiante)).insignias.some((i) => i.ruta === '/mis-notas')).toBe(true);
      expect((await resumenNotificaciones(acudiente)).insignias).toEqual([{ ruta: '/portal', pestana: `notas-${idEst(e.estudiante)}`, contador: 1 }]);
    });

    it('el día antes de que termine avisa al docente que aún tiene estudiantes sin superarla', async () => {
      await abrirVentana(enDias(-3), enDias(1));
      await limpiarAvisos();

      await recordarRecuperaciones(new Date());

      const [aviso] = await alertas(docente);
      expect(aviso).toMatchObject({ evento: 'RECUPERACION_TERMINA_MANANA', titulo: 'La recuperación termina mañana' });
      expect(aviso!.mensaje).toContain('Aún tienes 1 estudiante sin superarla');
      // Es un aviso al docente: el estudiante y su acudiente no reciben el de «mañana termina».
      expect(await alertas(e.estudiante)).toHaveLength(0);
    });

    it('si ya superó la recuperación, el aviso de «mañana termina» no sale', async () => {
      await abrirVentana(enDias(-3), enDias(1));
      await registrar(3.5);
      await limpiarAvisos();

      await recordarRecuperaciones(new Date());

      expect(await alertas(docente)).toHaveLength(0);
    });

    it('el recordatorio genérico del calendario ya no repite las recuperaciones', async () => {
      await abrirVentana(enDias(1), enDias(10));
      await limpiarAvisos();

      await recordarEventosDelCalendario(new Date());

      expect((await listarNotificaciones(docente)).filter((x) => x.evento === 'RECORDATORIO_CALENDARIO')).toHaveLength(0);
    });
  });

  describe('recuperación de fin de año', () => {
    /** Notas cerradas de los periodos 2 a 4 del primer estudiante: con el 1 (2.0) la definitiva ponderada queda en 2.4 y la pierde. */
    beforeEach(async () => {
      await CalificacionAsignatura.insertMany(
        [2, 3, 4].map((periodo) => ({
          academic_year_id: n.anioId,
          teacher_assignment_id: n.asignacion._id,
          group_id: n.grupoId,
          subject_id: n.materiaId,
          periodo_numero: periodo,
          student_id: e.estudiante._id,
          estado: 'DEFINITIVO',
          resultado: { componentes: [], nota_asignatura: 2.5 },
        }))
      );
    });
    const abrirVentanaAnual = (desde: Date, hasta: Date) =>
      crearEvento(n.anioId, { tipo: 'RECUPERACION_FINAL', nombre: 'Recuperación de fin de año', fecha_inicio: desde, fecha_fin: hasta }, { usuarioId: e.admin._id });
    const registrarAnual = (nota: number) =>
      registrarIntento({ teacher_assignment_id: String(n.asignacion._id), student_id: idEst(e.estudiante), tipo: 'ANUAL', nota }, docente);

    it('al fijar las fechas avisa al docente con estudiantes por recuperar y pone el número en el menú', async () => {
      await abrirVentanaAnual(enDias(0), enDias(10));

      const [aviso] = await alertas(docente);
      expect(aviso).toMatchObject({ evento: 'RECUPERACION_FECHAS' });
      expect(aviso!.mensaje).toContain('La recuperación de fin de año');
      expect(aviso!.mensaje).toContain('Tienes 1 estudiante por recuperar');
      expect(await contadorDeRecuperaciones(docente)).toBe(1);
      expect(await contadorDeRecuperaciones(e.admin)).toBe(1);
      expect((await resumenNotificaciones(e.admin)).no_leidas).toBe(0);
      // Quien aprobó el año no recupera.
      expect(await alertas(e.otroEstudiante)).toHaveLength(0);
    });

    it('el día que abre avisa al docente, al estudiante y a su acudiente', async () => {
      await abrirVentanaAnual(enDias(0), enDias(10));
      await limpiarAvisos();

      await recordarRecuperaciones(new Date());

      expect((await alertas(docente))[0]!.mensaje).toContain('La recuperación de fin de año empieza hoy');
      expect((await alertas(e.estudiante))[0]!.mensaje).toContain('la recuperación de fin de año va');
      expect((await alertas(acudiente))[0]!.mensaje).toContain(`${e.estudiante.nombre} ${e.estudiante.apellido} tiene 1 asignatura por recuperar`);
    });

    it('al registrar el resultado avisa al estudiante y al acudiente con la nota del año antes y después', async () => {
      await abrirVentanaAnual(enDias(0), enDias(10));
      await limpiarAvisos();

      await registrarAnual(3);

      const [delEstudiante] = await alertas(e.estudiante);
      expect(delEstudiante).toMatchObject({ evento: 'RECUPERACION_REGISTRADA', titulo: 'Recuperación superada' });
      expect(delEstudiante!.mensaje).toContain('nota anterior 2.40');
      expect(delEstudiante!.mensaje).toContain('recuperación 3.00');
      expect((await alertas(acudiente))[0]!.mensaje).toContain(`la recuperación de ${e.estudiante.nombre} ${e.estudiante.apellido}`);
      expect((await resumenNotificaciones(acudiente)).insignias).toEqual([{ ruta: '/portal', pestana: `notas-${idEst(e.estudiante)}`, contador: 1 }]);
      expect(await alertas(e.admin)).toHaveLength(0);
    });
  });

  describe('cuando el docente registra el resultado', () => {
    beforeEach(async () => {
      await abrirVentana(enDias(0), enDias(10));
      await limpiarAvisos();
    });

    it('avisa al estudiante y a su acudiente con la nota anterior y la nueva, y deja un punto rojo', async () => {
      await registrar(3.5);

      const [delEstudiante] = await alertas(e.estudiante);
      expect(delEstudiante).toMatchObject({ evento: 'RECUPERACION_REGISTRADA', titulo: 'Recuperación superada', ruta: '/mis-notas' });
      expect(delEstudiante!.mensaje).toContain('tu recuperación de');
      expect(delEstudiante!.mensaje).toContain('nota anterior 2.00');
      expect(delEstudiante!.mensaje).toContain('recuperación 3.50');
      expect(delEstudiante!.mensaje).toContain('la superó');

      const [delAcudiente] = await alertas(acudiente);
      expect(delAcudiente!.mensaje).toContain(`la recuperación de ${e.estudiante.nombre} ${e.estudiante.apellido}`);
      expect(delAcudiente!.ruta).toBe('/portal');
      expect((await resumenNotificaciones(e.estudiante)).insignias.find((i) => i.ruta === '/mis-notas')?.contador).toBe(1);
      expect((await resumenNotificaciones(acudiente)).insignias).toEqual([{ ruta: '/portal', pestana: `notas-${idEst(e.estudiante)}`, contador: 1 }]);
    });

    it('administración y coordinación no reciben una alerta por cada recuperación', async () => {
      await registrar(3.5);
      expect(await alertas(e.admin)).toHaveLength(0);
      expect(await alertas(e.coordAcademico)).toHaveLength(0);
      expect((await resumenNotificaciones(e.admin)).no_leidas).toBe(0);
    });

    it('un intento que no la supera lo dice y cuenta los intentos que quedan', async () => {
      await ConfiguracionRecuperaciones.updateOne({ academic_year_id: n.anioId }, { $set: { 'periodo.max_intentos': 2 } });
      await registrar(2.6);

      const [delEstudiante] = await alertas(e.estudiante);
      expect(delEstudiante!.titulo).toBe('Recuperación registrada');
      expect(delEstudiante!.mensaje).toContain('no la superó, te queda 1 intento');
      const [delAcudiente] = await alertas(acudiente);
      expect(delAcudiente!.mensaje).toContain('no la superó, le queda 1 intento');
    });

    it('varios resultados sin leer se agrupan en una sola alerta', async () => {
      await ConfiguracionRecuperaciones.updateOne({ academic_year_id: n.anioId }, { $set: { 'periodo.max_intentos': 2 } });
      await registrar(2.6);
      await registrar(2.8);

      const lista = await alertas(e.estudiante);
      expect(lista).toHaveLength(1);
      expect(lista[0]!.contador).toBe(2);
      expect(lista[0]!.mensaje).toContain('Se registraron 2 resultados de recuperación');
    });

    it('si el registro falla (no debía recuperar) no se avisa nada', async () => {
      await expect(
        registrarIntento({ teacher_assignment_id: String(n.asignacion._id), student_id: idEst(e.otroEstudiante), tipo: 'PERIODO', periodo_numero: 1, nota: 4 }, docente)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(await alertas(e.otroEstudiante)).toHaveLength(0);
    });
  });
});
