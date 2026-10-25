import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AuditLog from '../../src/models/auditLog.model';
import Insignia from '../../src/models/insignia.model';
import Notificacion from '../../src/models/notificacion.model';
import Observacion from '../../src/models/observacion.model';
import SolicitudCaso from '../../src/models/solicitudCaso.model';
import { User, UserDocument } from '../../src/models/user.model';
import { hoyColombia } from '../../src/services/attendance.service';
import * as catalogoCaso from '../../src/services/casoCatalogo.service';
import * as catalogo from '../../src/services/convivenciaCatalogo.service';
import * as observaciones from '../../src/services/observacion.service';
import * as solicitudes from '../../src/services/solicitudCaso.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, Escenario, hoy } from './escenario';

const PAGINA = { pagina: 1, limite: 20 };
type Vista = Record<string, unknown> & { _id: string };

describe('M14 observaciones y faltas (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Observacion.syncIndexes(), User.syncIndexes()]);
    e = await armarEscenario();
  }, 60_000);

  const id = (u: UserDocument) => String(u._id);
  const registrar = (usuario: UserDocument, estudiantes: string[], extra: Partial<observaciones.RegistrarObservacionInput> = {}) =>
    observaciones.registrarObservacion(
      { estudiantes_ids: estudiantes, tipo_id: e.tipoComportamental, descripcion: 'Participa con respeto.', fecha_hecho: hoy(), ...extra },
      usuario
    );
  const registrarFalta = (usuario: UserDocument, extra: Partial<observaciones.RegistrarFaltaInput> = {}) =>
    observaciones.registrarFalta(
      {
        falta_id: e.faltaI,
        fecha_hecho: hoy(),
        hechos: 'Llegó diez minutos tarde a clase.',
        estudiantes_ids: [id(e.estudiante)],
        ...extra,
      },
      usuario
    );
  const reportar = (usuario: UserDocument, extra: Partial<observaciones.ReporteUrgenteInput> = {}) =>
    observaciones.reportarSituacionGrave(
      {
        fecha_hecho: hoy(),
        hechos: 'Agresión física durante el descanso.',
        acciones_contencion: 'Se separó a los estudiantes y se llevó a uno a enfermería.',
        estudiantes_ids: [id(e.estudiante), id(e.otroEstudiante)],
        ...extra,
      },
      usuario
    );
  const historial = (estudiante: UserDocument, usuario: UserDocument) => observaciones.historialDeEstudiante(id(estudiante), usuario, PAGINA);

  describe('observación (cotidiana)', () => {
    it('un docente registra en un grupo que dicta y en uno que dirige, y no en uno ajeno', async () => {
      const [deClase] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      expect(deClase).toMatchObject({ clase: 'OBSERVACION', contexto: 'CLASE', descripcion: 'Participa con respeto.', confidencial: false, compromiso_estado: null });
      const [comoDirectora] = await registrar(e.directora, [id(e.estudiante)]);
      expect(comoDirectora).toMatchObject({ contexto: 'DIRECCION_GRUPO' });

      await expect(registrar(e.docenteAjeno, [id(e.estudiante)])).rejects.toMatchObject({ statusCode: 404 });
    });

    it('un registro grupal crea uno por estudiante con el mismo evento, o ninguno', async () => {
      const creadas = await registrar(e.docenteDeClase, [id(e.estudiante), id(e.otroEstudiante)]);
      expect(creadas).toHaveLength(2);
      expect(new Set(creadas.map((o) => o.evento_id)).size).toBe(1);

      const total = await Observacion.countDocuments();
      await expect(registrar(e.docenteAjeno, [id(e.estudiante)])).rejects.toBeDefined();
      expect(await Observacion.countDocuments()).toBe(total);
    });

    it('exige describir los hechos, un tipo vigente y una fecha no futura', async () => {
      await expect(registrar(e.docenteDeClase, [id(e.estudiante)], { descripcion: '   ' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrar(e.docenteDeClase, [id(e.estudiante)], { fecha_hecho: '2999-01-01' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrar(e.docenteDeClase, [id(e.estudiante)], { tipo_id: String(new Types.ObjectId()) })).rejects.toMatchObject({ statusCode: 400 });
      await catalogo.cambiarEstadoTipo(e.tipoAcademica, 'inactivo', actor(e.admin));
      await expect(registrar(e.docenteDeClase, [id(e.estudiante)], { tipo_id: e.tipoAcademica })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el compromiso es texto opcional y la citación un indicador', async () => {
      const [simple] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      expect(simple).toMatchObject({ compromiso: '', compromiso_estado: null, requiere_citacion: false });
      const [completa] = await registrar(e.docenteDeClase, [id(e.estudiante)], { compromiso: 'Entregará el taller el lunes.', requiere_citacion: true });
      expect(completa).toMatchObject({ compromiso: 'Entregará el taller el lunes.', compromiso_estado: 'PENDIENTE', requiere_citacion: true, citacion_realizada: null });
    });

    it('la versión del estudiante se guarda con la observación y se puede enmendar', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)], { descripcion: 'Discusión en clase.', version_estudiante: 'Dice que le quitaron el cuaderno.' });
      expect(obs).toMatchObject({ clase: 'OBSERVACION', version_estudiante: 'Dice que le quitaron el cuaderno.' });
      const enmendada = await observaciones.enmendarObservacion(obs!._id, { version_estudiante: 'Dice que fue un malentendido.' }, e.docenteDeClase);
      expect(enmendada).toMatchObject({ version_estudiante: 'Dice que fue un malentendido.', cantidad_enmiendas: 1 });
      const [sin] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      expect(sin).toMatchObject({ version_estudiante: '' });
    });

    it('una observación confidencial la ven su autor, orientación y convivencia; no el director ni el coordinador académico', async () => {
      const [conf] = await registrar(e.docenteDeClase, [id(e.estudiante)], { confidencial: true, descripcion: 'Dato sensible de la familia.' });
      await registrar(e.docenteDeClase, [id(e.estudiante)], { descripcion: 'Una observación común.' });

      for (const quien of [e.orientador, e.coordConvivencia, e.admin]) {
        expect((await historial(e.estudiante, quien)).data, quien.rol).toHaveLength(2);
      }
      for (const quien of [e.directora, e.coordAcademico]) {
        const visibles = (await historial(e.estudiante, quien)).data;
        expect(visibles, quien.rol).toHaveLength(1);
        expect(JSON.stringify(visibles)).not.toContain('Dato sensible');
        expect((await historial(e.estudiante, quien)).total).toBe(1);
      }
      await expect(observaciones.obtenerObservacion(conf!._id, e.directora)).rejects.toMatchObject({ statusCode: 404 });
      await expect(observaciones.obtenerObservacion(conf!._id, e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
      await expect(observaciones.obtenerObservacion(conf!._id, e.orientador)).resolves.toMatchObject({ descripcion: 'Dato sensible de la familia.' });
      expect(await observaciones.obtenerObservacion(conf!._id, e.docenteDeClase)).toMatchObject({ confidencial: true });
    });

    it('lo que escribe orientación es siempre confidencial, aunque no lo marque', async () => {
      const [seguimiento] = await registrar(e.orientador, [id(e.estudiante)], { descripcion: 'Entrevista de orientación.', confidencial: false });
      expect(seguimiento).toMatchObject({ contexto: 'ORIENTACION', confidencial: true });
      expect((await historial(e.estudiante, e.directora)).data).toHaveLength(0);
      await expect(
        observaciones.enmendarObservacion(seguimiento!._id, { confidencial: false }, e.orientador)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el seguimiento psicosocial de orientación solo lo leen su autor y el ADMIN; ni convivencia ni otro orientador de la sede', async () => {
      const colega = e.orientadorColega;
      const [seguimiento] = await registrar(e.orientador, [id(e.estudiante)], { descripcion: 'Entrevista psicosocial reservada.' });

      expect((await historial(e.estudiante, e.orientador)).data).toHaveLength(1);
      expect((await historial(e.estudiante, e.admin)).data).toHaveLength(1);
      for (const quien of [colega, e.coordConvivencia]) {
        expect((await historial(e.estudiante, quien)).data, quien.rol).toHaveLength(0);
        await expect(observaciones.obtenerObservacion(seguimiento!._id, quien)).rejects.toMatchObject({ statusCode: 404 });
        await expect(observaciones.agregarSeguimiento(seguimiento!._id, 'Nota ajena.', quien)).rejects.toMatchObject({ statusCode: 404 });
        await expect(observaciones.enmendarObservacion(seguimiento!._id, { descripcion: 'Cambio ajeno.' }, quien)).rejects.toMatchObject({ statusCode: 404 });
        await expect(observaciones.anularObservacion(seguimiento!._id, 'No corresponde.', quien)).rejects.toMatchObject({ statusCode: 404 });
      }
      // Ni siquiera un ADMIN le quita la confidencialidad: la regla es del contexto, no de quien edita.
      await expect(observaciones.enmendarObservacion(seguimiento!._id, { confidencial: false }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('la nota de un compromiso cerrado cabe aunque use los 500 caracteres permitidos', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)], { compromiso: 'Entregará el taller.' });
      await expect(observaciones.marcarCompromiso(obs!._id, 'INCUMPLIDO', 'n'.repeat(500), e.docenteDeClase)).resolves.toMatchObject({ compromiso_estado: 'INCUMPLIDO' });
    });

    it('orientación solo ve y registra sobre los estudiantes de su sede', async () => {
      const otraSede = await User.findById(e.coordConvivenciaOtraSede._id);
      const orientadorAjeno = new User({ nombre: 'Otra', apellido: 'Sede', tipo_documento: 'CC', numero_documento: '777', email: 'o@x.test', rol: 'ORIENTADOR', sedes_ids: otraSede!.sedes_ids });
      orientadorAjeno.password = 'Clave-segura-1';
      await orientadorAjeno.save();
      await expect(registrar(orientadorAjeno, [id(e.estudiante)])).rejects.toMatchObject({ statusCode: 404 });
      await expect(historial(e.estudiante, orientadorAjeno)).rejects.toMatchObject({ statusCode: 404 });
      await expect(observaciones.buscarEstudiantes(orientadorAjeno, { q: 'Apellido' })).resolves.toHaveLength(0);
      expect((await observaciones.buscarEstudiantes(e.orientador, { q: 'Apellido' })).length).toBeGreaterThan(0);
    });

    it('un docente sin relación con el estudiante no ve su historial; el director sí; secretaría no entra', async () => {
      await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await expect(historial(e.estudiante, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 404 });
      await expect(historial(e.estudiante, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
      await expect(historial(e.estudiante, e.secretaria)).rejects.toMatchObject({ statusCode: 404 });
      expect((await historial(e.estudiante, e.directora)).data).toHaveLength(1);
    });

    it('un coordinador de convivencia de otra sede no ve al estudiante (respuesta 404 uniforme)', async () => {
      await expect(historial(e.estudiante, e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404, message: 'Estudiante no encontrado.' });
      await expect(observaciones.historialDeEstudiante('000000000000000000000000', e.coordConvivencia, PAGINA)).rejects.toMatchObject({ statusCode: 404, message: 'Estudiante no encontrado.' });
    });

    it('el estudiante ve las observaciones visibles y no confidenciales y sus faltas Tipo I, con solo el texto final', async () => {
      await catalogo.actualizarTipo(e.tipoAcademica, { visible_estudiante: false }, actor(e.admin));
      await registrar(e.docenteDeClase, [id(e.estudiante)], { descripcion: 'Visible para el estudiante.' });
      await registrar(e.docenteDeClase, [id(e.estudiante)], { tipo_id: e.tipoAcademica, descripcion: 'Tipo no visible.' });
      await registrar(e.docenteDeClase, [id(e.estudiante)], { descripcion: 'Confidencial.', confidencial: true });
      await registrarFalta(e.docenteDeClase);
      await registrar(e.docenteDeClase, [id(e.otroEstudiante)], { descripcion: 'De otro estudiante.' });

      const propias = await observaciones.miObservador(e.estudiante);
      expect(propias).toHaveLength(2);
      const observacion = propias.find((p) => p.clase === 'OBSERVACION')!;
      expect(Object.keys(observacion).sort()).toEqual(['_id', 'clase', 'descripcion', 'fecha_hecho', 'periodo_numero', 'tipo_nombre']);
      expect(propias.find((p) => p.clase === 'FALTA')).toMatchObject({
        tipo_nombre: 'Falta 1.3',
        gravedad: 'I',
        falta: { codigo: '1.3' },
        descripcion: 'Llegó diez minutos tarde a clase.',
      });
      expect(JSON.stringify(propias)).not.toContain('Confidencial.');
      await expect(observaciones.miObservador(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('enmendar conserva la versión anterior y el autor pierde el derecho pasado el plazo', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)], { compromiso: 'Llevará el carné.' });
      const enmendada = await observaciones.enmendarObservacion(obs!._id, { descripcion: 'Texto corregido.', compromiso: '' }, e.docenteDeClase);
      expect(enmendada).toMatchObject({ descripcion: 'Texto corregido.', compromiso: '', compromiso_estado: null, cantidad_enmiendas: 1 });
      const guardada = await Observacion.findById(obs!._id);
      expect(guardada!.enmiendas[0]).toMatchObject({ descripcion_anterior: 'Participa con respeto.', compromiso_anterior: 'Llevará el carné.' });

      // `createdAt` es inmutable para Mongoose: se envejece el registro directamente en la colección.
      await Observacion.collection.updateOne({ _id: new Types.ObjectId(obs!._id) }, { $set: { createdAt: new Date(Date.now() - 100 * 3_600_000) } });
      await expect(observaciones.enmendarObservacion(obs!._id, { descripcion: 'Tarde.' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(observaciones.enmendarObservacion(obs!._id, { descripcion: 'Convivencia sí puede.' }, e.coordConvivencia)).resolves.toBeDefined();
      await expect(observaciones.enmendarObservacion(obs!._id, { descripcion: 'No es suyo.' }, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('una falta no admite campos de una observación (confidencialidad ni citación)', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase);
      await expect(observaciones.enmendarObservacion(registros[0]!._id, { confidencial: true }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('anular exige motivo, es terminal y deja de verse para quien no es de convivencia', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      expect(await observaciones.anularObservacion(obs!._id, 'Estudiante equivocado.', e.docenteDeClase)).toMatchObject({ estado: 'ANULADA' });

      await expect(observaciones.enmendarObservacion(obs!._id, { descripcion: 'x' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
      expect((await historial(e.estudiante, e.directora)).data).toHaveLength(0);
      expect((await historial(e.estudiante, e.coordConvivencia)).data).toHaveLength(1);
    });

    it('no se registra ni se modifica con el año cerrado', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await AcademicYear.updateMany({}, { estado: 'CERRADO' });
      await expect(registrar(e.docenteDeClase, [id(e.estudiante)])).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.anularObservacion(obs!._id, 'Motivo válido.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.agregarSeguimiento(obs!._id, 'Una nota.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('la lectura del historial y del detalle queda en la auditoría', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await historial(e.estudiante, e.coordConvivencia);
      await observaciones.obtenerObservacion(obs!._id, e.coordConvivencia);
      expect(await AuditLog.countDocuments({ accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO' })).toBe(2);
    });

    it('el buscador solo trae estudiantes de los grupos del usuario', async () => {
      expect((await observaciones.buscarEstudiantes(e.docenteDeClase, { q: 'Apellido' })).length).toBeGreaterThan(0);
      expect(await observaciones.buscarEstudiantes(e.docenteAjeno, { q: 'Apellido' })).toHaveLength(0);
      expect(await observaciones.buscarEstudiantes(e.coordConvivenciaOtraSede, { q: 'Apellido' })).toHaveLength(0);
      expect(await observaciones.buscarEstudiantes(e.coordConvivencia, { q: 'ap' })).toHaveLength(0);
    });

    it('un tipo usado no se elimina, se desactiva; uno sin usar sí', async () => {
      await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await expect(catalogo.eliminarTipo(e.tipoComportamental, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
      await expect(catalogo.eliminarTipo(e.tipoAcademica, actor(e.admin))).resolves.toBeUndefined();
      const { tipos, faltas } = await catalogo.listarCatalogo(false);
      expect(tipos.map((t) => t.nombre)).toEqual(['Comportamental']);
      expect(faltas.map((f) => f.codigo)).toEqual(['1.3', '3.3', '4.3']);
    });
  });

  describe('seguimiento', () => {
    it('el autor, el director, convivencia y orientación agregan notas a lo que pueden ver; un docente ajeno no', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      for (const quien of [e.docenteDeClase, e.directora, e.coordConvivencia, e.orientador, e.coordAcademico, e.admin]) {
        const vista = await observaciones.agregarSeguimiento(obs!._id, `Nota de ${quien.rol}.`, quien);
        expect(vista, quien.rol).toBeDefined();
      }
      await expect(observaciones.agregarSeguimiento(obs!._id, 'Intruso.', e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
      const guardada = await Observacion.findById(obs!._id);
      expect(guardada!.seguimientos).toHaveLength(6);
    });

    it('lo confidencial solo admite seguimiento de su autor, orientación y convivencia', async () => {
      const [conf] = await registrar(e.docenteDeClase, [id(e.estudiante)], { confidencial: true });
      await expect(observaciones.agregarSeguimiento(conf!._id, 'No debería.', e.directora)).rejects.toMatchObject({ statusCode: 404 });
      await expect(observaciones.agregarSeguimiento(conf!._id, 'No debería.', e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
      for (const quien of [e.docenteDeClase, e.orientador, e.coordConvivencia]) {
        await expect(observaciones.agregarSeguimiento(conf!._id, 'Seguimiento válido.', quien), quien.rol).resolves.toBeDefined();
      }
    });

    it('el compromiso se marca una sola vez y solo si existe', async () => {
      const [sin] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await expect(observaciones.marcarCompromiso(sin!._id, 'CUMPLIDO', undefined, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });

      const [con] = await registrar(e.docenteDeClase, [id(e.estudiante)], { compromiso: 'Traer el uniforme completo.' });
      const cumplido = await observaciones.marcarCompromiso(con!._id, 'CUMPLIDO', 'Lo trajo toda la semana.', e.directora);
      expect(cumplido).toMatchObject({ compromiso_estado: 'CUMPLIDO' });
      await expect(observaciones.marcarCompromiso(con!._id, 'INCUMPLIDO', undefined, e.directora)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('la citación realizada solo se registra si se indicó, una vez y sin fecha futura', async () => {
      const [sin] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await expect(observaciones.registrarCitacionRealizada(sin!._id, { fecha: hoy() }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });

      const [con] = await registrar(e.docenteDeClase, [id(e.estudiante)], { requiere_citacion: true });
      const mañana = new Date(hoyColombia().getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
      await expect(observaciones.registrarCitacionRealizada(con!._id, { fecha: mañana }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
      const hecha = await observaciones.registrarCitacionRealizada(con!._id, { fecha: hoy(), resultado: 'Asistió la madre.' }, e.coordConvivencia);
      expect(hecha).toMatchObject({ citacion_realizada: { resultado: 'Asistió la madre.' } });
      await expect(observaciones.registrarCitacionRealizada(con!._id, { fecha: hoy() }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('falta Tipo I (el manual de convivencia)', () => {
    it('una falta Tipo I se queda en el Observador como antecedente: sin solicitud, con versión y acuerdo formativo', async () => {
      const { registros, escalada } = await registrarFalta(e.docenteDeClase, { version_estudiante: 'Se me dañó la ruta.', compromiso: 'Saldrá más temprano.' });
      expect(escalada).toBe(false);
      expect(registros[0]).toMatchObject({
        clase: 'FALTA',
        gravedad: 'I',
        tipo_nombre: 'Falta 1.3',
        version_estudiante: 'Se me dañó la ruta.',
        compromiso_estado: 'PENDIENTE',
        solicitud_id: null,
        contexto: 'CLASE',
      });
      expect(await SolicitudCaso.countDocuments()).toBe(0);

      // La ven completa el director, orientación y convivencia; el coordinador académico no ve faltas.
      for (const quien of [e.directora, e.orientador, e.coordConvivencia]) {
        expect((await historial(e.estudiante, quien)).data[0], quien.rol).toMatchObject({ reservada: false, falta: { codigo: '1.3', gravedad: 'I' } });
      }
      expect((await historial(e.estudiante, e.coordAcademico)).data).toHaveLength(0);
    });

    it('una falta Tipo I se puede escalar a coordinación si el docente lo decide, y avisa a convivencia', async () => {
      const { registros, escalada } = await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true });
      expect(escalada).toBe(true);
      expect(registros[0]!.solicitud_id).toBeTruthy();
      const bandeja = await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA);
      expect(bandeja.data).toHaveLength(1);
      expect(bandeja.data[0]).toMatchObject({ estado: 'PENDIENTE', gravedad: 'I', falta: { codigo: '1.3' } });
      expect(bandeja.data[0]!.involucrados.map((i) => i.rol)).toEqual(['PRESUNTO_RESPONSABLE']);
      // Punto rojo en «Solicitudes de caso», pero no es una alerta crítica: eso es solo del reporte urgente.
      expect(await Insignia.countDocuments({ usuario_id: e.coordConvivencia._id, ruta: '/convivencia/solicitudes' })).toBe(1);
      expect(await Notificacion.countDocuments({ usuario_id: e.coordConvivencia._id, evento: 'REPORTE_URGENTE' })).toBe(0);
    });

    it('varios estudiantes en una misma falta comparten evento y un antecedente cada uno', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { estudiantes_ids: [id(e.estudiante), id(e.otroEstudiante)], escalar_a_coordinacion: true });
      expect(registros).toHaveLength(2);
      expect(new Set(registros.map((r) => r.evento_id)).size).toBe(1);
      expect(new Set(registros.map((r) => r.solicitud_id)).size).toBe(1);
      expect(await SolicitudCaso.countDocuments()).toBe(1);
    });

    it('una falta Tipo III siempre se envía a coordinación; una Tipo II se registra si la resolvió el docente, y para enviarla se usa el reporte', async () => {
      await expect(registrarFalta(e.docenteDeClase, { falta_id: e.faltaIII })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('coordinación de convivencia') });
      await expect(registrarFalta(e.coordConvivencia, { falta_id: e.faltaIII })).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrarFalta(e.docenteDeClase, { falta_id: e.faltaII, escalar_a_coordinacion: true })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('reporte') });
      expect(await Observacion.countDocuments()).toBe(0);
      expect(await SolicitudCaso.countDocuments()).toBe(0);
    });

    it('una falta Tipo II que el docente resolvió queda en el Observador como una Tipo I: sin solicitud, completa para el director y visible para la familia', async () => {
      const { registros, escalada } = await registrarFalta(e.docenteDeClase, { falta_id: e.faltaII, hechos: 'Empujón en el patio; se habló con los dos.', compromiso: 'No volver a empujar.' });
      expect(escalada).toBe(false);
      expect(registros[0]).toMatchObject({ gravedad: 'II', solicitud_id: null });
      expect(await SolicitudCaso.countDocuments()).toBe(0);

      // El director de grupo la ve completa (una Tipo II en trámite en convivencia solo se le muestra como existente).
      const [vista] = (await historial(e.estudiante, e.directora)).data;
      expect(vista).toMatchObject({ reservada: false, descripcion: 'Empujón en el patio; se habló con los dos.' });

      // La familia y el estudiante la ven completa, sin el rótulo de «situación de convivencia».
      const [propia] = await observaciones.miObservador(e.estudiante);
      expect(propia).toMatchObject({ descripcion: 'Empujón en el patio; se habló con los dos.' });
      expect(propia).not.toHaveProperty('situacion');
    });

    it('exige hechos y al menos un estudiante, y no acepta uno repetido ni de un grupo ajeno', async () => {
      await expect(registrarFalta(e.docenteDeClase, { hechos: '   ' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrarFalta(e.docenteDeClase, { estudiantes_ids: [] })).rejects.toMatchObject({ statusCode: 400 });
      // Un estudiante repetido cuenta una sola vez.
      const { registros } = await registrarFalta(e.docenteDeClase, { estudiantes_ids: [id(e.estudiante), id(e.estudiante)] });
      expect(registros).toHaveLength(1);
      await expect(registrarFalta(e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('registran faltas el docente de clase, el titular y convivencia; no el docente ajeno, el coordinador académico ni orientación', async () => {
      await expect(registrarFalta(e.docenteDeClase)).resolves.toBeDefined();
      await expect(registrarFalta(e.directora)).resolves.toBeDefined();
      await expect(registrarFalta(e.coordConvivencia)).resolves.toBeDefined();
      for (const quien of [e.docenteAjeno, e.coordAcademico, e.orientador, e.secretaria]) {
        await expect(registrarFalta(quien), quien.rol).rejects.toMatchObject({ statusCode: 404 });
      }
    });

    it('la falta debe existir y estar activa', async () => {
      await expect(registrarFalta(e.docenteDeClase, { falta_id: String(new Types.ObjectId()) })).rejects.toMatchObject({ statusCode: 400 });
      await catalogoCaso.cambiarEstadoFalta(e.faltaI, 'inactivo', actor(e.admin));
      await expect(registrarFalta(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('una falta escalada solo la corrige convivencia', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true });
      const idFalta = registros[0]!._id;
      await expect(observaciones.anularObservacion(idFalta, 'Me equivoqué de estudiante.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.enmendarObservacion(idFalta, { descripcion: 'Otro relato.' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.enmendarObservacion(idFalta, { descripcion: 'Relato corregido por convivencia.' }, e.coordConvivencia)).resolves.toBeDefined();
    });

    it('una falta Tipo I sin escalar la corrige su autor dentro del plazo', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { compromiso: 'Llegará a tiempo.' });
      const enmendada = await observaciones.enmendarObservacion(registros[0]!._id, { version_estudiante: 'Perdí el bus.' }, e.docenteDeClase);
      expect(enmendada).toMatchObject({ version_estudiante: 'Perdí el bus.', compromiso: 'Llegará a tiempo.' });
      await expect(observaciones.anularObservacion(registros[0]!._id, 'Estudiante equivocado.', e.docenteDeClase)).resolves.toMatchObject({ estado: 'ANULADA' });
    });

    it('convivencia descarta la solicitud con motivo; la falta Tipo I sigue en el Observador', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true });
      const solicitudId = String(registros[0]!.solicitud_id);
      await expect(solicitudes.descartarSolicitud(solicitudId, 'No amerita caso.', e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(solicitudes.descartarSolicitud(solicitudId, 'No amerita caso.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 404 });
      const descartada = await solicitudes.descartarSolicitud(solicitudId, 'No amerita caso.', e.coordConvivencia);
      expect(descartada).toMatchObject({ estado: 'DESCARTADA', resolucion: { motivo: 'No amerita caso.' } });
      expect((await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data).toHaveLength(0);
      await expect(solicitudes.descartarSolicitud(solicitudId, 'Otra vez.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });

      // Quien registró ve qué pasó con lo que envió.
      const vistas = (await observaciones.misObservaciones(e.docenteDeClase, PAGINA)).data;
      expect(vistas[0]).toMatchObject({ solicitud: { estado: 'DESCARTADA', motivo_resolucion: 'No amerita caso.' } });
    });

    it('registros anteriores de una falta grave: el director y orientación solo ven que existe; su autor la ve completa', async () => {
      // Antes del reporte urgente el docente registraba la falta grave con su catálogo: esos registros siguen en el Observador.
      const { registros } = await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true, hechos: 'Agresión física durante el descanso.' });
      await Observacion.updateOne({ _id: registros[0]!._id }, { $set: { 'falta.gravedad': 'II', 'falta.codigo': '3.3', 'falta.descripcion': 'Agrede físicamente.' } });

      for (const quien of [e.directora, e.orientador]) {
        const { data } = await historial(e.estudiante, quien);
        expect(data, quien.rol).toHaveLength(1);
        expect((data[0] as Vista).reservada, quien.rol).toBe(true);
        expect(JSON.stringify(data)).not.toContain('Agresión física');
      }
      expect(await observaciones.obtenerObservacion(registros[0]!._id, e.docenteDeClase)).toMatchObject({ reservada: false, descripcion: 'Agresión física durante el descanso.' });
      await expect(observaciones.obtenerObservacion(registros[0]!._id, e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
      expect((await historial(e.estudiante, e.coordConvivencia)).data.every((v) => (v as Vista).reservada === false)).toBe(true);
    });

    it('solo convivencia lee la bandeja de solicitudes y cada consulta queda auditada', async () => {
      await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true });
      for (const quien of [e.docenteDeClase, e.directora, e.coordAcademico, e.orientador]) {
        await expect(solicitudes.bandejaDeSolicitudes(quien, PAGINA), quien.rol).rejects.toMatchObject({ statusCode: 403 });
      }
      expect((await solicitudes.bandejaDeSolicitudes(e.coordConvivenciaOtraSede, PAGINA)).data).toHaveLength(0);
      await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA);
      expect(await AuditLog.countDocuments({ accion: 'CONVIVENCIA_BANDEJA_CONSULTADA' })).toBe(2);
    });

    it('una falta usada no se elimina del catálogo, solo se desactiva', async () => {
      await registrarFalta(e.docenteDeClase);
      await expect(catalogoCaso.eliminarFalta(e.faltaI, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
      await expect(catalogoCaso.eliminarFalta(e.faltaIII, actor(e.admin))).resolves.toBeUndefined();
    });

    it('el código de una falta es único (sin importar mayúsculas)', async () => {
      await expect(catalogoCaso.crearFalta({ codigo: '1.3', descripcion: 'Otra.', gravedad: 'I' }, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('reporte urgente de una situación grave', () => {
    it('crea una solicitud sin falta, gravedad ni roles, y no deja antecedente en el Observador de nadie', async () => {
      const reporte = await reportar(e.docenteDeClase);
      expect(reporte).toMatchObject({ estado: 'PENDIENTE', estudiantes: 2 });

      const [solicitud] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data;
      expect(solicitud).toMatchObject({
        gravedad: null,
        falta: null,
        hechos: 'Agresión física durante el descanso.',
        acciones_contencion: 'Se separó a los estudiantes y se llevó a uno a enfermería.',
      });
      expect(solicitud!.involucrados.map((i) => i.rol)).toEqual([null, null]);
      expect((await solicitudes.bandejaDeSolicitudes(e.admin, PAGINA)).total).toBe(1);
      expect(await Observacion.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments({ accion: 'REPORTE_URGENTE_REGISTRADO' })).toBe(1);
    });

    it('con la falta del manual que eligió el docente, la solicitud llega con su gravedad y su falta como referencia, y sin roles', async () => {
      await reportar(e.docenteDeClase, { falta_id: e.faltaIII });
      const [solicitud] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data;
      expect(solicitud).toMatchObject({ gravedad: 'III', falta: expect.objectContaining({ codigo: '4.3' }) });
      expect(solicitud!.involucrados.map((i) => i.rol)).toEqual([null, null]);
      // Sigue sin dejar antecedente en el Observador: lo grave solo cuenta cuando hay una decisión en firme.
      expect(await Observacion.countDocuments()).toBe(0);
      expect(await Notificacion.countDocuments({ usuario_id: e.coordConvivencia._id, evento: 'REPORTE_URGENTE' })).toBe(1);

      const [mio] = (await observaciones.misReportesUrgentes(e.docenteDeClase, PAGINA)).data;
      expect(mio).toMatchObject({ falta: { codigo: '4.3', gravedad: 'III' } });
    });

    it('la falta de un reporte debe ser Tipo II o III y estar activa', async () => {
      await expect(reportar(e.docenteDeClase, { falta_id: e.faltaI })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('falta leve') });
      await expect(reportar(e.docenteDeClase, { falta_id: String(new Types.ObjectId()) })).rejects.toMatchObject({ statusCode: 400 });
      expect(await SolicitudCaso.countDocuments()).toBe(0);
    });

    it('alerta de inmediato a coordinación de convivencia de la sede (agrupada) y no a la de otra sede', async () => {
      await reportar(e.docenteDeClase);
      await reportar(e.docenteDeClase);
      const alerta = await Notificacion.find({ usuario_id: e.coordConvivencia._id, evento: 'REPORTE_URGENTE' });
      expect(alerta).toHaveLength(1);
      expect(alerta[0]).toMatchObject({ contador: 2, severidad: 'CRITICA', leida: false, ruta: '/convivencia/solicitudes' });
      expect(await Notificacion.countDocuments({ usuario_id: e.coordConvivenciaOtraSede._id, evento: 'REPORTE_URGENTE' })).toBe(0);
      expect(await Insignia.countDocuments({ usuario_id: e.coordConvivencia._id, ruta: '/convivencia/solicitudes' })).toBe(1);
    });

    it('exige hechos, la contención inmediata y al menos un estudiante, y no guarda nada si falla', async () => {
      await expect(reportar(e.docenteDeClase, { hechos: '   ' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(reportar(e.docenteDeClase, { acciones_contencion: '' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('contención') });
      await expect(reportar(e.docenteDeClase, { estudiantes_ids: [] })).rejects.toMatchObject({ statusCode: 400 });
      await expect(reportar(e.docenteDeClase, { fecha_hecho: '2999-01-01' })).rejects.toMatchObject({ statusCode: 400 });
      expect(await SolicitudCaso.countDocuments()).toBe(0);
    });

    it('el docente solo nombra estudiantes de sus grupos; el docente ajeno, el coordinador académico y orientación no reportan', async () => {
      await expect(reportar(e.directora)).resolves.toBeDefined();
      await expect(reportar(e.coordConvivencia)).resolves.toBeDefined();
      for (const quien of [e.docenteAjeno, e.coordAcademico, e.orientador, e.secretaria]) {
        await expect(reportar(quien), quien.rol).rejects.toMatchObject({ statusCode: 404 });
      }
      // Nombrar a alguien fuera de sus grupos no se hace a medias: no queda ninguna solicitud de más.
      expect(await SolicitudCaso.countDocuments()).toBe(2);
    });

    it('quien reportó ve el estado de su reporte, y solo el suyo', async () => {
      await reportar(e.docenteDeClase);
      const [mio] = (await observaciones.misReportesUrgentes(e.docenteDeClase, PAGINA)).data;
      expect(mio).toMatchObject({ estado: 'PENDIENTE', caso: null, hechos: 'Agresión física durante el descanso.' });
      expect(mio!.estudiantes).toHaveLength(2);
      expect((await observaciones.misReportesUrgentes(e.directora, PAGINA)).data).toHaveLength(0);

      // Una falta Tipo I escalada no es un reporte urgente: su estado se ve en «Mis registros».
      await registrarFalta(e.docenteDeClase, { escalar_a_coordinacion: true });
      expect((await observaciones.misReportesUrgentes(e.docenteDeClase, PAGINA)).total).toBe(1);
    });
  });
});
