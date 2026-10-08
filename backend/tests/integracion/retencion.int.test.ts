import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Observacion from '../../src/models/observacion.model';
import * as casos from '../../src/services/caso.service';
import * as catalogo from '../../src/services/convivenciaCatalogo.service';
import * as observaciones from '../../src/services/observacion.service';
import { reporteRetencion } from '../../src/services/retencion.service';
import { fechaLimiteRetencion } from '../../src/utils/retencion';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

describe('Retención de datos de convivencia (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
  }, 60_000);

  const haceAnios = (anios: number) => fechaLimiteRetencion(anios, new Date());

  it('sin plazo definido no se supone ninguno: no hay nada vencido', async () => {
    expect(await reporteRetencion(e.admin)).toMatchObject({ retencion_anios_observaciones: null, retencion_anios_casos: null, observaciones: null, casos: null });
  });

  it('informa lo que ya cumplió el plazo, sin borrar nada, y deja rastro de la consulta', async () => {
    const [vieja] = await observaciones.registrarObservacion(
      { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, descripcion: 'Antigua.', fecha_hecho: hoy() },
      e.docenteDeClase
    );
    await observaciones.registrarObservacion(
      { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoComportamental, descripcion: 'Reciente.', fecha_hecho: hoy() },
      e.docenteDeClase
    );
    await Observacion.collection.updateOne({ _id: new Types.ObjectId(vieja!._id) }, { $set: { fecha_hecho: haceAnios(6) } });

    const cerrado = (await casos.abrirCaso({ tipo_situacion: 'I', fecha_hecho: hoy(), hechos: 'Discusión en el patio.', involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] }, e.coordConvivencia)) as { _id: string; codigo: string };
    await CasoConvivencia.collection.updateOne({ _id: new Types.ObjectId(cerrado._id) }, { $set: { estado: 'CERRADO', cierre: { motivo: 'Resuelto.', por: e.admin._id, fecha: haceAnios(8) } } });
    const abierto = (await casos.abrirCaso({ tipo_situacion: 'I', fecha_hecho: hoy(), hechos: 'Otra discusión en el patio.', involucrados: [{ student_id: String(e.otroEstudiante._id), rol: 'PRESUNTO_RESPONSABLE' }] }, e.coordConvivencia)) as { _id: string };
    await CasoConvivencia.collection.updateOne({ _id: new Types.ObjectId(abierto._id) }, { $set: { createdAt: haceAnios(9) } });

    await catalogo.actualizarConfiguracion({ retencion_anios_observaciones: 5, retencion_anios_casos: 5 }, actor(e.admin), 'ADMIN');
    const informe = await reporteRetencion(e.admin);
    expect(informe.observaciones).toMatchObject({ total: 1 });
    expect(informe.casos).toMatchObject({ total: 1, casos: [{ codigo: cerrado.codigo, estado: 'CERRADO' }] });
    expect(informe.nota).toContain('solo informa');

    // Nada se borró, y un caso abierto nunca vence aunque sea muy viejo.
    expect(await Observacion.countDocuments()).toBe(2);
    expect(await CasoConvivencia.countDocuments()).toBe(2);
    expect(await AuditLog.countDocuments({ accion: 'RETENCION_REPORTE_CONSULTADO' })).toBe(1);
  });

  it('solo un ADMIN define los plazos de retención', async () => {
    await expect(catalogo.actualizarConfiguracion({ retencion_anios_casos: 3 }, actor(e.coordConvivencia), 'COORDINADOR_CONVIVENCIA')).rejects.toMatchObject({ statusCode: 403 });
    // El coordinador sí ajusta el resto de la política (plazos de corrección, quórum…).
    await expect(catalogo.actualizarConfiguracion({ plazo_enmienda_horas: 24 }, actor(e.coordConvivencia), 'COORDINADOR_CONVIVENCIA')).resolves.toMatchObject({ plazo_enmienda_horas: 24 });
  });

  it('solo un ADMIN consulta el informe', async () => {
    await expect(reporteRetencion(e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    await expect(reporteRetencion(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });
});
