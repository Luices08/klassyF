import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import RemisionOrientacion from '../../src/models/remisionOrientacion.model';
import * as casos from '../../src/services/caso.service';
import * as catalogosCaso from '../../src/services/casoCatalogo.service';
import * as orientacion from '../../src/services/remisionOrientacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

interface CasoVista {
  _id: string;
  pasos: { _id: string; nombre: string }[];
  remisiones_orientacion: { estudiante: string; rol: string; origen: string; estado: string; origen_detalle: string; descripcion?: unknown }[];
}
const comoCaso = (c: unknown) => c as CasoVista;

describe('M15 → orientación: remisiones de un caso (con base de datos)', () => {
  let e: Escenario;
  let medidaId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    await RemisionOrientacion.syncIndexes();
    e = await armarEscenario();
    medidaId = String((await catalogosCaso.crearMedida({ nombre: 'Acompañamiento psicosocial', descripcion: '', se_aplica_por_dias: false, orden: 1 }, actor(e.admin)))._id);
    await catalogosCaso.guardarProtocolo(
      'II',
      [
        { nombre: 'Citar a los acudientes', obligatorio: true },
        { nombre: 'Valoración por orientación', obligatorio: false },
      ],
      actor(e.admin)
    );
  }, 60_000);

  const abrir = async () =>
    comoCaso(
      await casos.abrirCaso(
        {
          tipo_situacion: 'II',
          fecha_hecho: hoy(),
          lugar: 'Patio',
          hechos: 'Agresión física durante el descanso.',
          involucrados: [
            { student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' },
            { student_id: String(e.otroEstudiante._id), rol: 'AFECTADO' },
            { student_id: String(e.tercerEstudiante._id), rol: 'TESTIGO' },
          ],
        },
        e.coordConvivencia
      )
    );

  // Una medida solo se aplica después de oír los descargos; aquí se registran una vez y se reutilizan.
  const aplicarMedida = async (id: string, medida: string) => {
    if (!(await CasoConvivencia.exists({ _id: id, 'descargos.0': { $exists: true } }))) {
      await casos.agregarRegistroCaso(id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.estudiante._id), fecha: hoy(), texto: 'Dice que fue un malentendido.' }, e.coordConvivencia);
    }
    return casos.agregarRegistroCaso(id, 'medidas-aplicadas', { fecha: hoy(), medida_id: medida }, e.coordConvivencia);
  };

  // Remitir a orientación es siempre una decisión de convivencia, desde el caso (ni una medida ni un paso lo hacen solos).
  const remitirAfectado = (id: string) =>
    casos.remitirAOrientacion(id, { student_ids: [String(e.otroEstudiante._id)], motivo: 'Acompañamiento psicosocial del afectado.' }, e.coordConvivencia);

  it('aplicar una medida o cumplir un paso del protocolo no remite a nadie a orientación', async () => {
    const caso = await abrir();
    expect(comoCaso(await aplicarMedida(caso._id, medidaId)).remisiones_orientacion).toHaveLength(0);
    for (const paso of caso.pasos) {
      expect(comoCaso(await casos.actualizarPaso(caso._id, paso._id, { estado: 'CUMPLIDO' }, e.coordConvivencia)).remisiones_orientacion).toHaveLength(0);
    }
    expect(await RemisionOrientacion.countDocuments()).toBe(0);
  });

  it('los pasos del protocolo ya no traen la bandera de remitir: la remisión es siempre manual', async () => {
    const caso = await abrir();
    expect(caso.pasos.map((p) => Object.keys(p))).not.toContainEqual(expect.arrayContaining(['remite_a_orientacion']));
  });

  it('convivencia remite a mano a un involucrado y no repite una remisión en curso', async () => {
    const caso = await abrir();
    const vista = comoCaso(await casos.remitirAOrientacion(caso._id, { student_ids: [String(e.tercerEstudiante._id)], motivo: 'Testigo muy afectado.' }, e.coordConvivencia));
    expect(vista.remisiones_orientacion).toMatchObject([{ origen: 'MANUAL', origen_detalle: 'Testigo muy afectado.', rol: 'TESTIGO' }]);

    await expect(casos.remitirAOrientacion(caso._id, { student_ids: [String(e.tercerEstudiante._id)], motivo: 'Otra vez.' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    await expect(casos.remitirAOrientacion(caso._id, { student_ids: [String(e.docenteAjeno._id)], motivo: 'No es del caso.' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
    await expect(casos.remitirAOrientacion(caso._id, { student_ids: [String(e.estudiante._id)], motivo: 'Sin permiso.' }, e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el caso con remisiones a orientación no se puede anular', async () => {
    const caso = await abrir();
    await remitirAfectado(caso._id);
    await expect(casos.anularCaso(caso._id, 'Error de apertura.', e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('una remisión automática de una versión anterior (por una medida) se sigue viendo en el caso y en la bandeja', async () => {
    const caso = await abrir();
    const estudiante = e.otroEstudiante;
    const grupo = (await CasoConvivencia.findById(caso._id))!.involucrados.find((i) => String(i.student_id) === String(estudiante._id))!.group_id;
    await RemisionOrientacion.create({
      caso_id: caso._id,
      caso_codigo: (await CasoConvivencia.findById(caso._id))!.codigo,
      sede_id: (await CasoConvivencia.findById(caso._id))!.sede_id,
      tipo_situacion: 'II',
      hechos: 'Agresión física durante el descanso.',
      student_id: estudiante._id,
      group_id: grupo,
      rol: 'AFECTADO',
      origen: 'MEDIDA',
      origen_detalle: 'Acompañamiento psicosocial',
      clave: `${caso._id}:${estudiante._id}:MEDIDA:antigua`,
      remitida_por: e.coordConvivencia._id,
    });
    expect(comoCaso(await casos.obtenerCaso(caso._id, e.coordConvivencia)).remisiones_orientacion).toMatchObject([{ origen: 'MEDIDA', estado: 'PENDIENTE' }]);
    expect((await orientacion.bandejaDeRemisiones(e.orientador, {}, { pagina: 1, limite: 20 })).data).toHaveLength(1);
  });

  describe('bandeja y atenciones de orientación', () => {
    const preparar = async () => {
      const caso = await abrir();
      await remitirAfectado(caso._id);
      const { data } = await orientacion.bandejaDeRemisiones(e.orientador, {}, { pagina: 1, limite: 20 });
      return { caso, remision: data.find((r) => r.rol === 'AFECTADO')! };
    };

    it('orientación de la sede ve las remisiones con los hechos pero sin el resto de involucrados; otra sede no ve nada', async () => {
      const { remision } = await preparar();
      expect(remision).toMatchObject({ estado: 'PENDIENTE', hechos: 'Agresión física durante el descanso.', grupo: '601' });
      expect(Object.keys(remision)).not.toContain('involucrados');

      expect((await orientacion.bandejaDeRemisiones(e.orientadorOtraSede, {}, { pagina: 1, limite: 20 })).data).toHaveLength(0);
      await expect(orientacion.obtenerRemision(remision._id, e.orientadorOtraSede)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('convivencia, el coordinador académico y el docente no entran a la bandeja de orientación', async () => {
      await preparar();
      for (const usuario of [e.coordConvivencia, e.coordAcademico, e.docenteDeClase, e.secretaria]) {
        await expect(orientacion.bandejaDeRemisiones(usuario, {}, { pagina: 1, limite: 20 })).rejects.toMatchObject({ statusCode: 403 });
      }
    });

    it('la primera atención pasa a EN_ATENCION y solo su autor (o un ADMIN) lee lo que escribió', async () => {
      const { remision } = await preparar();
      await orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Primera sesión con el estudiante.' }, e.orientador);

      const propia = await orientacion.obtenerRemision(remision._id, e.orientador);
      expect(propia.estado).toBe('EN_ATENCION');
      expect(propia.atenciones[0]).toMatchObject({ descripcion: 'Primera sesión con el estudiante.' });

      const colega = await orientacion.obtenerRemision(remision._id, e.orientadorColega);
      expect(colega.atenciones[0]).toMatchObject({ descripcion: null });
      expect((await orientacion.obtenerRemision(remision._id, e.admin)).atenciones[0]).toMatchObject({ descripcion: 'Primera sesión con el estudiante.' });
    });

    it('convivencia ve el estado y las fechas de la remisión desde su caso, nunca lo que escribió orientación', async () => {
      const { caso, remision } = await preparar();
      await orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Contenido reservado de la sesión.' }, e.orientador);

      const vista = comoCaso(await casos.obtenerCaso(caso._id, e.coordConvivencia));
      const resumen = vista.remisiones_orientacion.find((r) => r.rol === 'AFECTADO')!;
      expect(resumen.estado).toBe('EN_ATENCION');
      expect(JSON.stringify(vista)).not.toContain('Contenido reservado de la sesión.');
    });

    it('solo orientación registra atenciones; no se registran en fecha futura ni sobre una remisión atendida', async () => {
      const { remision } = await preparar();
      await expect(orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Intento de un ADMIN.' }, e.admin)).rejects.toMatchObject({ statusCode: 403 });
      await expect(orientacion.registrarAtencion(remision._id, { fecha: '2999-01-01', descripcion: 'Sesión del futuro.' }, e.orientador)).rejects.toMatchObject({ statusCode: 400 });

      await expect(orientacion.marcarAtendida(remision._id, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Sesión de cierre del proceso.' }, e.orientador);
      expect((await orientacion.marcarAtendida(remision._id, e.orientador)).estado).toBe('ATENDIDA');
      await expect(orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Una más.' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('audita la lectura y el contenido de la atención no llega a la auditoría', async () => {
      const { remision } = await preparar();
      await orientacion.obtenerRemision(remision._id, e.orientador);
      await orientacion.registrarAtencion(remision._id, { fecha: hoy(), descripcion: 'Texto confidencial de la sesión.' }, e.orientador);

      const acciones = (await AuditLog.find({ accion: /^ORIENTACION_/ })).map((a) => a.accion);
      expect(acciones).toEqual(expect.arrayContaining(['ORIENTACION_BANDEJA_CONSULTADA', 'ORIENTACION_REMISION_CONSULTADA', 'ORIENTACION_ATENCION_REGISTRADA']));
      expect(JSON.stringify(await AuditLog.find({}).lean())).not.toContain('Texto confidencial de la sesión.');
    });
  });
});
