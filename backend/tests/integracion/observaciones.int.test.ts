import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AuditLog from '../../src/models/auditLog.model';
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
        involucrados: [{ student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' }],
        ...extra,
      },
      usuario
    );
  const graveII = (extra: Partial<observaciones.RegistrarFaltaInput> = {}) => ({
    falta_id: e.faltaII,
    hechos: 'Agresión física durante el descanso.',
    acciones_contencion: 'Se separó a los estudiantes y se llevó a uno a enfermería.',
    involucrados: [
      { student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' as const },
      { student_id: id(e.otroEstudiante), rol: 'AFECTADO' as const },
    ],
    ...extra,
  });
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

    it('una observación no admite campos de una falta ni una falta los de una observación', async () => {
      const [obs] = await registrar(e.docenteDeClase, [id(e.estudiante)]);
      await expect(observaciones.enmendarObservacion(obs!._id, { version_estudiante: 'x' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 400 });
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

  describe('falta (el manual de convivencia)', () => {
    it('una falta Tipo I se queda en el Observador como antecedente: sin solicitud, con versión y acuerdo formativo', async () => {
      const { registros, remitida } = await registrarFalta(e.docenteDeClase, { version_estudiante: 'Se me dañó la ruta.', compromiso: 'Saldrá más temprano.' });
      expect(remitida).toBe(false);
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

    it('una falta Tipo I se puede remitir al comité si el docente lo decide', async () => {
      const { registros, remitida } = await registrarFalta(e.docenteDeClase, { remitir_comite: true });
      expect(remitida).toBe(true);
      expect(registros[0]!.solicitud_id).toBeTruthy();
      const bandeja = await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA);
      expect(bandeja.data).toHaveLength(1);
      expect(bandeja.data[0]).toMatchObject({ estado: 'PENDIENTE', gravedad: 'I', falta: { codigo: '1.3' } });
    });

    it('una falta Tipo II genera siempre la solicitud, con involucrados, roles y contención', async () => {
      const { registros, remitida } = await registrarFalta(e.docenteDeClase, graveII());
      expect(remitida).toBe(true);
      expect(registros).toHaveLength(1);

      const [solicitud] = (await solicitudes.bandejaDeSolicitudes(e.coordConvivencia, PAGINA)).data;
      expect(solicitud).toMatchObject({
        gravedad: 'II',
        hechos: 'Agresión física durante el descanso.',
        acciones_contencion: 'Se separó a los estudiantes y se llevó a uno a enfermería.',
      });
      expect(solicitud!.involucrados.map((i) => i.rol).sort()).toEqual(['AFECTADO', 'PRESUNTO_RESPONSABLE']);
      expect((await solicitudes.bandejaDeSolicitudes(e.admin, PAGINA)).total).toBe(1);
    });

    it('el antecedente queda solo en el presunto responsable: el afectado no recibe nada en su Observador', async () => {
      await registrarFalta(e.docenteDeClase, graveII());
      expect(await Observacion.countDocuments({ student_id: e.otroEstudiante._id })).toBe(0);
      expect((await historial(e.otroEstudiante, e.coordConvivencia)).data).toHaveLength(0);
      expect(await Observacion.countDocuments({ student_id: e.estudiante._id })).toBe(1);
    });

    it('varios presuntos responsables comparten una sola solicitud y un antecedente cada uno', async () => {
      const { registros } = await registrarFalta(
        e.docenteDeClase,
        graveII({
          involucrados: [
            { student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' },
            { student_id: id(e.otroEstudiante), rol: 'PRESUNTO_RESPONSABLE' },
            { student_id: id(e.tercerEstudiante), rol: 'TESTIGO' },
          ],
        })
      );
      expect(registros).toHaveLength(2);
      expect(new Set(registros.map((r) => r.solicitud_id)).size).toBe(1);
      expect(new Set(registros.map((r) => r.evento_id)).size).toBe(1);
      expect(await SolicitudCaso.countDocuments()).toBe(1);
      expect(await Observacion.countDocuments({ student_id: e.tercerEstudiante._id })).toBe(0);
    });

    it('de una falta Tipo II/III el director y orientación solo ven que existe; su autor la ve completa', async () => {
      await registrarFalta(e.docenteDeClase, graveII());
      await registrarFalta(e.docenteDeClase, graveII({ falta_id: e.faltaIII, involucrados: [{ student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' }] }));

      for (const quien of [e.directora, e.orientador]) {
        const { data } = await historial(e.estudiante, quien);
        expect(data, quien.rol).toHaveLength(2);
        expect(data.every((v) => (v as Vista).reservada === true), quien.rol).toBe(true);
        expect(JSON.stringify(data)).not.toContain('Agresión física');
        expect(JSON.stringify(data)).not.toContain('4.3');
      }
      const { registros } = await registrarFalta(e.docenteDeClase, graveII());
      expect(await observaciones.obtenerObservacion(registros[0]!._id, e.docenteDeClase)).toMatchObject({ reservada: false, descripcion: 'Agresión física durante el descanso.' });
      await expect(observaciones.obtenerObservacion(registros[0]!._id, e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
      expect((await historial(e.estudiante, e.coordConvivencia)).data.every((v) => (v as Vista).reservada === false)).toBe(true);
    });

    it('el docente no cierra lo grave: exige contención, involucrados y no acepta versión ni acuerdo', async () => {
      await expect(registrarFalta(e.docenteDeClase, graveII({ acciones_contencion: '' }))).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('contención') });
      await expect(registrarFalta(e.docenteDeClase, graveII({ version_estudiante: 'Dice que no fue él.' }))).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrarFalta(e.docenteDeClase, graveII({ compromiso: 'No lo hará más.' }))).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        registrarFalta(e.docenteDeClase, graveII({ involucrados: [{ student_id: id(e.otroEstudiante), rol: 'AFECTADO' }] }))
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('presunto responsable') });
      expect(await Observacion.countDocuments()).toBe(0);
      expect(await SolicitudCaso.countDocuments()).toBe(0);
    });

    it('una falta Tipo I no acepta contención ni otros roles, ni un estudiante repetido', async () => {
      await expect(registrarFalta(e.docenteDeClase, { acciones_contencion: 'Se separó a los estudiantes.' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        registrarFalta(e.docenteDeClase, { involucrados: [{ student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' }, { student_id: id(e.otroEstudiante), rol: 'AFECTADO' }] })
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        registrarFalta(e.docenteDeClase, { involucrados: [{ student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' }, { student_id: id(e.estudiante), rol: 'PRESUNTO_RESPONSABLE' }] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('registran faltas el docente de clase, el titular y convivencia; no el docente ajeno, el coordinador académico ni orientación', async () => {
      await expect(registrarFalta(e.docenteDeClase)).resolves.toBeDefined();
      await expect(registrarFalta(e.directora)).resolves.toBeDefined();
      await expect(registrarFalta(e.coordConvivencia)).resolves.toBeDefined();
      for (const quien of [e.docenteAjeno, e.coordAcademico, e.orientador, e.secretaria]) {
        await expect(registrarFalta(quien), quien.rol).rejects.toMatchObject({ statusCode: 404 });
      }
    });

    it('la falta debe existir y estar activa; el docente solo nombra estudiantes de sus grupos', async () => {
      await expect(registrarFalta(e.docenteDeClase, { falta_id: String(new Types.ObjectId()) })).rejects.toMatchObject({ statusCode: 400 });
      await catalogoCaso.cambiarEstadoFalta(e.faltaI, 'inactivo', actor(e.admin));
      await expect(registrarFalta(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 400 });
      await expect(registrarFalta(e.docenteAjeno, graveII())).rejects.toMatchObject({ statusCode: 404 });
    });

    it('una falta remitida solo la corrige convivencia', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, graveII());
      const idFalta = registros[0]!._id;
      await expect(observaciones.anularObservacion(idFalta, 'Me equivoqué de estudiante.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.enmendarObservacion(idFalta, { descripcion: 'Otro relato.' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.enmendarObservacion(idFalta, { descripcion: 'Relato corregido por convivencia.' }, e.coordConvivencia)).resolves.toBeDefined();
    });

    it('una falta Tipo I sin remitir la corrige su autor dentro del plazo', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { compromiso: 'Llegará a tiempo.' });
      const enmendada = await observaciones.enmendarObservacion(registros[0]!._id, { version_estudiante: 'Perdí el bus.' }, e.docenteDeClase);
      expect(enmendada).toMatchObject({ version_estudiante: 'Perdí el bus.', compromiso: 'Llegará a tiempo.' });
      await expect(observaciones.anularObservacion(registros[0]!._id, 'Estudiante equivocado.', e.docenteDeClase)).resolves.toMatchObject({ estado: 'ANULADA' });
    });

    it('convivencia descarta la solicitud con motivo; la falta Tipo I sigue en el Observador', async () => {
      const { registros } = await registrarFalta(e.docenteDeClase, { remitir_comite: true });
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

    it('solo convivencia lee la bandeja de solicitudes y cada consulta queda auditada', async () => {
      await registrarFalta(e.docenteDeClase, graveII());
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
      await expect(catalogoCaso.crearFalta({ codigo: '1.3', descripcion: 'Otra.', gravedad: 'I', descuento_decimas: null }, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
