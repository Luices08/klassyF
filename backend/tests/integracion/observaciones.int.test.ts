import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Institution from '../../src/models/institution.model';
import JornadaOperativa from '../../src/models/jornadaOperativa.model';
import Observacion from '../../src/models/observacion.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { User, UserDocument } from '../../src/models/user.model';
import { hoyColombia } from '../../src/services/attendance.service';
import * as catalogo from '../../src/services/convivenciaCatalogo.service';
import * as observaciones from '../../src/services/observacion.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';

const actor = (u: UserDocument) => ({ usuarioId: u._id });
const hoy = () => hoyColombia().toISOString().slice(0, 10);

let contador = 0;
async function crearUsuario(rol: UserDocument['rol'], extra: Partial<UserDocument> = {}): Promise<UserDocument> {
  contador += 1;
  const u = new User({
    nombre: `Nombre${contador}`,
    apellido: `Apellido${contador}`,
    tipo_documento: 'CC',
    numero_documento: `1000${contador}`,
    email: `u${contador}@colegio.test`,
    rol,
    ...extra,
  });
  u.password = 'Clave-segura-1';
  await u.save();
  return u;
}

interface Escenario {
  admin: UserDocument;
  coordConvivencia: UserDocument;
  coordConvivenciaOtraSede: UserDocument;
  coordAcademico: UserDocument;
  directora: UserDocument;
  docenteDeClase: UserDocument;
  docenteAjeno: UserDocument;
  secretaria: UserDocument;
  estudiante: UserDocument;
  otroEstudiante: UserDocument;
  tipoComportamental: string;
  tipoDisciplinaria: string;
  faltaTipoI: string;
  faltaTipoII: string;
}

async function armarEscenario(): Promise<Escenario> {
  const institucion = await Institution.create({
    nombre: 'Colegio de prueba',
    codigo_dane: '123456789012',
    nit: '900000000-1',
    resolucion_aprobacion: 'Res. 1',
  });
  const sede = await Campus.create({ institucion_id: institucion._id, nombre: 'Principal', codigo_dane_sede: '123456789001', direccion: 'Calle 1', es_principal: true });
  const otraSede = await Campus.create({ institucion_id: institucion._id, nombre: 'Rural', codigo_dane_sede: '123456789002', direccion: 'Vereda' });
  const jornada = await JornadaOperativa.create({ sede_id: sede._id, nombre: 'MANANA', hora_inicio: '06:00', hora_fin: '12:00' });
  const grado = await Grade.create({ nivel: 'SECUNDARIA', numero: 6, nombre: 'Sexto' });

  const anio = new Date().getUTCFullYear();
  const periodos = [1, 2, 3, 4].map((n) => ({
    numero: n,
    nombre: `Periodo ${n}`,
    porcentaje: 25,
    fecha_inicio: new Date(Date.UTC(anio, (n - 1) * 3, 1)),
    fecha_fin: new Date(Date.UTC(anio, n * 3, 0)),
    estado: 'ABIERTO',
  }));
  const anioLectivo = await AcademicYear.create({
    institucion_id: institucion._id,
    year: anio,
    nombre: `Año ${anio}`,
    calendario: 'A',
    fecha_inicio: new Date(Date.UTC(anio, 0, 1)),
    fecha_fin: new Date(Date.UTC(anio, 11, 31)),
    estado: 'EN_CURSO',
    periodos,
  });

  const admin = await crearUsuario('ADMIN');
  const coordConvivencia = await crearUsuario('COORDINADOR_CONVIVENCIA', { sedes_ids: [sede._id] });
  const coordConvivenciaOtraSede = await crearUsuario('COORDINADOR_CONVIVENCIA', { sedes_ids: [otraSede._id] });
  const coordAcademico = await crearUsuario('COORDINADOR', { sedes_ids: [sede._id] });
  const directora = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const docenteDeClase = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const docenteAjeno = await crearUsuario('DOCENTE', { sedes_ids: [sede._id] });
  const secretaria = await crearUsuario('SECRETARIA');
  const estudiante = await crearUsuario('ESTUDIANTE');
  const otroEstudiante = await crearUsuario('ESTUDIANTE');

  const grupo = await Group.create({
    sede_id: sede._id,
    academic_year_id: anioLectivo._id,
    grade_id: grado._id,
    jornada_id: jornada._id,
    nomenclatura: '601',
    max_capacity: 40,
    director_grupo_id: directora._id,
  });
  for (const alumno of [estudiante, otroEstudiante]) {
    await Enrollment.create({
      student_id: alumno._id,
      group_id: grupo._id,
      academic_year_id: anioLectivo._id,
      tipo_ingreso: 'NUEVO',
      estado: 'MATRICULADO_DEFINITIVO',
      folio_matricula: `F-${alumno.numero_documento}`,
    });
  }
  await TeacherAssignment.create({
    docente_id: docenteDeClase._id,
    academic_year_id: anioLectivo._id,
    tipo_asignacion: 'CLASE',
    group_id: grupo._id,
    subject_id: new Types.ObjectId(),
    horas_semanales: 4,
  });

  const { tipos } = await catalogo.listarCatalogo(true);
  const tipoComportamental = String(tipos.find((t) => t.familia === 'COMPORTAMENTAL')!._id);
  const tipoDisciplinaria = String(tipos.find((t) => t.familia === 'DISCIPLINARIA')!._id);
  const faltaTipoI = await catalogo.crearDescriptor(
    { tipo_id: tipoDisciplinaria, categoria_id: null, codigo: '1.3', texto: 'Debe estar puntual en clase.', tipo_situacion: 'I', descuento_decimas: 0.3, orden: 1 },
    actor(admin)
  );
  const faltaTipoII = await catalogo.crearDescriptor(
    { tipo_id: tipoDisciplinaria, categoria_id: null, codigo: '3.3', texto: 'Agrede físicamente a un miembro de la comunidad.', tipo_situacion: 'II', descuento_decimas: 2, orden: 2 },
    actor(admin)
  );

  return {
    admin,
    coordConvivencia,
    coordConvivenciaOtraSede,
    coordAcademico,
    directora,
    docenteDeClase,
    docenteAjeno,
    secretaria,
    estudiante,
    otroEstudiante,
    tipoComportamental,
    tipoDisciplinaria,
    faltaTipoI: String(faltaTipoI._id),
    faltaTipoII: String(faltaTipoII._id),
  };
}

