import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import AdmissionRequest from '../../src/models/admissionRequest.model';
import AuditLog from '../../src/models/auditLog.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import StudentProfile from '../../src/models/studentProfile.model';
import User, { UserDocument } from '../../src/models/user.model';
import { crearSolicitud } from '../../src/services/admissionRequest.service';
import { listarDocumentosPorRevisar } from '../../src/services/enrollment.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

type Respuesta = { estado: number; cuerpo: { success?: boolean; data?: any; message?: string; total?: number } };

const NACIMIENTO = '2014-05-10';
const PDF = { contenido: '%PDF-1.4 documento de prueba', nombre: 'documento.pdf', mime: 'application/pdf' };

/**
 * CARACTERIZACIÓN del flujo de admisiones tal como funciona HOY (M04), contra la capa HTTP real: la solicitud pública sin sesión, la consulta de
 * estado, el comprobante, la carga de documentos, y la revisión de secretaría (admitir / matricular / rechazar). Una solicitud es PENDIENTE → ADMITIDO →
 * MATRICULADO (o RECHAZADA): matricular crea de una vez al estudiante y su matrícula con folio, sin cupos reservados ni lista de espera. Lo que hoy es una
 * limitación está marcado como tal.
 *
 * El POST público tiene un límite de 10 por hora y por IP: las solicitudes de apoyo de cada prueba se radican por el servicio, y solo unas pocas
 * pasan por HTTP.
 */
