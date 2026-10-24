import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CasoConvivencia from '../../src/models/casoConvivencia.model';
import Guardian from '../../src/models/guardian.model';
import Notificacion from '../../src/models/notificacion.model';
import Observacion from '../../src/models/observacion.model';
import SolicitudCaso from '../../src/models/solicitudCaso.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import * as casos from '../../src/services/caso.service';
import * as catalogosCaso from '../../src/services/casoCatalogo.service';
import * as observaciones from '../../src/services/observacion.service';
import * as solicitudes from '../../src/services/solicitudCaso.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, crearUsuario, Escenario, hoy } from './escenario';

type Caso = Awaited<ReturnType<typeof casos.abrirCaso>>;
const comoCaso = (c: unknown) => c as Caso & { _id: string; codigo: string; origen: string; contencion_reportada: string; estado: string; tipo_situacion: string; pasos: { _id: string; nombre: string; estado: string }[]; alertas: { codigo: string }[] };

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

  // El docente solo reporta: nombra a los estudiantes y cuenta qué hizo; no tipifica ni asigna roles.
  const faltaGrave = () =>
    observaciones.reportarSituacionGrave(
      {
        fecha_hecho: hoy(),
        hechos: 'Detalle reservado de una agresión.',
        acciones_contencion: 'Se separó a los estudiantes.',
        estudiantes_ids: [String(e.estudiante._id), String(e.otroEstudiante._id)],
      },
      e.docenteDeClase
    );
  // Coordinación asigna el rol de cada estudiante al abrir el caso desde el reporte.
  const rolesDelReporte = () => [
    { student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' as const },
    { student_id: String(e.otroEstudiante._id), rol: 'AFECTADO' as const },
  ];
  const bandeja = async () => (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, { pagina: 1, limite: 20 })).data;

  it('convierte el reporte urgente: coordinación tipifica y asigna roles; el caso hereda hechos y contención, y el docente ve su estado', async () => {
    await faltaGrave();
    const [pendiente] = await bandeja();
    expect(pendiente).toMatchObject({ gravedad: null, falta: null, hechos: 'Detalle reservado de una agresión.' });
    expect(pendiente!.involucrados.map((i) => i.rol)).toEqual([null, null]);

    // Sin roles no se abre: el docente no los asigna, así que coordinación debe hacerlo.
    await expect(abrir(e.coordConvivencia, 'II', { involucrados: undefined, solicitud_id: pendiente!._id })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('rol') });

    const caso = await abrir(e.coordConvivencia, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id });
    expect(caso).toMatchObject({ origen: 'SOLICITUD', contencion_reportada: 'Se separó a los estudiantes.' });
    expect((caso as { involucrados: { rol: string }[] }).involucrados.map((i) => i.rol).sort()).toEqual(['AFECTADO', 'PRESUNTO_RESPONSABLE']);
    expect(await bandeja()).toHaveLength(0);

    const guardada = await SolicitudCaso.findById(pendiente!._id);
    expect(guardada).toMatchObject({ estado: 'CONVERTIDA' });
    expect(String(guardada!.caso_id)).toBe(String(caso._id));

    // Quien reportó ve el estado de su reporte y el código del caso, nunca el expediente.
    const [mio] = (await observaciones.misReportesUrgentes(e.docenteDeClase, { pagina: 1, limite: 20 })).data;
    expect(mio).toMatchObject({ estado: 'CONVERTIDA', caso: { codigo: caso.codigo, estado: 'ABIERTO' } });
    expect(JSON.stringify(mio)).not.toContain('involucrados');
    // Los reportes de otro docente no se mezclan.
    expect((await observaciones.misReportesUrgentes(e.docenteAjeno, { pagina: 1, limite: 20 })).data).toHaveLength(0);
  });

  it('un reporte urgente no deja antecedente en el Observador de nadie, ni del presunto ni del afectado', async () => {
    await faltaGrave();
    const [pendiente] = await bandeja();
    await abrir(e.coordConvivencia, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id });
    expect(await Observacion.countDocuments()).toBe(0);
    for (const estudiante of [e.estudiante, e.otroEstudiante]) {
      expect(await observaciones.miObservador(estudiante)).toHaveLength(0);
      expect((await observaciones.historialDeEstudiante(String(estudiante._id), e.coordConvivencia, { pagina: 1, limite: 20 })).data).toHaveLength(0);
    }
  });

  it('un registro anterior de una falta grave solo muestra al estudiante que hay una situación y el estado del caso, nunca la falta ni los hechos', async () => {
    // Registros creados antes del reporte urgente: una falta II con su solicitud.
    const { registros } = await observaciones.registrarFalta(
      { falta_id: e.faltaI, fecha_hecho: hoy(), hechos: 'Detalle reservado de una agresión.', estudiantes_ids: [String(e.estudiante._id)], escalar_a_coordinacion: true },
      e.docenteDeClase
    );
    await Observacion.updateOne({ _id: registros[0]!._id }, { $set: { 'falta.gravedad': 'II', 'falta.codigo': '3.3', 'falta.descripcion': 'Agrede físicamente.' } });
    const enRevision = await observaciones.miObservador(e.estudiante);
    expect(enRevision).toEqual([expect.objectContaining({ clase: 'FALTA', gravedad: 'II', tipo_nombre: 'Situación de convivencia', situacion: 'EN_REVISION' })]);

    const [pendiente] = await bandeja();
    await abrir(e.coordConvivencia, 'II', { solicitud_id: pendiente!._id });
    const conCaso = await observaciones.miObservador(e.estudiante);
    expect(conCaso[0]).toMatchObject({ situacion: 'ABIERTO' });
    expect(JSON.stringify(conCaso)).not.toMatch(/Detalle reservado|3\.3|Agrede/);
  });

  it('una solicitud ajena o ya atendida no se puede convertir otra vez', async () => {
    await faltaGrave();
    const [pendiente] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, { pagina: 1, limite: 20 })).data;
    await expect(abrir(e.coordConvivenciaOtraSede, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id })).rejects.toMatchObject({ statusCode: 404 });
    await abrir(e.coordConvivencia, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id });
    await expect(abrir(e.coordConvivencia, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id })).rejects.toMatchObject({ statusCode: 404 });
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

    await expect(casos.registrarDecision(caso._id, { motivacion, faltas_ids: [e.faltaI] }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    await casos.agregarRegistroCaso(caso._id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.estudiante._id), fecha: hoy(), texto: 'Dice que fue un malentendido.' }, e.coordConvivencia);
    await expect(
      casos.agregarRegistroCaso(caso._id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.otroEstudiante._id), fecha: hoy(), texto: 'No está involucrado.' }, e.coordConvivencia)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await casos.registrarDecision(caso._id, { motivacion, faltas_ids: [e.faltaI] }, e.coordConvivencia)).toMatchObject({ decision: { faltas: [{ codigo: '1.3', gravedad: 'I' }] } });

    const cerrar = () => casos.cerrarCaso(caso._id, { resultado: 'MEDIDA_APLICADA', motivo: 'Se aplicó la medida.' }, e.coordConvivencia);
    await expect(cerrar()).rejects.toMatchObject({ statusCode: 409 });
    await expect(casos.agregarRegistroCaso(caso._id, 'medidas-aplicadas', { medida_id: medidaPorDiasId, fecha: hoy() }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
    await casos.agregarRegistroCaso(caso._id, 'medidas-aplicadas', { medida_id: medidaPorDiasId, fecha: hoy(), dias: 2 }, e.coordConvivencia);
    expect(await cerrar()).toMatchObject({ estado: 'CERRADO' });
  });

  it('no se aplica una medida antes de oír los descargos', async () => {
    const caso = await abrir();
    await avanzar(caso._id, 'EN_ATENCION');
    const aplicar = () => casos.agregarRegistroCaso(caso._id, 'medidas-aplicadas', { medida_id: medidaId, fecha: hoy() }, e.coordConvivencia);
    await expect(aplicar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('descargos') });

    await casos.agregarRegistroCaso(caso._id, 'descargos', { parte: 'ESTUDIANTE', student_id: String(e.estudiante._id), fecha: hoy(), texto: 'Dice que fue un malentendido.' }, e.coordConvivencia);
    expect(await aplicar()).toMatchObject({ medidas_aplicadas: [expect.objectContaining({ nombre: 'Taller formativo' })] });
  });

  it('un paso obligatorio solo se omite con una justificación; uno opcional, sin ella', async () => {
    const caso = await abrir();
    const [obligatorio, opcional] = caso.pasos;
    const omitir = (paso: { _id: string }, nota?: string) => casos.actualizarPaso(caso._id, paso._id, { estado: 'NO_APLICA', nota }, e.coordConvivencia);

    await expect(omitir(obligatorio!)).rejects.toMatchObject({ statusCode: 400 });
    await expect(omitir(obligatorio!, 'no')).rejects.toMatchObject({ statusCode: 400 });
    expect(await omitir(obligatorio!, 'Ya se dialogó con el estudiante antes.')).toMatchObject({ pasos: [expect.objectContaining({ estado: 'NO_APLICA' }), expect.anything()] });
    expect(await omitir(opcional!)).toMatchObject({ pasos: [expect.anything(), expect.objectContaining({ estado: 'NO_APLICA' })] });
  });

  it('los casos se buscan por parte de su código, sin que los caracteres especiales rompan la consulta', async () => {
    await abrir();
    await abrir();
    const pagina = { pagina: 1, limite: 20 };
    expect((await casos.listarCasos(e.coordConvivencia, { codigo: 'CC-' }, pagina)).data).toHaveLength(2);
    expect((await casos.listarCasos(e.coordConvivencia, { codigo: '0002' }, pagina)).data.map((c) => c.codigo)).toEqual([expect.stringMatching(/-0002$/)]);
    expect((await casos.listarCasos(e.coordConvivencia, { codigo: '.*' }, pagina)).data).toHaveLength(0);
    expect((await casos.listarCasos(e.coordConvivenciaOtraSede, { codigo: 'CC-' }, pagina)).data).toHaveLength(0);
  });

  describe('aviso a las familias (Decreto 1965, arts. 43 y 44)', () => {
    const conAcudiente = async (estudiante: UserDocument, documento: string) => {
      const acudiente = await crearUsuario('ACUDIENTE');
      const ficha = await Guardian.create({ tipo_documento: 'CC', numero_documento: documento, nombre: 'Marta', apellido: 'Morales', telefono_principal: '3000000000', user_id: acudiente._id });
      await StudentGuardian.create({ student_id: estudiante._id, guardian_id: ficha._id, parentesco: 'MADRE', es_principal: true });
      return acudiente;
    };
    const alertasDe = (acudiente: UserDocument) => Notificacion.find({ usuario_id: acudiente._id, evento: 'FALTA_GRAVE' });
    const involucrados = () => [
      { student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' as const },
      { student_id: String(e.otroEstudiante._id), rol: 'AFECTADO' as const },
      { student_id: String(e.tercerEstudiante._id), rol: 'TESTIGO' as const },
    ];

    it('al abrir un caso tipo II avisa, sin detalle, a la familia del afectado y a la del presunto responsable, no a la del testigo', async () => {
      const delPresunto = await conAcudiente(e.estudiante, '5001');
      const delAfectado = await conAcudiente(e.otroEstudiante, '5002');
      const delTestigo = await conAcudiente(e.tercerEstudiante, '5003');
      await abrir(e.coordConvivencia, 'II', { involucrados: involucrados() });

      for (const acudiente of [delPresunto, delAfectado]) {
        const alertas = await alertasDe(acudiente);
        expect(alertas).toHaveLength(1);
        expect(alertas[0]).toMatchObject({ severidad: 'CRITICA', ruta: '/portal', leida: false });
        expect(JSON.stringify(alertas)).not.toContain('Discusión en el patio');
      }
      expect(await alertasDe(delTestigo)).toHaveLength(0);
    });

    it('un caso tipo I no avisa a las familias; si sube a tipo II, en ese momento sí', async () => {
      const delPresunto = await conAcudiente(e.estudiante, '5001');
      const caso = await abrir(e.coordConvivencia, 'I', { involucrados: involucrados() });
      expect(await alertasDe(delPresunto)).toHaveLength(0);

      await casos.reclasificarCaso(caso._id, 'II', 'Hay daño a la salud de un estudiante.', e.coordConvivencia);
      expect(await alertasDe(delPresunto)).toHaveLength(1);
      // Pasar de II a III no vuelve a avisar: la familia ya fue informada.
      await casos.reclasificarCaso(caso._id, 'III', 'Se configura un posible delito.', e.coordConvivencia);
      expect((await alertasDe(delPresunto))[0]).toMatchObject({ contador: 1 });
    });
  });

  it('los motivos largos (hasta 1000 caracteres) caben en la solicitud descartada y en el impedimento', async () => {
    await faltaGrave();
    const [pendiente] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, { pagina: 1, limite: 20 })).data;
    await expect(solicitudes.descartarSolicitud(pendiente!._id, 'm'.repeat(900), e.coordConvivencia)).resolves.toMatchObject({ estado: 'DESCARTADA' });
    const caso = await abrir();
    await expect(casos.declararImpedimento(caso._id, { motivo: 'm'.repeat(900) }, e.coordConvivencia)).resolves.toMatchObject({ apartado: true });
  });

  it('solo un ADMIN reabre (con motivo) o anula; anular devuelve la solicitud a la bandeja', async () => {
    await faltaGrave();
    const [pendiente] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, { pagina: 1, limite: 20 })).data;
    const caso = await abrir(e.coordConvivencia, 'II', { involucrados: rolesDelReporte(), solicitud_id: pendiente!._id });

    await expect(casos.anularCaso(caso._id, 'Error de apertura.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
    expect(await casos.anularCaso(caso._id, 'Error de apertura.', e.admin)).toMatchObject({ estado: 'ANULADO' });
    expect((await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, { pagina: 1, limite: 20 })).data).toHaveLength(1);

    const otro = await abrir();
    await avanzar(otro._id, 'EN_ATENCION');
    await casos.actualizarPaso(otro._id, otro.pasos[0]!._id, { estado: 'NO_APLICA', nota: 'Ya se dialogó con el estudiante antes.' }, e.coordConvivencia);
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
