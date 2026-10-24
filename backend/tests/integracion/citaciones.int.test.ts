import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Citacion from '../../src/models/citacion.model';
import CitacionDestinatario from '../../src/models/citacionDestinatario.model';
import CorreoEnCola from '../../src/models/correoEnCola.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import Notificacion from '../../src/models/notificacion.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import * as casos from '../../src/services/caso.service';
import { actualizarCitacion, cancelarCitacion, crearCitacion, detalleCitacion, listarCitaciones, reenviarCorreo } from '../../src/services/citacion.service';
import { citacionesDeHijo, consultarPorToken, responderDesdePortal, responderPorToken } from '../../src/services/citacionRespuesta.service';
import { procesarCola } from '../../src/services/colaCorreo.service';
import { fijarEnviadorCorreo, MensajeCorreo } from '../../src/services/correo.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario, hoy } from './escenario';

const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

// M24: citaciones a acudientes con correo en cola y respuesta desde el enlace del correo o el portal.
describe('Citaciones a acudientes', () => {
  let e: Escenario;
  let grupoId: string;
  let enviados: MensajeCorreo[];
  let fallar: boolean;
  let acudientePortal: UserDocument;

  const vincular = async (estudiante: UserDocument, email: string | undefined, extra: { user_id?: Types.ObjectId; principal?: boolean } = {}) => {
    const g = await Guardian.create({
      tipo_documento: 'CC',
      numero_documento: `9${Math.floor(Math.random() * 1e8)}`,
      nombre: 'Marta',
      apellido: 'Gómez',
      telefono_principal: '3001112233',
      email,
      user_id: extra.user_id ?? null,
    });
    await StudentGuardian.create({ student_id: estudiante._id, guardian_id: g._id, parentesco: 'MADRE', es_principal: extra.principal ?? true });
    return g;
  };

  beforeAll(async () => {
    await iniciarBaseDeDatos();
    await CitacionDestinatario.init();
  }, 600_000);
  afterAll(async () => {
    fijarEnviadorCorreo(null);
    await detenerBaseDeDatos();
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    grupoId = String((await Group.findOne({ nomenclatura: '601' }))!._id);
    enviados = [];
    fallar = false;
    fijarEnviadorCorreo(async (m) => {
      if (fallar) throw new Error('SMTP caído');
      enviados.push(m);
    });
    acudientePortal = await crearUsuario('ACUDIENTE');
    await vincular(e.estudiante, 'marta@correo.test', { user_id: acudientePortal._id as Types.ObjectId });
    await vincular(e.otroEstudiante, 'otra@correo.test');
    await vincular(e.tercerEstudiante, undefined); // sin correo
  });

  const nueva = (extra: Record<string, unknown> = {}) => ({
    tipo: 'GENERAL' as const,
    motivo: 'ENTREGA_BOLETINES' as const,
    titulo: 'Entrega de boletines',
    descripcion: 'Traer el desprendible.',
    fecha_hora: enDias(3),
    lugar: 'Salón 601',
    grupo_ids: [grupoId],
    ...extra,
  });

  it('el director cita a todo su grupo: un destinatario por acudiente, correos en cola sin enviarse al momento', async () => {
    const detalle = await crearCitacion(nueva(), e.directora);
    expect(detalle.destinatarios).toHaveLength(3);
    expect(detalle.destinatarios.map((d) => d.correo).sort()).toEqual(['EN_COLA', 'EN_COLA', 'SIN_CORREO']);
    expect(await CorreoEnCola.countDocuments({ estado: 'PENDIENTE' })).toBe(2);
    // Quien convoca no espera al SMTP: nada se envió todavía.
    expect(enviados).toHaveLength(0);
    // La familia con portal recibe además la campanita.
    expect(await Notificacion.countDocuments({ usuario_id: acudientePortal._id, evento: 'CITACION_NUEVA' })).toBe(1);
  });

  it('la cola envía el correo con fecha, convocante y el enlace de confirmación', async () => {
    await crearCitacion(nueva(), e.directora);
    expect(await procesarCola()).toBe(2);
    expect(enviados).toHaveLength(2);
    const correo = enviados.find((m) => m.para === 'marta@correo.test')!;
    expect(correo.asunto).toBe('Citación: Entrega de boletines');
    expect(correo.texto).toContain(`Convoca: ${e.directora.nombre} ${e.directora.apellido} (Docente)`);
    expect(correo.html).toContain('Confirmar asistencia');
    expect(correo.texto).toMatch(/\/citacion\/[0-9a-f]{32}/);
    expect((await detalleCitacion(String((await Citacion.findOne())!._id), e.directora)).destinatarios.filter((d) => d.correo === 'ENVIADO')).toHaveLength(2);
  });

  it('un fallo del SMTP se reintenta con espera y a los 5 intentos queda fallido y reenviable', async () => {
    const citacion = await crearCitacion(nueva(), e.directora);
    fallar = true;
    for (let i = 0; i < 5; i++) {
      await CorreoEnCola.updateMany({ estado: 'PENDIENTE' }, { proximo_intento: new Date(0) });
      await procesarCola();
    }
    expect(await CorreoEnCola.countDocuments({ estado: 'FALLIDO' })).toBe(2);
    const fallido = (await detalleCitacion(citacion._id, e.directora)).destinatarios.find((d) => d.correo === 'FALLIDO')!;
    expect(fallido.error_correo).toMatch(/SMTP/);

    fallar = false;
    await reenviarCorreo(citacion._id, fallido._id, e.directora);
    await procesarCola();
    expect(enviados).toHaveLength(1);
  });

  it('el acudiente responde desde el enlace del correo, sin sesión, y quien convocó recibe una alerta agrupada', async () => {
    await crearCitacion(nueva(), e.directora);
    const token = (await CitacionDestinatario.findOne({ student_id: e.estudiante._id }))!.token;

    const vista = await consultarPorToken(token);
    expect(vista).toMatchObject({ titulo: 'Entrega de boletines', estudiante: e.estudiante.nombre, respuesta: 'PENDIENTE', puede_responder: true });

    const respondida = await responderPorToken(token, 'CONFIRMADA');
    expect(respondida.respuesta).toBe('CONFIRMADA');
    await responderPorToken((await CitacionDestinatario.findOne({ student_id: e.otroEstudiante._id }))!.token, 'NO_ASISTIRA');
    const alerta = await Notificacion.findOne({ usuario_id: e.directora._id, evento: 'CITACION_RESPONDIDA' });
    expect(alerta!.contador).toBe(2);

    const lista = await listarCitaciones({ academic_year_id: String((await Citacion.findOne())!.academic_year_id) }, e.directora);
    expect(lista[0]).toMatchObject({ confirmados: 1, no_asistiran: 1, pendientes: 1 });
  });

  it('un token inventado o con mala forma responde 404', async () => {
    await expect(consultarPorToken('no-es-un-token')).rejects.toMatchObject({ statusCode: 404 });
    await expect(responderPorToken('a'.repeat(32), 'CONFIRMADA')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('la descripción de una citación particular no se ve con el enlace pero sí en el portal', async () => {
    await crearCitacion(nueva({ tipo: 'PARTICULAR', motivo: 'COMPORTAMENTAL', descripcion: 'Conversar sobre la agresión del lunes.', grupo_ids: undefined, student_id: String(e.estudiante._id) }), e.docenteDeClase);
    const token = (await CitacionDestinatario.findOne())!.token;
    expect((await consultarPorToken(token)).descripcion).toBe('');
    await procesarCola();
    expect(enviados[0]!.texto).not.toContain('agresión');
    expect((await citacionesDeHijo(acudientePortal, String(e.estudiante._id)))[0]!.descripcion).toContain('agresión');
  });

  it('el acudiente también responde desde el portal, y solo por su propio hijo', async () => {
    await crearCitacion(nueva(), e.directora);
    const [propia] = await citacionesDeHijo(acudientePortal, String(e.estudiante._id));
    const lista = await responderDesdePortal(acudientePortal, String(e.estudiante._id), propia!.destinatario_id, 'CONFIRMADA');
    expect(lista[0]!.respuesta).toBe('CONFIRMADA');
    await expect(citacionesDeHijo(acudientePortal, String(e.otroEstudiante._id))).rejects.toMatchObject({ statusCode: 404 });
    const ajeno = (await CitacionDestinatario.findOne({ student_id: e.otroEstudiante._id }))!;
    await expect(responderDesdePortal(acudientePortal, String(e.estudiante._id), String(ajeno._id), 'CONFIRMADA')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reprogramar pide confirmar de nuevo y reemplaza el correo que aún esperaba en la cola', async () => {
    const creada = await crearCitacion(nueva(), e.directora);
    const token = (await CitacionDestinatario.findOne({ student_id: e.estudiante._id }))!.token;
    await responderPorToken(token, 'CONFIRMADA');

    await actualizarCitacion(creada._id, { fecha_hora: enDias(5) }, e.directora);
    expect((await consultarPorToken(token)).respuesta).toBe('PENDIENTE');
    expect((await Citacion.findById(creada._id))!.version).toBe(2);

    await procesarCola();
    // Solo salió el correo de la reprogramación: el de la citación original quedó omitido.
    expect(enviados.map((m) => m.asunto)).toEqual(expect.arrayContaining([expect.stringMatching(/reprogramada/)]));
    expect(enviados.some((m) => /^Citación: /.test(m.asunto))).toBe(false);
    expect(await CorreoEnCola.countDocuments({ estado: 'OMITIDO' })).toBe(2);
  });

  it('cancelar avisa por correo solo a quien ya había recibido la invitación y cierra las respuestas', async () => {
    const creada = await crearCitacion(nueva(), e.directora);
    await CorreoEnCola.updateOne({ para: 'marta@correo.test' }, { estado: 'ENVIADO' });
    await cancelarCitacion(creada._id, 'Se aplaza por lluvia', e.directora);
    await procesarCola();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: 'marta@correo.test' });
    expect(enviados[0]!.asunto).toMatch(/cancelada/);
    const token = (await CitacionDestinatario.findOne({ student_id: e.estudiante._id }))!.token;
    await expect(responderPorToken(token, 'CONFIRMADA')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('un docente que no dirige el grupo no lo cita completo, pero sí a un estudiante suyo', async () => {
    await expect(crearCitacion(nueva(), e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(crearCitacion(nueva({ tipo: 'PARTICULAR', grupo_ids: undefined, student_id: String(e.estudiante._id) }), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    await expect(crearCitacion(nueva({ tipo: 'PARTICULAR', motivo: 'ACADEMICO', grupo_ids: undefined, student_id: String(e.estudiante._id) }), e.docenteDeClase)).resolves.toBeDefined();
    // Coordinación sí cita al grupo completo.
    await expect(crearCitacion(nueva(), e.coordAcademico)).resolves.toBeDefined();
  });

  it('cada docente ve solo lo que convocó; coordinación ve todo', async () => {
    const mia = await crearCitacion(nueva(), e.directora);
    const anio = String((await Citacion.findOne())!.academic_year_id);
    expect(await listarCitaciones({ academic_year_id: anio }, e.directora)).toHaveLength(1);
    expect(await listarCitaciones({ academic_year_id: anio }, e.docenteDeClase)).toHaveLength(0);
    await expect(detalleCitacion(mia._id, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 404 });
    expect(await listarCitaciones({ academic_year_id: anio }, e.coordAcademico)).toHaveLength(1);
  });

  it('rechaza fechas pasadas y grupos de otra sede', async () => {
    await expect(crearCitacion(nueva({ fecha_hora: new Date(Date.now() - 3600_000).toISOString() }), e.directora)).rejects.toMatchObject({ statusCode: 400 });
    const matricula = (await Enrollment.findOne())!;
    const otroGrupo = await Group.create({
      sede_id: new Types.ObjectId(),
      academic_year_id: matricula.academic_year_id,
      grade_id: (await Group.findById(grupoId))!.grade_id,
      jornada_id: (await Group.findById(grupoId))!.jornada_id,
      nomenclatura: '602',
      max_capacity: 30,
    });
    await expect(crearCitacion(nueva({ grupo_ids: [grupoId, String(otroGrupo._id)] }), e.admin)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('sin correo configurado la citación se crea igual, no encola nada y lo avisa', async () => {
    fijarEnviadorCorreo(null);
    const detalle = await crearCitacion(nueva(), e.directora);
    expect(detalle.advertencia_correo).toMatch(/SMTP_HOST|PUBLIC_URL|CORREO_REMITENTE/);
    expect(detalle.destinatarios.every((d) => d.correo !== 'EN_COLA')).toBe(true);
    expect(await CorreoEnCola.countDocuments()).toBe(0);
  });

  describe('orientación y coordinación de convivencia citan a los acudientes', () => {
    const particular = (estudiante: UserDocument, extra: Record<string, unknown> = {}) => ({
      tipo: 'PARTICULAR' as const,
      motivo: 'ORIENTACION_CONVIVENCIA' as const,
      titulo: 'Citación de orientación',
      descripcion: 'Hechos que solo debe ver el acudiente en el portal.',
      fecha_hora: enDias(2),
      lugar: 'Oficina de orientación',
      student_id: String(estudiante._id),
      ...extra,
    });
    const abrirCaso = async () =>
      (await casos.abrirCaso(
        {
          tipo_situacion: 'II',
          fecha_hora: undefined,
          fecha_hecho: hoy(),
          hechos: 'Discusión en el patio durante el descanso.',
          involucrados: [{ student_id: String(e.estudiante._id), rol: 'PRESUNTO_RESPONSABLE' as const }],
        } as unknown as casos.AbrirCasoInput,
        e.coordConvivencia
      )) as unknown as { _id: string };

    it('el orientador cita al acudiente de un estudiante de su sede y el correo lo presenta como Orientación', async () => {
      const detalle = await crearCitacion(particular(e.estudiante), e.orientador);
      expect(detalle.destinatarios).toHaveLength(1);
      await procesarCola();
      const correo = enviados.find((m) => m.para === 'marta@correo.test')!;
      expect(correo.texto).toContain('(Orientación)');
      // La descripción de una citación particular no viaja por correo.
      expect(correo.texto).not.toContain('Hechos que solo');
      // Cada quien ve solo lo que convocó.
      await expect(detalleCitacion(detalle._id, e.orientadorColega)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('no cita a todo un grupo ni a un estudiante de una sede que no tiene asignada', async () => {
      await expect(crearCitacion(nueva(), e.orientador)).rejects.toMatchObject({ statusCode: 403 });
      await expect(crearCitacion(nueva(), e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
      await expect(crearCitacion(particular(e.estudiante), e.orientadorOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(crearCitacion(particular(e.estudiante), e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('convivencia enlaza la citación a un caso: aparece en el caso y el estudiante debe ser parte de él', async () => {
      const caso = await abrirCaso();
      const detalle = await crearCitacion(particular(e.estudiante, { caso_id: caso._id }), e.coordConvivencia);
      const vista = (await casos.obtenerCaso(caso._id, e.coordConvivencia)) as unknown as { citaciones: { _id: string; titulo: string; estado: string }[] };
      expect(vista.citaciones).toEqual([expect.objectContaining({ _id: detalle._id, titulo: 'Citación de orientación', estado: 'PROGRAMADA' })]);

      // Un estudiante ajeno al caso, una citación general o quien no ve el caso no pueden enlazarlo.
      await expect(crearCitacion(particular(e.otroEstudiante, { caso_id: caso._id }), e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
      await expect(crearCitacion(nueva({ caso_id: caso._id }), e.coordConvivencia)).rejects.toMatchObject({ statusCode: 403 });
      await expect(crearCitacion(particular(e.estudiante, { caso_id: caso._id }), e.orientador)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

});
