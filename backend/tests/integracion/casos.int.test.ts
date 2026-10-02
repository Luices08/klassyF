import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Observacion from '../../src/models/observacion.model';
import * as casos from '../../src/services/caso.service';
import * as catalogosCaso from '../../src/services/casoCatalogo.service';
import * as observaciones from '../../src/services/observacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

type Caso = Awaited<ReturnType<typeof casos.abrirCaso>>;
const comoCaso = (c: unknown) => c as Caso & { _id: string; codigo: string; estado: string; tipo_situacion: string; pasos: { _id: string; nombre: string; estado: string }[]; alertas: { codigo: string }[] };

describe('M15 casos de convivencia (con base de datos)', () => {
  let e: Escenario;
  let entidadId: string;
  let medidaId: string;
  let medidaPorDiasId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await CasoConvivencia.syncIndexes();
    e = await armarEscenario();
    entidadId = String((await catalogosCaso.crearEntidad({ nombre: 'ICBF', descripcion: '', orden: 1 }, actor(e.admin)))._id);
    medidaId = String((await catalogosCaso.crearMedida({ nombre: 'Taller formativo', descripcion: '', se_aplica_por_dias: false, orden: 1 }, actor(e.admin)))._id);
    medidaPorDiasId = String((await catalogosCaso.crearMedida({ nombre: 'Desescolarización', descripcion: '', se_aplica_por_dias: true, orden: 2 }, actor(e.admin)))._id);
    await catalogosCaso.guardarProtocolo('I', [{ nombre: 'Diálogo con el estudiante', obligatorio: true }, { nombre: 'Mediación', obligatorio: false }], actor(e.admin));
    await catalogosCaso.guardarProtocolo('II', [{ nombre: 'Citar a los acudientes', obligatorio: true }], actor(e.admin));
  }, 60_000);

  const abrir = async (usuario = e.coordConvivencia, tipo: 'I' | 'II' | 'III' = 'I', extra: Partial<casos.AbrirCasoInput> = {}) =>
    comoCaso(
      await casos.abrirCaso(
        {
          tipo_situacion: tipo,
          fecha_hecho: hoy(),
          lugar: 'Patio',
          hechos: 'Discusión en el patio durante el descanso.',
          involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' }],
          ...extra,
        },
        usuario
      )
    );

  const avanzar = (id: string, estado: Parameters<typeof casos.cambiarEstadoCaso>[1], usuario = e.coordConvivencia) =>
    casos.cambiarEstadoCaso(id, estado, usuario);

  it('abre un caso directo con consecutivo anual y copia los pasos del protocolo', async () => {
    const caso = await abrir();
    expect(caso.codigo).toMatch(/^CC-\d{4}-0001$/);
    expect(caso).toMatchObject({ estado: 'ABIERTO', origen: 'DIRECTO' });
    expect(caso.pasos.map((p) => p.nombre)).toEqual(['Diálogo con el estudiante', 'Mediación']);
    expect((await abrir()).codigo).toMatch(/-0002$/);
  });

  it('el consecutivo no tiene huecos aunque haya aperturas simultáneas o fallidas', async () => {
    await expect(abrir(e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
    const [a, b] = await Promise.all([abrir(), abrir()]);
    expect([a.codigo, b.codigo].sort()).toEqual([expect.stringMatching(/-0001$/), expect.stringMatching(/-0002$/)]);
  });

  it('solo convivencia abre y consulta; otra sede, el coordinador académico y el docente no', async () => {
    await expect(abrir(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(abrir(e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(casos.listarCasos(e.coordAcademico, {}, { pagina: 1, limite: 20 })).rejects.toMatchObject({ statusCode: 403 });

    const caso = await abrir();
    await expect(casos.obtenerCaso(caso._id, e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
    await expect(casos.obtenerCaso(caso._id, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 404 });
    expect((await casos.listarCasos(e.coordConvivenciaOtraSede, {}, { pagina: 1, limite: 20 })).data).toHaveLength(0);
    expect((await casos.listarCasos(e.coordConvivencia, {}, { pagina: 1, limite: 20 })).data).toHaveLength(1);
  });

  it('convierte la solicitud de una observación y el director ve el estado del caso, no su contenido', async () => {
    const [obs] = await observaciones.registrarObservacion(
      { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoII], comentario: 'Detalle reservado.', fecha_hecho: hoy() },
      e.docenteDeClase
    );
    const caso = await abrir(e.coordConvivencia, 'II', { involucrados: undefined, observacion_id: obs!._id });
    expect(caso).toMatchObject({ origen: 'OBSERVACION' });
    expect((await observaciones.bandejaDeCasos(e.coordConvivencia, { pagina: 1, limite: 20 })).data).toHaveLength(0);
    const guardada = await Observacion.findById(obs!._id);
    expect(guardada!.solicitud_caso).toMatchObject({ estado: 'CONVERTIDA' });

    const historial = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.directora, { pagina: 1, limite: 20 });
    const reservada = historial.data[0] as { reservada: boolean; caso: { codigo: string; estado: string } };
    expect(reservada).toMatchObject({ reservada: true, caso: { codigo: caso.codigo, estado: 'ABIERTO' } });
    expect(JSON.stringify(historial.data)).not.toContain('Detalle reservado');
  });

  it('sigue el flujo de estados y rechaza saltos', async () => {
    const caso = await abrir();
    await expect(avanzar(caso._id, 'EN_SEGUIMIENTO')).rejects.toMatchObject({ statusCode: 409 });
    await expect(avanzar(caso._id, 'REMITIDO')).rejects.toMatchObject({ statusCode: 409 });
    expect(await avanzar(caso._id, 'EN_ATENCION')).toMatchObject({ estado: 'EN_ATENCION' });
    expect(await avanzar(caso._id, 'EN_MEDIACION')).toMatchObject({ estado: 'EN_MEDIACION' });
    await expect(avanzar(caso._id, 'ABIERTO')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('un tipo I no se cierra con un paso obligatorio pendiente', async () => {
    const caso = await abrir();
    await avanzar(caso._id, 'EN_ATENCION');
    await expect(casos.cerrarCaso(caso._id, { resultado: 'SOLUCIONADO', motivo: 'Resuelto.' }, e.coordConvivencia)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Diálogo con el estudiante'),
    });
    await casos.actualizarPaso(caso._id, caso.pasos[0]!._id, { estado: 'CUMPLIDO' }, e.coordConvivencia);
    expect(await casos.cerrarCaso(caso._id, { resultado: 'SOLUCIONADO', motivo: 'Resuelto.' }, e.coordConvivencia)).toMatchObject({ estado: 'CERRADO', resultado_cierre: 'SOLUCIONADO' });
    await expect(casos.registrarAtencion(caso._id, { descripcion: 'Tarde.' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('un tipo III no se cierra sin atención, informe a acudientes y remisión', async () => {
    const caso = await abrir(e.coordConvivencia, 'III');
    await avanzar(caso._id, 'EN_ATENCION');
    const cerrar = () => casos.cerrarCaso(caso._id, { resultado: 'SOLUCIONADO', motivo: 'Terminado.' }, e.coordConvivencia);
    await expect(cerrar()).rejects.toMatchObject({ statusCode: 409 });

    await casos.registrarAtencion(caso._id, { descripcion: 'Atención en enfermería.', hubo_dano: true }, e.coordConvivencia);
    await casos.agregarRegistroCaso(caso._id, 'notificaciones', { tipo: 'ACUDIENTES', fecha: hoy(), medio: 'LLAMADA', dirigida_a: 'Madre' }, e.coordConvivencia);
    await expect(cerrar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('remisión') });

    await casos.agregarRegistroCaso(caso._id, 'remisiones', { entidad_id: entidadId, fecha: hoy(), oficio: 'OF-12' }, e.coordConvivencia);
    expect(await cerrar()).toMatchObject({ estado: 'CERRADO' });
  });

  it('REMITIDO exige haber registrado la remisión y luego sigue en seguimiento', async () => {
    const caso = await abrir(e.coordConvivencia, 'III');
    await avanzar(caso._id, 'EN_ATENCION');
    await expect(avanzar(caso._id, 'REMITIDO')).rejects.toMatchObject({ statusCode: 409 });
    await casos.agregarRegistroCaso(caso._id, 'remisiones', { entidad_id: entidadId, fecha: hoy() }, e.coordConvivencia);
    expect(await avanzar(caso._id, 'REMITIDO')).toMatchObject({ estado: 'REMITIDO' });
    expect(await avanzar(caso._id, 'EN_SEGUIMIENTO')).toMatchObject({ estado: 'EN_SEGUIMIENTO' });
  });

  it('solo se sube de tipo con coordinación; bajar es de ADMIN; al subir se suman los pasos del nuevo protocolo', async () => {
    const caso = await abrir();
    const subido = comoCaso(await casos.reclasificarCaso(caso._id, 'II', 'Hubo lesiones.', e.coordConvivencia));
    expect(subido.tipo_situacion).toBe('II');
    expect(subido.pasos.map((p) => p.nombre)).toEqual(['Diálogo con el estudiante', 'Mediación', 'Citar a los acudientes']);

    await expect(casos.reclasificarCaso(caso._id, 'I', 'Fue un error.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    expect(await casos.reclasificarCaso(caso._id, 'I', 'Fue un error de tipificación.', e.admin)).toMatchObject({ tipo_situacion: 'I' });
  });

  it('la decisión exige descargos y el resultado "medida aplicada" exige la medida registrada', async () => {
    const caso = await abrir();
    await avanzar(caso._id, 'EN_ATENCION');
    await casos.actualizarPaso(caso._id, caso.pasos[0]!._id, { estado: 'CUMPLIDO' }, e.coordConvivencia);
    const motivacion = 'Con fundamento en el manual de convivencia y lo narrado por las partes.';

    await expect(casos.registrarDecision(caso._id, { motivacion, descriptores_ids: [e.faltaTipoI] }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    await casos.agregarRegistroCaso(caso._id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.estudiante._id), fecha: hoy(), texto: 'Dice que fue un malentendido.' }, e.coordConvivencia);
    await expect(
      casos.agregarRegistroCaso(caso._id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.otroEstudiante._id), fecha: hoy(), texto: 'No está involucrado.' }, e.coordConvivencia)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await casos.registrarDecision(caso._id, { motivacion, descriptores_ids: [e.faltaTipoI] }, e.coordConvivencia)).toMatchObject({ decision: { descriptores: [{ codigo: '1.3' }] } });

    const cerrar = () => casos.cerrarCaso(caso._id, { resultado: 'MEDIDA_APLICADA', motivo: 'Se aplicó la medida.' }, e.coordConvivencia);
    await expect(cerrar()).rejects.toMatchObject({ statusCode: 409 });
    await expect(casos.agregarRegistroCaso(caso._id, 'medidas-aplicadas', { medida_id: medidaPorDiasId, fecha: hoy() }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
    await casos.agregarRegistroCaso(caso._id, 'medidas-aplicadas', { medida_id: medidaPorDiasId, fecha: hoy(), dias: 2 }, e.coordConvivencia);
    expect(await cerrar()).toMatchObject({ estado: 'CERRADO' });
  });

  it('solo un ADMIN reabre (con motivo) o anula; anular devuelve la solicitud a la bandeja', async () => {
    const [obs] = await observaciones.registrarObservacion(
      { estudiantes_ids: [String(e.estudiante._id)], tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoII], comentario: 'Hechos.', fecha_hecho: hoy() },
      e.docenteDeClase
    );
    const caso = await abrir(e.coordConvivencia, 'II', { involucrados: undefined, observacion_id: obs!._id });

    await expect(casos.anularCaso(caso._id, 'Error de apertura.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    expect(await casos.anularCaso(caso._id, 'Error de apertura.', e.admin)).toMatchObject({ estado: 'ANULADO' });
    expect((await observaciones.bandejaDeCasos(e.coordConvivencia, { pagina: 1, limite: 20 })).data).toHaveLength(1);

    const otro = await abrir();
    await avanzar(otro._id, 'EN_ATENCION');
    await casos.actualizarPaso(otro._id, otro.pasos[0]!._id, { estado: 'NO_APLICA' }, e.coordConvivencia);
    await casos.cerrarCaso(otro._id, { resultado: 'DESESTIMADO', motivo: 'No se probó.' }, e.coordConvivencia);
    await expect(casos.reabrirCaso(otro._id, 'Hay hechos nuevos.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    expect(await casos.reabrirCaso(otro._id, 'Hay hechos nuevos.', e.admin)).toMatchObject({ estado: 'REABIERTO', resultado_cierre: null });
    expect(await avanzar(otro._id, 'EN_SEGUIMIENTO', e.admin)).toMatchObject({ estado: 'EN_SEGUIMIENTO' });
  });

  it('quien se declara impedido deja de ver el caso; el ADMIN siempre puede auditarlo', async () => {
    const caso = await abrir();
    expect(await casos.declararImpedimento(caso._id, { motivo: 'Es familiar del estudiante.' }, e.coordConvivencia)).toEqual({ apartado: true });
    await expect(casos.obtenerCaso(caso._id, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 404 });
    expect((await casos.listarCasos(e.coordConvivencia, {}, { pagina: 1, limite: 20 })).data).toHaveLength(0);
    await expect(avanzar(caso._id, 'EN_ATENCION')).rejects.toMatchObject({ statusCode: 404 });
    expect(await casos.obtenerCaso(caso._id, e.admin)).toMatchObject({ codigo: caso.codigo });
  });

  it('todo detalle de un caso queda en la auditoría y un tipo III sin remisión da alerta pasado el plazo', async () => {
    const caso = await abrir(e.coordConvivencia, 'III');
    expect(comoCaso(await casos.obtenerCaso(caso._id, e.coordConvivencia)).alertas).toEqual([]);
    await CasoConvivencia.collection.updateOne({ _id: new Types.ObjectId(caso._id) }, { $set: { createdAt: new Date(Date.now() - 48 * 3_600_000) } });
    expect(comoCaso(await casos.obtenerCaso(caso._id, e.coordConvivencia)).alertas.map((a) => a.codigo)).toEqual(['REMISION_TIPO_III_PENDIENTE']);
    expect(await AuditLog.countDocuments({ accion: 'CONVIVENCIA_CASO_CONSULTADO' })).toBe(2);
  });

  it('los catálogos del caso no eliminan lo ya usado', async () => {
    const caso = await abrir();
    await avanzar(caso._id, 'EN_ATENCION');
    await casos.agregarRegistroCaso(caso._id, 'remisiones', { entidad_id: entidadId, fecha: hoy() }, e.coordConvivencia);
    await expect(catalogosCaso.eliminarEntidad(entidadId, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
    await expect(catalogosCaso.eliminarMedida(medidaId, actor(e.admin))).resolves.toBeUndefined();
  });
});
