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
  pasos: { _id: string; nombre: string; remite_a_orientacion: boolean }[];
  remisiones_orientacion: { estudiante: string; rol: string; origen: string; estado: string; origen_detalle: string; descripcion?: unknown }[];
}
const comoCaso = (c: unknown) => c as CasoVista;

describe('M15 → orientación: remisiones de un caso (con base de datos)', () => {
  let e: Escenario;
  let medidaRemiteId: string;
  let medidaSimpleId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    await RemisionOrientacion.syncIndexes();
    e = await armarEscenario();
    medidaRemiteId = String((await catalogosCaso.crearMedida({ nombre: 'Acompañamiento psicosocial', descripcion: '', se_aplica_por_dias: false, remite_a_orientacion: true, orden: 1 }, actor(e.admin)))._id);
    medidaSimpleId = String((await catalogosCaso.crearMedida({ nombre: 'Taller formativo', descripcion: '', se_aplica_por_dias: false, orden: 2 }, actor(e.admin)))._id);
    await catalogosCaso.guardarProtocolo(
      'II',
      [
        { nombre: 'Citar a los acudientes', obligatorio: true },
        { nombre: 'Valoración por orientación', obligatorio: false, remite_a_orientacion: true },
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

  const aplicarMedida = (id: string, medida: string) =>
    casos.agregarRegistroCaso(id, 'medidas-aplicadas', { fecha: hoy(), medida_id: medida }, e.coordConvivencia);

  it('el protocolo copia la bandera de cada paso al abrir el caso', async () => {
    const caso = await abrir();
    expect(caso.pasos.map((p) => [p.nombre, p.remite_a_orientacion])).toEqual([
      ['Citar a los acudientes', false],
      ['Valoración por orientación', true],
    ]);
  });

  it('aplicar una medida que remite crea una remisión por afectado y presunto responsable, no por el testigo', async () => {
    const caso = await abrir();
    const vista = comoCaso(await aplicarMedida(caso._id, medidaRemiteId));

    expect(vista.remisiones_orientacion).toHaveLength(2);
    expect(vista.remisiones_orientacion.map((r) => r.rol).sort()).toEqual(['AFECTADO', 'PRESUNTO_RESPONSABLE']);
    expect(vista.remisiones_orientacion.every((r) => r.estado === 'PENDIENTE' && r.origen === 'MEDIDA')).toBe(true);
    expect(await AuditLog.countDocuments({ accion: 'ORIENTACION_REMISION_CREADA' })).toBe(1);
  });

  it('una medida sin la bandera no remite, y aplicar la misma medida otra vez no duplica', async () => {
    const caso = await abrir();
    expect(comoCaso(await aplicarMedida(caso._id, medidaSimpleId)).remisiones_orientacion).toHaveLength(0);

    await aplicarMedida(caso._id, medidaRemiteId);
    const otra = comoCaso(await aplicarMedida(caso._id, medidaRemiteId));
    expect(otra.remisiones_orientacion).toHaveLength(2);
  });

  it('cumplir un paso marcado remite; marcarlo pendiente y cumplirlo otra vez no duplica', async () => {
    const caso = await abrir();
    const paso = caso.pasos.find((p) => p.remite_a_orientacion)!;
    const sinBandera = caso.pasos.find((p) => !p.remite_a_orientacion)!;

    expect(comoCaso(await casos.actualizarPaso(caso._id, sinBandera._id, { estado: 'CUMPLIDO' }, e.coordConvivencia)).remisiones_orientacion).toHaveLength(0);
    expect(comoCaso(await casos.actualizarPaso(caso._id, paso._id, { estado: 'CUMPLIDO' }, e.coordConvivencia)).remisiones_orientacion).toHaveLength(2);

    await casos.actualizarPaso(caso._id, paso._id, { estado: 'PENDIENTE' }, e.coordConvivencia);
    expect(comoCaso(await casos.actualizarPaso(caso._id, paso._id, { estado: 'CUMPLIDO' }, e.coordConvivencia)).remisiones_orientacion).toHaveLength(2);
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
    await aplicarMedida(caso._id, medidaRemiteId);
    await expect(casos.anularCaso(caso._id, 'Error de apertura.', e.admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('bandeja y atenciones de orientación', () => {
    const preparar = async () => {
      const caso = await abrir();
      await aplicarMedida(caso._id, medidaRemiteId);
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