describe('M04: admisiones — solicitud pública y revisión (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let gradoId: string;
  let grupoId: string;
  let anioId: string;
  let contador = 0;

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
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const grupo = (await Group.findOne())!;
    grupoId = String(grupo._id);
    gradoId = String(grupo.grade_id);
    anioId = String((await AcademicYear.findOne())!._id);
  }, 120_000);

  const leer = async (r: Response): Promise<Respuesta> => ({ estado: r.status, cuerpo: (await r.json()) as Respuesta['cuerpo'] });
  const publica = async (metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta> =>
    leer(await fetch(`${base}/public/admission-requests${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
  const personal = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown, prefijo = '/admission-requests'): Promise<Respuesta> =>
    leer(
      await fetch(`${base}${prefijo}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
    );
  const estado = (documento: string, nacimiento = NACIMIENTO) => publica('GET', `/status?numero_documento=${documento}&fecha_nacimiento=${nacimiento}`);
  const subirDocumento = async (tipo: string, documento: string, archivo: { contenido: string | Buffer; nombre: string; mime: string } | null = PDF, nacimiento = NACIMIENTO): Promise<Respuesta> => {
    const form = new FormData();
    form.append('numero_documento', documento);
    form.append('fecha_nacimiento', nacimiento);
    if (archivo) form.append('file', new Blob([archivo.contenido], { type: archivo.mime }), archivo.nombre);
    return leer(await fetch(`${base}/public/admission-requests/documentos/${tipo}`, { method: 'POST', body: form }));
  };

  const datos = (extra: Record<string, unknown> = {}) => {
    contador += 1;
    return {
      nombre_aspirante: 'Laura',
      apellido_aspirante: `López${contador}`,
      tipo_documento: 'TI' as const,
      numero_documento: `9000${contador}`,
      fecha_nacimiento: NACIMIENTO,
      grado_deseado_id: gradoId,
      acudiente_nombre: 'Marta',
      acudiente_apellido: 'Morales',
      acudiente_telefono: `300000${contador}`,
      acudiente_email: `acudiente${contador}@correo.com`,
      ...extra,
    };
  };
  const radicar = (extra: Record<string, unknown> = {}) => crearSolicitud(datos(extra));
  const diasDespues = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  // Por defecto el acudiente no trae todo: nace condicional con el plazo del acta, como la mayoría de las matrículas de una solicitud.
  const aprobar = async (id: unknown, extra: Record<string, unknown> = {}, usuario: UserDocument = e.secretaria) =>
    personal('PATCH', `/${id}/aprobar`, usuario, { group_id: grupoId, academic_year_id: anioId, trae_todos: 'NO', fecha_limite_compromiso: diasDespues(20), ...extra });
  const periodosDe = (anio: number) =>
    [1, 2].map((n) => ({ numero: n, nombre: `Periodo ${n}`, porcentaje: 50, fecha_inicio: new Date(Date.UTC(anio, (n - 1) * 6, 1)), fecha_fin: new Date(Date.UTC(anio, n * 6, 0)), estado: 'PROGRAMADO' }));
  const cupos = async (id = grupoId) => (await Group.findById(id))!.cupos_ocupados;

  describe('la solicitud pública (sin sesión)', () => {
    it('radicar una solicitud la deja PENDIENTE y no crea cuenta, matrícula ni consume cupo', async () => {
      const cuerpo = datos({ sede_deseada_id: String((await Group.findOne())!.sede_id), jornada_deseada: 'MANANA', observaciones: 'Viene de otra ciudad' });
      const antes = { usuarios: await User.countDocuments(), cupos: await cupos() };

      const r = await publica('POST', '', cuerpo);

      expect(r.estado).toBe(201);
      expect(r.cuerpo.data).toMatchObject({ estado: 'PENDIENTE', nombre_aspirante: 'Laura', numero_documento: cuerpo.numero_documento, jornada_deseada: 'MANANA' });
      expect(await User.countDocuments()).toBe(antes.usuarios);
      expect(await Enrollment.countDocuments({ student_id: { $exists: true }, estado: 'PREINSCRITO' })).toBe(0);
      expect(await cupos()).toBe(antes.cupos);
    });

    it('descarta lo que el cliente no puede decidir: no se puede radicar ya aprobada ni con revisor', async () => {
      const r = await publica('POST', '', { ...datos(), estado: 'APROBADA', revisado_por: String(e.admin._id), student_user_id: String(e.estudiante._id) });
      expect(r.estado).toBe(201);
      const guardada = (await AdmissionRequest.findById(r.cuerpo.data._id))!;
      expect(guardada).toMatchObject({ estado: 'PENDIENTE', revisado_por: null, student_user_id: null });
    });

    it('valida lo obligatorio: falta de datos, correo inválido y grado inexistente son 400', async () => {
      const { acudiente_telefono: _omitido, ...sinTelefono } = datos();
      expect((await publica('POST', '', sinTelefono)).estado).toBe(400);
      expect((await publica('POST', '', datos({ acudiente_email: 'no-es-un-correo' }))).estado).toBe(400);
      const inexistente = await publica('POST', '', datos({ grado_deseado_id: '64b000000000000000000000' }));
      expect(inexistente.estado).toBe(400);
      expect(inexistente.cuerpo.message).toMatch(/grado/i);
    });

    it('un grado inactivo no admite solicitudes', async () => {
      await Grade.updateOne({ _id: gradoId }, { estado: 'inactivo' });
      expect((await publica('POST', '', datos())).estado).toBe(400);
    });

    it('mientras haya una solicitud en trámite o aprobada para ese documento no se radica otra (409); una rechazada sí se puede reintentar', async () => {
      const primera = await radicar();
      const repetida = await publica('POST', '', datos({ numero_documento: primera.numero_documento }));
      expect(repetida.estado).toBe(409);
      expect(repetida.cuerpo.message).toMatch(/en trámite/i);

      await personal('PATCH', `/${primera._id}/rechazar`, e.secretaria, { motivo: 'Documento ilegible' });
      await expect(crearSolicitud(datos({ numero_documento: primera.numero_documento }))).resolves.toMatchObject({ estado: 'PENDIENTE' });
    });

    it('una solicitud ya matriculada tampoco admite una segunda en ese año', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const r = await publica('POST', '', datos({ numero_documento: s.numero_documento }));
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/matrícula formalizada/i);
    });

    it('el año se elige en el formulario: un año cerrado o inexistente es 400, y el mismo documento puede radicar en otro año', async () => {
      const institucion = (await AcademicYear.findById(anioId))!.institucion_id;
      const siguiente = await AcademicYear.create({ institucion_id: institucion, year: 2099, nombre: 'Año 2099', calendario: 'A', fecha_inicio: new Date('2099-01-01'), fecha_fin: new Date('2099-12-31'), estado: 'PLANIFICACION', periodos: periodosDe(2099) });
      const cerrado = await AcademicYear.create({ institucion_id: institucion, year: 2000, nombre: 'Año 2000', calendario: 'A', fecha_inicio: new Date('2000-01-01'), fecha_fin: new Date('2000-12-31'), estado: 'CERRADO', periodos: periodosDe(2000) });
      const g = (await Group.findById(grupoId))!;
      await Group.create({ sede_id: g.sede_id, academic_year_id: siguiente._id, grade_id: g.grade_id, jornada_id: g.jornada_id, nomenclatura: '601', max_capacity: 30 });
      const primera = await radicar();

      expect((await publica('POST', '', datos({ academic_year_id: String(cerrado._id) }))).estado).toBe(400);
      expect((await publica('POST', '', datos({ academic_year_id: '64b000000000000000000000' }))).estado).toBe(400);
      const otroAnio = await crearSolicitud(datos({ numero_documento: primera.numero_documento, academic_year_id: String(siguiente._id) }));
      expect(String(otroAnio.academic_year_id)).toBe(String(siguiente._id));
      expect(String(primera.academic_year_id)).toBe(anioId);
    });
  });

  describe('la oferta depende del año elegido', () => {
    it('un grado que solo se abre el año siguiente se puede pedir ahí y no en el año en curso', async () => {
      const actual = (await AcademicYear.findById(anioId))!;
      const siguiente = await AcademicYear.create({ institucion_id: actual.institucion_id, year: actual.year + 1, nombre: `Año ${actual.year + 1}`, calendario: 'A', fecha_inicio: new Date(Date.UTC(actual.year + 1, 0, 1)), fecha_fin: new Date(Date.UTC(actual.year + 1, 11, 31)), estado: 'PLANIFICACION', periodos: periodosDe(actual.year + 1) });
      const g = (await Group.findById(grupoId))!;
      const septimo = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
      await Group.create({ sede_id: g.sede_id, academic_year_id: siguiente._id, grade_id: septimo._id, jornada_id: g.jornada_id, nomenclatura: '701', max_capacity: 30 });

      const ofertaDe = async (anio?: string) => (await publica('GET', `/oferta${anio ? `?academic_year_id=${anio}` : ''}`)).cuerpo.data.oferta.map((o: { grado: { nombre: string } }) => o.grado.nombre);
      expect(await ofertaDe(anioId)).toEqual(['Sexto']);
      expect(await ofertaDe(String(siguiente._id))).toEqual(['Séptimo']);

      expect((await publica('POST', '', datos({ grado_deseado_id: String(septimo._id) }))).estado).toBe(400);
      const alSiguiente = await publica('POST', '', datos({ grado_deseado_id: String(septimo._id), academic_year_id: String(siguiente._id) }));
      expect(alSiguiente.estado).toBe(201);
      expect((await publica('POST', '', datos({ academic_year_id: String(siguiente._id) }))).estado).toBe(400);
    });
  });

  describe('consultar el estado (documento + fecha de nacimiento)', () => {
    it('pendiente: devuelve el estado, el año y el grado, y todavía no hay matrícula', async () => {
      const s = await radicar();
      const r = await estado(s.numero_documento);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ estado: 'PENDIENTE', motivo_rechazo: null, matricula: null, grado: { nombre: 'Sexto' }, academic_year: { id: anioId } });
    });

    it('no revela si existe: documento desconocido y fecha equivocada responden lo mismo (404)', async () => {
      const s = await radicar();
      const sinSolicitud = await estado('00000000');
      const fechaMala = await estado(s.numero_documento, '2001-01-01');
      expect([sinSolicitud.estado, fechaMala.estado]).toEqual([404, 404]);
      expect(sinSolicitud.cuerpo.message).toBe(fechaMala.cuerpo.message);
    });

    it('exige las dos credenciales (400 si falta una)', async () => {
      expect((await publica('GET', '/status?numero_documento=123')).estado).toBe(400);
      expect((await publica('GET', `/status?fecha_nacimiento=${NACIMIENTO}`)).estado).toBe(400);
    });

    it('rechazada: muestra el motivo para que la familia sepa qué pasó', async () => {
      const s = await radicar();
      await personal('PATCH', `/${s._id}/rechazar`, e.secretaria, { motivo: 'No hay cupo en ese grado' });
      expect((await estado(s.numero_documento)).cuerpo.data).toMatchObject({ estado: 'RECHAZADA', motivo_rechazo: 'No hay cupo en ese grado' });
    });

    it('admitida: la familia ve que fue admitida, todavía sin matrícula', async () => {
      const s = await radicar();
      expect((await personal('PATCH', `/${s._id}/admitir`, e.secretaria)).estado).toBe(200);
      expect((await estado(s.numero_documento)).cuerpo.data).toMatchObject({ estado: 'ADMITIDO', matricula: null });
    });

    it('matriculada: trae el grupo y el folio del Libro de Matrícula', async () => {
      const s = await radicar();
      await aprobar(s._id);

      const { cuerpo } = await estado(s.numero_documento);

      expect(cuerpo.data.estado).toBe('MATRICULADO');
      expect(cuerpo.data.matricula).toMatchObject({ estado: 'MATRICULADO_CONDICIONAL', grupo_nombre: '601', numero_folio: 1 });
      expect(cuerpo.data.matricula.folio_matricula).toEqual(expect.any(String));
    });
  });

  describe('el comprobante y los documentos de la preinscripción', () => {
    it('el comprobante en PDF solo existe con la solicitud matriculada (404 antes)', async () => {
      const s = await radicar();
      const credenciales = { numero_documento: s.numero_documento, fecha_nacimiento: NACIMIENTO };
      expect((await publica('POST', '/comprobante', credenciales)).estado).toBe(404);

      await aprobar(s._id);
      const respuesta = await fetch(`${base}/public/admission-requests/comprobante`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credenciales) });
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toMatch(/application\/pdf/);
      expect(respuesta.headers.get('content-disposition')).toContain(String(s._id).slice(-8).toUpperCase());
      expect(Buffer.from(await respuesta.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('la familia sube un documento: queda CARGADO, por revisar y marcado como subido por la familia', async () => {
      const s = await radicar();
      await aprobar(s._id);

      const r = await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento);

      expect(r.estado).toBe(200);
      expect(r.cuerpo.data.documentos.find((d: { tipo_documento: string }) => d.tipo_documento === 'DOCUMENTO_IDENTIDAD').estado).toBe('CARGADO');
      const pendientes = await listarDocumentosPorRevisar({ academic_year_id: anioId });
      expect(pendientes.data).toHaveLength(1);
      expect(pendientes.data[0]).toMatchObject({ tipo_documento: 'DOCUMENTO_IDENTIDAD', cargado_por_tipo: 'FAMILIA' });
    });

    it('nunca devuelve la ruta del archivo en el disco', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const r = await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento);
      expect(JSON.stringify(r.cuerpo)).not.toMatch(/archivo_path|uploads|\.pdf/);
    });

    it('rechaza lo que no es un PDF o imagen real, aunque diga serlo (se confirma por firma de bytes)', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const falso = await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento, { contenido: 'esto es texto plano', nombre: 'identidad.pdf', mime: 'application/pdf' });
      expect(falso.estado).toBe(400);
      expect((await Enrollment.findOne({ estado: 'MATRICULADO_CONDICIONAL' }))!.checklist.find((c) => c.tipo_documento === 'DOCUMENTO_IDENTIDAD')!.estado).toBe('PENDIENTE');
    });

    it('exige el archivo y un documento que ese grado pida', async () => {
      const s = await radicar();
      await aprobar(s._id);
      expect((await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento, null)).estado).toBe(400);
      const noAplica = await subirDocumento('CARNE_VACUNAS', s.numero_documento);
      expect(noAplica.estado).toBe(400);
      expect(noAplica.cuerpo.message).toMatch(/no aplica/i);
    });

    it('sin credenciales válidas no se puede subir nada (404, igual que si no existiera)', async () => {
      const s = await radicar();
      await aprobar(s._id);
      expect((await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento, PDF, '2001-01-01')).estado).toBe(404);
      expect((await subirDocumento('DOCUMENTO_IDENTIDAD', '00000000')).estado).toBe(404);
    });

    it('con la solicitud aún pendiente no hay matrícula: no se puede subir documentos todavía', async () => {
      const s = await radicar();
      expect((await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento)).estado).toBe(404);
    });

    it('un documento ya aprobado por secretaría no se reemplaza (409), y con la matrícula definitiva ya no se admiten documentos', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const matricula = (await Enrollment.findOne({ estado: 'MATRICULADO_CONDICIONAL' }))!;
      await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento);
      await personal('PATCH', `/${matricula._id}/checklist/DOCUMENTO_IDENTIDAD/revisar`, e.secretaria, { estado: 'APROBADO' }, '/enrollments');

      expect((await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento)).estado).toBe(409);

      await Enrollment.updateOne({ _id: matricula._id }, { estado: 'MATRICULADO_DEFINITIVO', folio_matricula: 'L1-F000001-2026', numero_libro: 1, numero_folio: 1 });
      const cerrada = await subirDocumento('FOTO', s.numero_documento);
      expect(cerrada.estado).toBe(409);
      expect(cerrada.cuerpo.message).toMatch(/ya no admite/i);
    });
  });

  describe('la bandeja de secretaría', () => {
    it('solo la ve el personal de matrículas: sin sesión 401; docente y estudiante 403', async () => {
      expect((await personal('GET', '', null)).estado).toBe(401);
      expect((await personal('GET', '', e.docenteDeClase)).estado).toBe(403);
      expect((await personal('GET', '', e.estudiante)).estado).toBe(403);
      for (const usuario of [e.secretaria, e.coordAcademico, e.admin]) expect((await personal('GET', '', usuario)).estado).toBe(200);
    });

    it('lista del más reciente al más antiguo, con grado, y filtra por estado y por nombre o documento', async () => {
      const a = await radicar({ nombre_aspirante: 'Camila' });
      const b = await radicar({ nombre_aspirante: 'Daniel' });
      await personal('PATCH', `/${b._id}/rechazar`, e.secretaria, { motivo: 'Documentación incompleta' });

      const todas = await personal('GET', '', e.secretaria);
      expect(todas.cuerpo.total).toBe(2);
      expect(todas.cuerpo.data.map((s: { nombre_aspirante: string }) => s.nombre_aspirante)).toEqual(['Daniel', 'Camila']);
      expect(todas.cuerpo.data[0].grado_deseado_id).toMatchObject({ nombre: 'Sexto' });

      expect((await personal('GET', '?estado=PENDIENTE', e.secretaria)).cuerpo.data).toHaveLength(1);
      expect((await personal('GET', `?search=${a.numero_documento}`, e.secretaria)).cuerpo.data).toHaveLength(1);
      expect((await personal('GET', '?search=daniel', e.secretaria)).cuerpo.data).toHaveLength(1);
      expect((await personal('GET', '?estado=INVENTADO', e.secretaria)).estado).toBe(400);
    });

    it('consulta una solicitud por id, y una que no existe es 404', async () => {
      const s = await radicar();
      expect((await personal('GET', `/${s._id}`, e.secretaria)).cuerpo.data).toMatchObject({ numero_documento: s.numero_documento });
      expect((await personal('GET', '/64b000000000000000000000', e.secretaria)).estado).toBe(404);
    });
  });

  describe('admitir', () => {
    it('deja la solicitud ADMITIDO con quién y cuándo, sin crear cuenta, matrícula ni consumir cupo', async () => {
      const s = await radicar();
      const antes = { usuarios: await User.countDocuments(), cupos: await cupos() };

      const r = await personal('PATCH', `/${s._id}/admitir`, e.secretaria);

      expect(r.estado).toBe(200);
      const guardada = (await AdmissionRequest.findById(s._id))!;
      expect(guardada.estado).toBe('ADMITIDO');
      expect(String(guardada.revisado_por)).toBe(String(e.secretaria._id));
      expect(await User.countDocuments()).toBe(antes.usuarios);
      expect(await cupos()).toBe(antes.cupos);
    });

    it('una rechazada o ya matriculada no se admite, y solo lo hace el personal de matrículas', async () => {
      const rechazada = await radicar();
      await personal('PATCH', `/${rechazada._id}/rechazar`, e.secretaria, { motivo: 'Fuera de edad para el grado' });
      expect((await personal('PATCH', `/${rechazada._id}/admitir`, e.secretaria)).estado).toBe(400);

      const matriculada = await radicar();
      await aprobar(matriculada._id);
      expect((await personal('PATCH', `/${matriculada._id}/admitir`, e.secretaria)).estado).toBe(400);

      const s = await radicar();
      expect((await personal('PATCH', `/${s._id}/admitir`, e.docenteDeClase)).estado).toBe(403);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('PENDIENTE');
    });

    it('para el año siguiente solo se acepta cuando el año anterior ya tiene resuelta la promoción de todos sus estudiantes', async () => {
      const actual = (await AcademicYear.findById(anioId))!;
      const siguiente = await AcademicYear.create({
        institucion_id: actual.institucion_id,
        year: actual.year + 1,
        nombre: `Año ${actual.year + 1}`,
        calendario: 'A',
        fecha_inicio: new Date(Date.UTC(actual.year + 1, 0, 1)),
        fecha_fin: new Date(Date.UTC(actual.year + 1, 11, 31)),
        estado: 'PLANIFICACION',
        periodos: periodosDe(actual.year + 1),
      });
      const g = (await Group.findById(grupoId))!;
      const grupoSiguiente = await Group.create({ sede_id: g.sede_id, academic_year_id: siguiente._id, grade_id: g.grade_id, jornada_id: g.jornada_id, nomenclatura: '601', max_capacity: 30 });
      const s = await radicar({ academic_year_id: String(siguiente._id) });
      const paraElSiguiente = { group_id: String(grupoSiguiente._id), academic_year_id: String(siguiente._id) };

      const bloqueada = await personal('PATCH', `/${s._id}/admitir`, e.secretaria);
      expect(bloqueada.estado).toBe(409);
      expect(bloqueada.cuerpo.message).toMatch(/resultado final de promoción/i);
      expect((await aprobar(s._id, paraElSiguiente)).estado).toBe(409);
      expect(await Enrollment.countDocuments({ academic_year_id: siguiente._id })).toBe(0);
      expect(await cupos(String(grupoSiguiente._id))).toBe(0);

      // Con los estudiantes del año que termina retirados, ya no hay a quién esperar.
      await Enrollment.updateMany({ academic_year_id: actual._id }, { estado: 'RETIRADO' });
      expect((await personal('PATCH', `/${s._id}/admitir`, e.secretaria)).estado).toBe(200);
      expect((await aprobar(s._id, paraElSiguiente)).estado).toBe(200);
      expect(await cupos(String(grupoSiguiente._id))).toBe(1);
    });
  });

  describe('matricular (aprobar)', () => {
    it('crea al estudiante, su perfil, el acudiente y la matrícula condicional con folio y cupo ocupado', async () => {
      const s = await radicar();
      const antes = await cupos();
      const limite = diasDespues(20);

      const r = await aprobar(s._id, { fecha_limite_compromiso: limite });

      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ estado: 'MATRICULADO' });
      expect(r.cuerpo.data.enrollment_id).toBeTruthy();
      expect(r.cuerpo.data.student_user_id).toBeTruthy();
      expect(await cupos()).toBe(antes + 1);

      const estudiante = (await User.findById(r.cuerpo.data.student_user_id).select('+password_hash'))!;
      expect(estudiante.roles).toContain('ESTUDIANTE');
      expect(estudiante.debe_cambiar_password).toBe(true);
      expect(await estudiante.comparePassword(s.numero_documento)).toBe(true);
      expect(await StudentProfile.findOne({ user_id: estudiante._id })).toMatchObject({ estado: 'ACTIVO' });

      const matricula = (await Enrollment.findById(r.cuerpo.data.enrollment_id))!;
      expect(matricula).toMatchObject({ estado: 'MATRICULADO_CONDICIONAL', tipo_ingreso: 'NUEVO', numero_folio: 1 });
      expect(matricula.folio_matricula).toEqual(expect.any(String));
      expect(matricula.fecha_limite_compromiso!.toISOString().slice(0, 10)).toBe(limite);
      expect(matricula.checklist.length).toBeGreaterThan(0);
      expect(matricula.checklist.every((c) => c.estado === 'PENDIENTE')).toBe(true);

      const acudiente = (await Guardian.findOne())!;
      expect(acudiente).toMatchObject({ numero_documento: `TEL-${s.acudiente_telefono}`, email: s.acudiente_email });
      expect(await StudentGuardian.findOne({ student_id: estudiante._id })).toMatchObject({ parentesco: 'TUTOR_LEGAL', es_principal: true });
      expect(await AuditLog.countDocuments({ accion: 'ADMISION_MATRICULADA', entidad: 'AdmissionRequest' })).toBe(1);
      expect(await AuditLog.countDocuments({ accion: 'MATRICULA_CREADA', entidad: 'Enrollment' })).toBe(1);
    });

    it('si el acudiente trae todos los documentos nace definitiva, sin fecha de compromiso y con cada obligatorio verificado en físico', async () => {
      const s = await radicar();
      const r = await aprobar(s._id, { trae_todos: 'SI', fecha_limite_compromiso: undefined });

      expect(r.estado).toBe(200);
      const matricula = (await Enrollment.findById(r.cuerpo.data.enrollment_id))!;
      expect(matricula).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO', fecha_limite_compromiso: null });
      expect(matricula.checklist.every((c) => c.estado === 'APROBADO' && c.fecha_verificacion_fisica && !c.archivo_path)).toBe(true);
    });

    it('exige decir si trae todos los documentos, y la fecha del acta cuando no los trae', async () => {
      const s = await radicar();
      const sinRespuesta = await personal('PATCH', `/${s._id}/aprobar`, e.secretaria, { group_id: grupoId, academic_year_id: anioId });
      expect(sinRespuesta.estado).toBe(400);
      const sinFecha = await aprobar(s._id, { fecha_limite_compromiso: undefined });
      expect(sinFecha.estado).toBe(400);
      expect(await Enrollment.countDocuments({ student_id: { $nin: [e.estudiante._id, e.otroEstudiante._id, e.tercerEstudiante._id] } })).toBe(0);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('PENDIENTE');
    });

    it('los documentos que se recibieron con la solicitud pasan al checklist como CARGADO, por revisar', async () => {
      const s = await radicar();
      await AdmissionRequest.updateOne({ _id: s._id }, { $set: { documentos: [{ tipo_documento: 'DOCUMENTO_IDENTIDAD', archivo_path: 'admisiones/x/identidad.pdf', cargado_por: e.secretaria._id, fecha_carga: new Date() }] } });
      const r = await aprobar(s._id);
      const matricula = (await Enrollment.findById(r.cuerpo.data.enrollment_id))!;
      expect(matricula.checklist.find((c) => c.tipo_documento === 'DOCUMENTO_IDENTIDAD')).toMatchObject({ estado: 'CARGADO', cargado_por_tipo: 'PERSONAL' });
    });

    it('el acudiente queda como ficha de contacto: no se le crea cuenta ni acceso al portal al matricular', async () => {
      const s = await radicar();
      await aprobar(s._id);
      expect(await Guardian.findOne({ user_id: { $ne: null } })).toBeNull();
      expect(await User.countDocuments({ roles: 'ACUDIENTE' })).toBe(0);
    });

    it('no se matricula dos veces ni una ya rechazada', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const otra = await aprobar(s._id);
      expect(otra.estado).toBe(400);
      expect(otra.cuerpo.message).toMatch(/ya fue matriculada/i);

      const r = await radicar();
      await personal('PATCH', `/${r._id}/rechazar`, e.secretaria, { motivo: 'Fuera de edad para el grado' });
      const rechazada = await aprobar(r._id);
      expect(rechazada.estado).toBe(400);
      expect(rechazada.cuerpo.message).toMatch(/rechazada/i);
    });

    it('con el grupo lleno o cerrado responde 409 y no deja nada a medias (sin usuario ni matrícula)', async () => {
      const g = (await Group.findById(grupoId))!;
      const lleno = await Group.create({ sede_id: g.sede_id, academic_year_id: g.academic_year_id, grade_id: g.grade_id, jornada_id: g.jornada_id, nomenclatura: '602', max_capacity: 1, cupos_ocupados: 1 });
      const cerrado = await Group.create({ sede_id: g.sede_id, academic_year_id: g.academic_year_id, grade_id: g.grade_id, jornada_id: g.jornada_id, nomenclatura: '603', max_capacity: 30, estado: 'CLOSED' });
      const s = await radicar();
      const usuarios = await User.countDocuments();

      for (const grupo of [lleno, cerrado]) {
        const r = await aprobar(s._id, { group_id: String(grupo._id) });
        expect(r.estado).toBe(409);
        expect(r.cuerpo.message).toMatch(/cupos|activo/i);
      }
      expect(await User.countDocuments()).toBe(usuarios);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('PENDIENTE');
      expect(await cupos(String(lleno._id))).toBe(1);
    });

    it('LIMITACIÓN ACTUAL: al matricular se elige el grupo a mano y no se comprueba que sea del grado que pidió la familia (al radicar sí se valida la oferta)', async () => {
      const g = (await Group.findById(grupoId))!;
      const septimo = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
      const otroGrado = await Group.create({ sede_id: g.sede_id, academic_year_id: g.academic_year_id, grade_id: septimo._id, jornada_id: g.jornada_id, nomenclatura: '701', max_capacity: 30 });
      const s = await radicar();

      const r = await aprobar(s._id, { group_id: String(otroGrado._id) });

      expect(r.estado).toBe(200);
      expect(await Enrollment.findById(r.cuerpo.data.enrollment_id)).toMatchObject({ group_id: otroGrado._id });
    });

    it('dos hermanos con el mismo acudiente: un solo acudiente, y el correo repetido se desambigua con el documento', async () => {
      const uno = await radicar({ acudiente_telefono: '3105550000', acudiente_email: 'familia@correo.com' });
      const dos = await radicar({ acudiente_telefono: '3105550000', acudiente_email: 'familia@correo.com' });

      const a = await aprobar(uno._id);
      const b = await aprobar(dos._id);

      expect([a.estado, b.estado]).toEqual([200, 200]);
      expect(await Guardian.countDocuments()).toBe(1);
      expect(await StudentGuardian.countDocuments()).toBe(2);
      expect((await User.findById(a.cuerpo.data.student_user_id))!.email).toBe('familia@correo.com');
      expect((await User.findById(b.cuerpo.data.student_user_id))!.email).toBe(`familia+${dos.numero_documento}@correo.com`);
      expect((await Enrollment.findById(b.cuerpo.data.enrollment_id))!.numero_folio).toBe(2);
    });

    it('lo que la familia declaró sobre apoyos pasa a la bandeja de orientación (M16) en la misma operación', async () => {
      const s = await radicar({ apoyo_declarado: { motivo_declarado: 'Diagnóstico de TDAH', aporta_soporte: true } });
      const r = await aprobar(s._id);
      const solicitud = (await SolicitudApoyo.findOne({ student_id: r.cuerpo.data.student_user_id }))!;
      expect(solicitud).toMatchObject({ origen: 'PREINSCRIPCION' });
    });

    it('solo el personal de matrículas matricula: docente y estudiante 403', async () => {
      const s = await radicar();
      expect((await aprobar(s._id, {}, e.docenteDeClase)).estado).toBe(403);
      expect((await aprobar(s._id, {}, e.estudiante)).estado).toBe(403);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('PENDIENTE');
    });
  });

  describe('rechazar', () => {
    it('exige el motivo y deja la solicitud RECHAZADA con quién y cuándo, sin crear cuenta ni matrícula', async () => {
      const s = await radicar();
      expect((await personal('PATCH', `/${s._id}/rechazar`, e.secretaria, {})).estado).toBe(400);

      const r = await personal('PATCH', `/${s._id}/rechazar`, e.secretaria, { motivo: 'No hay cupo en ese grado' });

      expect(r.estado).toBe(200);
      const guardada = (await AdmissionRequest.findById(s._id))!;
      expect(guardada).toMatchObject({ estado: 'RECHAZADA', motivo_rechazo: 'No hay cupo en ese grado' });
      expect(String(guardada.revisado_por)).toBe(String(e.secretaria._id));
      expect(guardada.fecha_revision).toBeInstanceOf(Date);
      expect(await Enrollment.countDocuments({ student_id: { $nin: [e.estudiante._id, e.otroEstudiante._id, e.tercerEstudiante._id] } })).toBe(0);
    });

    it('una matriculada no se puede rechazar', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const r = await personal('PATCH', `/${s._id}/rechazar`, e.secretaria, { motivo: 'Cambio de opinión' });
      expect(r.estado).toBe(400);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('MATRICULADO');
    });
  });

  describe('el recorrido completo: solicitud → admisión → matrícula → documentos', () => {
    it('termina en una matrícula con folio, y la familia ve el resultado y sube lo que le falta', async () => {
      const s = await radicar();
      await personal('PATCH', `/${s._id}/admitir`, e.secretaria);
      const matriculada = await aprobar(s._id);
      const matriculaId = matriculada.cuerpo.data.enrollment_id;

      // La matrícula nace condicional con su folio: la familia sube el documento y secretaría lo aprueba desde su bandeja.
      await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento);
      const revisada = await personal('PATCH', `/${matriculaId}/checklist/DOCUMENTO_IDENTIDAD/revisar`, e.secretaria, { estado: 'APROBADO' }, '/enrollments');
      expect(revisada.estado).toBe(200);

      const consulta = (await estado(s.numero_documento)).cuerpo.data;
      expect(consulta).toMatchObject({ estado: 'MATRICULADO', matricula: { estado: 'MATRICULADO_CONDICIONAL', numero_folio: 1 } });
      expect((await subirDocumento('FOTO', s.numero_documento)).estado).toBe(200);
    });
  });
});
