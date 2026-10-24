import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Campus from '../../src/models/campus.model';
import { UserDocument } from '../../src/models/user.model';
import * as casos from '../../src/services/caso.service';
import * as observaciones from '../../src/services/observacion.service';
import * as apoyo from '../../src/services/solicitudApoyo.service';
import { generateToken } from '../../src/services/token.service';
import { vaciarCacheCorta } from '../../src/utils/cacheCorta';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario, hoy } from './escenario';

// Paneles de convivencia y orientación (M30) contra la capa HTTP real: quién entra, qué sedes ve y que nunca salen hechos ni nombres.
describe('M30: paneles de convivencia y orientación (capa HTTP)', () => {
  let e: Escenario;
  let anioId: string;
  let base: string;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto-de-pruebas';
    process.env.MONGO_URI = 'mongodb://no-se-usa';
    await iniciarBaseDeDatos();
    const { default: app } = await import('../../src/app');
    const servidor = app.listen(0);
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
    cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  }, 600_000);
  afterAll(async () => {
    await cerrar();
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    vaciarCacheCorta();
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    e = await armarEscenario();
    anioId = String((await (await import('../../src/models/academicYear.model')).default.findOne())!._id);
  }, 120_000);

  const pedir = async (ruta: string, usuario: UserDocument, query = '') => {
    const respuesta = await fetch(`${base}/dashboard${ruta}?academic_year_id=${anioId}${query}`, { headers: { Authorization: `Bearer ${generateToken(usuario)}` } });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { data?: any; message?: string } };
  };

  // Lo grave el docente solo lo reporta (con la contención que aplicó): coordinación abre el caso y lo tipifica (M14).
  const faltaGrave = (hechos: string) =>
    observaciones.reportarSituacionGrave(
      { fecha_hecho: hoy(), hechos, acciones_contencion: 'Se separó a los estudiantes.', estudiantes_ids: [String(e.estudiante._id), String(e.otroEstudiante._id)] },
      e.docenteDeClase
    );
  const faltaLeve = (hechos: string) =>
    observaciones.registrarFalta({ falta_id: e.faltaI, fecha_hecho: hoy(), hechos, estudiantes_ids: [String(e.estudiante._id)] }, e.docenteDeClase);

  const abrirTipoIII = async () =>
    (await casos.abrirCaso(
      { tipo_situacion: 'III', fecha_hecho: hoy(), lugar: 'Patio', hechos: 'Detalle reservado de una agresión grave.', involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] },
      e.coordConvivencia
    )) as unknown as { _id: unknown };

  describe('convivencia', () => {
    it('solo entran rectoría y el coordinador de convivencia; el coordinador académico, orientación y docentes no', async () => {
      expect((await pedir('/convivencia', e.admin)).estado).toBe(200);
      expect((await pedir('/convivencia', e.coordConvivencia)).estado).toBe(200);
      for (const otro of [e.coordAcademico, e.orientador, e.docenteDeClase, e.secretaria, e.estudiante]) expect((await pedir('/convivencia', otro)).estado).toBe(403);
    });

    it('cuenta solicitudes, casos, faltas por gravedad y remisiones, sin hechos ni nombres', async () => {
      await faltaGrave('Detalle reservado de una agresión física.');
      await faltaLeve('Llegó tarde varias veces.');
      const caso = await abrirTipoIII();
      await casos.remitirAOrientacion(String(caso._id), { student_ids: [String(e.estudiante._id)], motivo: 'Acompañamiento psicosocial.' }, e.coordConvivencia);

      const { estado, cuerpo } = await pedir('/convivencia', e.coordConvivencia);
      expect(estado).toBe(200);
      const d = cuerpo.data;
      expect(d.solicitudes.pendientes).toBe(1);
      expect(d.casos).toMatchObject({ activos: 1, por_tipo: { I: 0, II: 0, III: 1 } });
      // Un reporte urgente no es una falta registrada: la gravedad la fija el caso que abre coordinación (el conteo de faltas graves por caso es de la Fase 4).
      expect(d.faltas).toMatchObject({ total: 1, por_gravedad: { I: 1, II: 0, III: 0 } });
      expect(d.remisiones_orientacion.pendientes).toBe(1);
      expect(d.comite).toEqual({ borradores: 0, proxima: null });

      // La privacidad es parte del contrato: ni un hecho, ni un nombre, ni un documento viajan en este panel.
      const texto = JSON.stringify(cuerpo);
      for (const secreto of ['agresión', 'tarde varias', e.estudiante.apellido, e.estudiante.nombre, e.estudiante.numero_documento, e.otroEstudiante.apellido]) expect(texto).not.toContain(secreto);
    });

    it('una remisión tipo III sin atender pasado el plazo sale como alerta, solo con el código del caso', async () => {
      const caso = await abrirTipoIII();
      expect((await pedir('/convivencia', e.coordConvivencia)).cuerpo.data.alertas.total).toBe(0);

      // El plazo corre desde la creación: se envejece el caso directamente en la colección (el modelo no deja editar `createdAt`).
      await CasoConvivencia.collection.updateOne({ _id: caso._id }, { $set: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
      vaciarCacheCorta();

      const { alertas } = (await pedir('/convivencia', e.coordConvivencia)).cuerpo.data;
      expect(alertas).toMatchObject({ total: 1, remision_tipo_iii: 1, seguimiento_vencido: 0 });
      expect(alertas.casos[0]).toMatchObject({ _id: String(caso._id), tipo_situacion: 'III', alertas: ['REMISION_TIPO_III_PENDIENTE'] });
      expect(Object.keys(alertas.casos[0]).sort()).toEqual(['_id', 'alertas', 'codigo', 'tipo_situacion']);
    });

    it('cada coordinador ve solo sus sedes, y pedir una sede ajena no la abre', async () => {
      await faltaGrave('Agresión.');
      await abrirTipoIII();
      const otraSede = (await pedir('/convivencia', e.coordConvivenciaOtraSede)).cuerpo.data;
      expect(otraSede.solicitudes.pendientes).toBe(0);
      expect(otraSede.casos.activos).toBe(0);
      expect(otraSede.faltas.total).toBe(0);

      const rural = await Campus.findOne({ es_principal: { $ne: true } });
      const ajena = (await pedir('/convivencia', e.coordConvivencia, `&sede_id=${rural!._id}`)).cuerpo.data;
      expect(ajena.solicitudes.pendientes).toBe(0);
      expect(ajena.casos.activos).toBe(0);

      // Rectoría sí puede elegir cualquier sede.
      const principal = await Campus.findOne({ es_principal: true });
      expect((await pedir('/convivencia', e.admin, `&sede_id=${principal!._id}`)).cuerpo.data.casos.activos).toBe(1);
      expect((await pedir('/convivencia', e.admin, `&sede_id=${rural!._id}`)).cuerpo.data.casos.activos).toBe(0);
    });
  });

  describe('orientación', () => {
    it('solo entran rectoría y orientación; convivencia y el coordinador académico no', async () => {
      expect((await pedir('/orientacion', e.admin)).estado).toBe(200);
      expect((await pedir('/orientacion', e.orientador)).estado).toBe(200);
      for (const otro of [e.coordConvivencia, e.coordAcademico, e.docenteDeClase, e.secretaria, e.estudiante]) expect((await pedir('/orientacion', otro)).estado).toBe(403);
    });

    it('cuenta remisiones, solicitudes de apoyo y expedientes, y nunca el contenido', async () => {
      const caso = await abrirTipoIII();
      await casos.remitirAOrientacion(String(caso._id), { student_ids: [String(e.estudiante._id)], motivo: 'Acompañamiento psicosocial.' }, e.coordConvivencia);
      await apoyo.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Usa gafas de aumento especiales' }, e.docenteDeClase);
      const otra = await apoyo.crearSolicitud({ student_id: String(e.otroEstudiante._id), motivo_declarado: 'Baja visión certificada' }, e.docenteDeClase);
      await apoyo.valorarSolicitud(String(otra._id), e.orientador);
      await apoyo.resolverSolicitud(String(otra._id), { resultado: 'ABRIR_PIAR', motivo: 'Baja visión certificada por la familia' }, e.orientador);

      const { estado, cuerpo } = await pedir('/orientacion', e.orientador);
      expect(estado).toBe(200);
      const d = cuerpo.data;
      expect(d.remisiones).toMatchObject({ PENDIENTE: 1, EN_ATENCION: 0, ATENDIDA: 0 });
      expect(d.solicitudes_apoyo).toEqual({ pendientes: 1, en_valoracion: 0 });
      expect(d.expedientes).toMatchObject({ total: 1, piar: 1, plan_apoyo: 0, sin_autorizacion: 1, plazo_vencido: 0 });
      expect(d.expedientes.por_estado.BORRADOR + d.expedientes.por_estado.EN_CONSTRUCCION).toBe(1);
      expect(d.seguimiento).toMatchObject({ total: 0, con_minimo: 0 });

      const texto = JSON.stringify(cuerpo);
      for (const secreto of ['gafas', 'Baja visión', 'psicosocial', e.estudiante.apellido, e.otroEstudiante.apellido, 'categoria']) expect(texto).not.toContain(secreto);
    });

    it('orientación de otra sede no ve nada de esta', async () => {
      await apoyo.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Usa gafas' }, e.docenteDeClase);
      const propia = (await pedir('/orientacion', e.orientador)).cuerpo.data;
      expect(propia.solicitudes_apoyo.pendientes).toBe(1);
      const ajena = (await pedir('/orientacion', e.orientadorOtraSede)).cuerpo.data;
      expect(ajena.solicitudes_apoyo.pendientes).toBe(0);
      expect(ajena.remisiones.PENDIENTE).toBe(0);
    });
  });

  it('rechaza una consulta sin año', async () => {
    const respuesta = await fetch(`${base}/dashboard/convivencia`, { headers: { Authorization: `Bearer ${generateToken(e.admin)}` } });
    expect(respuesta.status).toBe(400);
  });
});