describe('M14 observaciones (con base de datos)', () => {
  let e: Escenario;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([
      Observacion.syncIndexes(),
      User.syncIndexes(),
    ]);
    e = await armarEscenario();
  }, 60_000);

  const registrar = (usuario: UserDocument, estudiantes: string[], extra: Partial<observaciones.RegistrarObservacionInput> = {}) =>
    observaciones.registrarObservacion(
      { estudiantes_ids: estudiantes, tipo_id: e.tipoComportamental, descriptores_ids: [], comentario: 'Participa con respeto.', fecha_hecho: hoy(), ...extra },
      usuario
    );

  it('un docente registra en un grupo que dicta y en uno que dirige, y no en uno ajeno', async () => {
    const [deClase] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
    expect(deClase).toMatchObject({ contexto: 'CLASE', texto_generado: 'Participa con respeto.' });
    const [comoDirectora] = await registrar(e.directora, [String(e.estudiante._id)]);
    expect(comoDirectora).toMatchObject({ contexto: 'DIRECCION_GRUPO' });

    await expect(registrar(e.docenteAjeno, [String(e.estudiante._id)])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('un registro grupal crea uno por estudiante con el mismo evento, o ninguno', async () => {
    const creadas = await registrar(e.docenteDeClase, [String(e.estudiante._id), String(e.otroEstudiante._id)]);
    expect(creadas).toHaveLength(2);
    expect(new Set(creadas.map((o) => o.evento_id)).size).toBe(1);

    const total = await Observacion.countDocuments();
    await expect(registrar(e.docenteAjeno, [String(e.estudiante._id)])).rejects.toBeDefined();
    expect(await Observacion.countDocuments()).toBe(total);
  });

  it('exige contenido y los hechos en una disciplinaria; no acepta fechas futuras', async () => {
    await expect(registrar(e.docenteDeClase, [String(e.estudiante._id)], { comentario: '' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoI], comentario: '' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(registrar(e.docenteDeClase, [String(e.estudiante._id)], { fecha_hecho: '2999-01-01' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('el tipo de situación sale del catálogo y se copia al guardar', async () => {
    const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)], {
      tipo_id: e.tipoDisciplinaria,
      descriptores_ids: [e.faltaTipoI, e.faltaTipoII],
      comentario: 'Hechos en el patio.',
    });
    expect(obs).toMatchObject({ tipo_situacion_maxima: 'II', texto_generado: expect.stringContaining('3.3. Agrede') });
  });

  it('el director ve el historial pero no el contenido de una situación II/III; el docente de clase no ve el historial', async () => {
    await registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoII], comentario: 'Detalle reservado.' });
    await registrar(e.docenteDeClase, [String(e.estudiante._id)]);

    const comoDirectora = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.directora, { pagina: 1, limite: 20 });
    expect(comoDirectora.data).toHaveLength(2);
    expect(JSON.stringify(comoDirectora.data)).not.toContain('Detalle reservado');
    expect(comoDirectora.data.find((o) => 'reservada' in o && o.reservada)).toBeDefined();

    await expect(
      observaciones.historialDeEstudiante(String(e.estudiante._id), e.docenteDeClase, { pagina: 1, limite: 20 })
    ).rejects.toMatchObject({ statusCode: 404 });

    const comoCoordinacion = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordConvivencia, { pagina: 1, limite: 20 });
    expect(JSON.stringify(comoCoordinacion.data)).toContain('Detalle reservado');
  });

  it('el coordinador académico no ve lo disciplinario y secretaría no entra', async () => {
    await registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoI], comentario: 'Llegó tarde.' });
    await registrar(e.docenteDeClase, [String(e.estudiante._id)]);

    const historial = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordAcademico, { pagina: 1, limite: 20 });
    expect(historial.data).toHaveLength(1);
    await expect(
      observaciones.historialDeEstudiante(String(e.estudiante._id), e.secretaria, { pagina: 1, limite: 20 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('un coordinador de convivencia de otra sede no ve al estudiante (respuesta 404 uniforme)', async () => {
    await expect(
      observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordConvivenciaOtraSede, { pagina: 1, limite: 20 })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Estudiante no encontrado.' });
    await expect(
      observaciones.historialDeEstudiante('000000000000000000000000', e.coordConvivencia, { pagina: 1, limite: 20 })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Estudiante no encontrado.' });
  });

  it('el estudiante solo ve los tipos visibles y solo el texto final', async () => {
    await registrar(e.docenteDeClase, [String(e.estudiante._id)], { comentario: 'Visible para el estudiante.' });
    await registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoI], comentario: 'No visible.' });
    await registrar(e.docenteDeClase, [String(e.otroEstudiante._id)], { comentario: 'De otro estudiante.' });

    const propias = await observaciones.miObservador(e.estudiante);
    expect(propias).toHaveLength(1);
    expect(Object.keys(propias[0]!).sort()).toEqual(['_id', 'fecha_hecho', 'periodo_numero', 'texto_generado', 'tipo_nombre']);
    await expect(observaciones.miObservador(e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('enmendar conserva la versión anterior y el docente pierde el derecho pasado el plazo', async () => {
    const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
    const enmendada = await observaciones.enmendarObservacion(obs!._id, { comentario: 'Texto corregido.' }, e.docenteDeClase);
    expect(enmendada).toMatchObject({ comentario: 'Texto corregido.', cantidad_enmiendas: 1 });
    const guardada = await Observacion.findById(obs!._id);
    expect(guardada!.enmiendas[0]!.texto_anterior).toBe('Participa con respeto.');

    // `createdAt` es inmutable para Mongoose: se envejece el registro directamente en la colección.
    await Observacion.collection.updateOne({ _id: new Types.ObjectId(obs!._id) }, { $set: { createdAt: new Date(Date.now() - 100 * 3_600_000) } });
    await expect(observaciones.enmendarObservacion(obs!._id, { comentario: 'Tarde.' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
    await expect(observaciones.enmendarObservacion(obs!._id, { comentario: 'Coordinación sí puede.' }, e.coordConvivencia)).resolves.toBeDefined();
    await expect(observaciones.enmendarObservacion(obs!._id, { comentario: 'No es suyo.' }, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('anular exige motivo, es terminal y deja de verse para quien no es de convivencia', async () => {
    const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
    const anulada = await observaciones.anularObservacion(obs!._id, 'Estudiante equivocado.', e.docenteDeClase);
    expect(anulada).toMatchObject({ estado: 'ANULADA' });

    await expect(observaciones.enmendarObservacion(obs!._id, { comentario: 'x' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
    const comoDirectora = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.directora, { pagina: 1, limite: 20 });
    expect(comoDirectora.data).toHaveLength(0);
    const comoCoordinacion = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordConvivencia, { pagina: 1, limite: 20 });
    expect(comoCoordinacion.data).toHaveLength(1);
  });

  it('no se registra ni se modifica con el año cerrado', async () => {
    const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
    await AcademicYear.updateMany({}, { estado: 'CERRADO' });
    await expect(registrar(e.docenteDeClase, [String(e.estudiante._id)])).rejects.toMatchObject({ statusCode: 409 });
    await expect(observaciones.anularObservacion(obs!._id, 'Motivo válido.', e.coordConvivencia)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('la lectura del historial y del detalle queda en la auditoría', async () => {
    const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
    await observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordConvivencia, { pagina: 1, limite: 20 });
    await observaciones.obtenerObservacion(obs!._id, e.coordConvivencia);
    const AuditLog = (await import('../../src/models/auditLog.model')).default;
    expect(await AuditLog.countDocuments({ accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO' })).toBe(2);
  });

  it('el buscador solo trae estudiantes de los grupos del usuario', async () => {
    const delDocente = await observaciones.buscarEstudiantes(e.docenteDeClase, { q: 'Apellido' });
    expect(delDocente.length).toBeGreaterThan(0);
    expect(await observaciones.buscarEstudiantes(e.docenteAjeno, { q: 'Apellido' })).toHaveLength(0);
    expect(await observaciones.buscarEstudiantes(e.coordConvivenciaOtraSede, { q: 'Apellido' })).toHaveLength(0);
    expect(await observaciones.buscarEstudiantes(e.coordConvivencia, { q: 'ap' })).toHaveLength(0);
  });

  describe('seguimiento', () => {
    const mañana = () => new Date(hoyColombia().getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
    const ayer = () => new Date(hoyColombia().getTime() - 24 * 3_600_000).toISOString().slice(0, 10);

    it('una situación II/III queda como solicitud de caso automática y aparece en la bandeja de su sede', async () => {
      const [grave] = await registrar(e.docenteDeClase, [String(e.estudiante._id)], {
        tipo_id: e.tipoDisciplinaria,
        descriptores_ids: [e.faltaTipoII],
        comentario: 'Hechos graves.',
      });
      const [leve] = await registrar(e.docenteDeClase, [String(e.estudiante._id)], {
        tipo_id: e.tipoDisciplinaria,
        descriptores_ids: [e.faltaTipoI],
        comentario: 'Llegó tarde.',
      });
      expect(grave).toMatchObject({ solicitud_caso: { estado: 'PENDIENTE', origen: 'AUTOMATICA' } });
      expect(leve).toMatchObject({ solicitud_caso: null });

      const bandeja = await observaciones.bandejaDeCasos(e.coordConvivencia, { pagina: 1, limite: 20 });
      expect(bandeja.data.map((o) => o._id)).toEqual([grave!._id]);
      expect((await observaciones.bandejaDeCasos(e.coordConvivenciaOtraSede, { pagina: 1, limite: 20 })).data).toHaveLength(0);
      await expect(observaciones.bandejaDeCasos(e.docenteDeClase, { pagina: 1, limite: 20 })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('el autor puede pedir el caso de una disciplinaria una sola vez; convivencia lo descarta con motivo', async () => {
      const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)], {
        tipo_id: e.tipoDisciplinaria,
        descriptores_ids: [e.faltaTipoI],
        comentario: 'Reiterado.',
      });
      const pedida = await observaciones.solicitarCaso(obs!._id, 'Es reiterado y preocupa.', e.docenteDeClase);
      expect(pedida).toMatchObject({ solicitud_caso: { origen: 'MANUAL', estado: 'PENDIENTE' } });
      await expect(observaciones.solicitarCaso(obs!._id, 'Otra vez.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });

      await expect(observaciones.descartarSolicitudCaso(obs!._id, 'No es mi sede.', e.coordConvivenciaOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(observaciones.descartarSolicitudCaso(obs!._id, 'No amerita caso.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 404 });
      const descartada = await observaciones.descartarSolicitudCaso(obs!._id, 'No amerita caso.', e.coordConvivencia);
      expect(descartada).toMatchObject({ solicitud_caso: { estado: 'DESCARTADA', motivo_resolucion: 'No amerita caso.' } });
      expect((await observaciones.bandejaDeCasos(e.coordConvivencia, { pagina: 1, limite: 20 })).data).toHaveLength(0);
    });

    it('una observación académica o comportamental no se escala a caso', async () => {
      const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
      await expect(observaciones.solicitarCaso(obs!._id, 'Quiero escalarla.', e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('los compromisos se cierran una vez y los vencidos se calculan por fecha', async () => {
      const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
      await expect(
        observaciones.agregarCompromiso(obs!._id, { descripcion: 'Entregar el taller.', responsable: 'ESTUDIANTE', fecha_limite: ayer() }, e.docenteDeClase)
      ).rejects.toMatchObject({ statusCode: 400 });

      const conCompromiso = await observaciones.agregarCompromiso(
        obs!._id,
        { descripcion: 'Entregar el taller.', responsable: 'ESTUDIANTE', fecha_limite: mañana() },
        e.docenteDeClase
      );
      const compromiso = (conCompromiso as { compromisos: { _id: string; vencido: boolean }[] }).compromisos[0]!;
      expect(compromiso.vencido).toBe(false);

      // Se hace vencer a mano: la fecha límite ya pasó y sigue pendiente.
      await Observacion.collection.updateOne(
        { _id: new Types.ObjectId(obs!._id) },
        { $set: { 'compromisos.0.fecha_limite': new Date(hoyColombia().getTime() - 3 * 24 * 3_600_000) } }
      );
      const historial = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.coordConvivencia, { pagina: 1, limite: 20 });
      expect((historial.data[0] as { compromisos: { vencido: boolean }[] }).compromisos[0]!.vencido).toBe(true);

      const cerrado = await observaciones.cerrarCompromiso(obs!._id, compromiso._id, 'CUMPLIDO', 'Lo entregó.', e.docenteDeClase);
      expect((cerrado as { compromisos: { estado: string; vencido: boolean }[] }).compromisos[0]).toMatchObject({ estado: 'CUMPLIDO', vencido: false });
      await expect(observaciones.cerrarCompromiso(obs!._id, compromiso._id, 'INCUMPLIDO', undefined, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(observaciones.cerrarCompromiso(obs!._id, compromiso._id, 'CUMPLIDO', undefined, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('la citación solo se registra: no admite fechas futuras', async () => {
      const [obs] = await registrar(e.docenteDeClase, [String(e.estudiante._id)]);
      const conCitacion = await observaciones.agregarCitacion(
        obs!._id,
        { fecha: hoy(), medio: 'LLAMADA', dirigida_a: 'Madre del estudiante', resultado: 'Asistirá el lunes.' },
        e.coordConvivencia
      );
      expect((conCitacion as { citaciones: unknown[] }).citaciones).toHaveLength(1);
      await expect(observaciones.agregarCitacion(obs!._id, { fecha: mañana(), medio: 'CORREO' }, e.coordConvivencia)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el director no ve los compromisos de una situación reservada ni el estudiante ninguno', async () => {
      const [grave] = await registrar(e.docenteDeClase, [String(e.estudiante._id)], {
        tipo_id: e.tipoDisciplinaria,
        descriptores_ids: [e.faltaTipoII],
        comentario: 'Hechos graves.',
      });
      await observaciones.agregarCompromiso(grave!._id, { descripcion: 'Pedir disculpas.', responsable: 'ESTUDIANTE', fecha_limite: mañana() }, e.coordConvivencia);
      const comoDirectora = await observaciones.historialDeEstudiante(String(e.estudiante._id), e.directora, { pagina: 1, limite: 20 });
      expect(JSON.stringify(comoDirectora.data)).not.toContain('Pedir disculpas');
      expect(JSON.stringify(await observaciones.miObservador(e.estudiante))).not.toContain('Pedir disculpas');
    });
  });

  it('el catálogo no elimina lo que ya se usó, solo lo desactiva', async () => {
    await registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoI], comentario: 'Hechos.' });
    await expect(catalogo.eliminarDescriptor(e.faltaTipoI, actor(e.admin))).rejects.toMatchObject({ statusCode: 409 });
    await expect(catalogo.eliminarDescriptor(e.faltaTipoII, actor(e.admin))).resolves.toBeUndefined();
    await catalogo.cambiarEstadoDescriptor(e.faltaTipoI, 'inactivo', actor(e.admin));
    await expect(
      registrar(e.docenteDeClase, [String(e.estudiante._id)], { tipo_id: e.tipoDisciplinaria, descriptores_ids: [e.faltaTipoI], comentario: 'Otra.' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
