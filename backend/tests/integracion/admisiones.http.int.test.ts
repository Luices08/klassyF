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
 * estado, el comprobante, la carga de documentos, y la revisión de secretaría (aprobar / rechazar). No dice cómo «debería» ser: fija lo que hace
 * para que cualquier cambio posterior (prematrícula, inscripción asistida, cupos) sea consciente. Lo que hoy es una limitación está marcado como tal.
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
  const aprobar = async (id: unknown, extra: Record<string, unknown> = {}, usuario: UserDocument = e.secretaria) => {
    const r = await personal('PATCH', `/${id}/aprobar`, usuario, { group_id: grupoId, academic_year_id: anioId, ...extra });
    return r;
  };
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

    it('una solicitud ya aprobada tampoco admite una segunda: el mensaje manda a consultar el estado', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const r = await publica('POST', '', datos({ numero_documento: s.numero_documento }));
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/aprobada/i);
    });
  });

  describe('consultar el estado (documento + fecha de nacimiento)', () => {
    it('pendiente: devuelve el estado y todavía no hay preinscripción', async () => {
      const s = await radicar();
      const r = await estado(s.numero_documento);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ estado: 'PENDIENTE', motivo_rechazo: null, preinscripcion: null });
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

    it('aprobada: trae la preinscripción con grado, grupo, sede, jornada, plazo y los documentos que faltan', async () => {
      const s = await radicar();
      await aprobar(s._id);

      const { cuerpo } = await estado(s.numero_documento);

      expect(cuerpo.data.estado).toBe('APROBADA');
      expect(cuerpo.data.preinscripcion).toMatchObject({ grado: 'Sexto', grupo: '601', matricula_estado: 'PREINSCRITO', folio_matricula: null, plazo_vencido: false, puede_subir_documentos: true });
      expect(cuerpo.data.preinscripcion.fecha_limite_legalizacion).toBeTruthy();
      const identidad = cuerpo.data.preinscripcion.documentos.find((d: { tipo_documento: string }) => d.tipo_documento === 'DOCUMENTO_IDENTIDAD');
      expect(identidad).toMatchObject({ obligatorio: true, estado: 'PENDIENTE', comentario: null });
    });
  });

  describe('el comprobante y los documentos de la preinscripción', () => {
    it('el comprobante en PDF solo existe con la solicitud aprobada (404 antes)', async () => {
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
      expect((await Enrollment.findOne({ estado: 'PREINSCRITO' }))!.checklist.find((c) => c.tipo_documento === 'DOCUMENTO_IDENTIDAD')!.estado).toBe('PENDIENTE');
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
      const matricula = (await Enrollment.findOne({ estado: 'PREINSCRITO' }))!;
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

  describe('aprobar', () => {
    it('crea al estudiante, su perfil, el acudiente y una matrícula PREINSCRITO sin folio, con el cupo reservado', async () => {
      const s = await radicar();
      const antes = await cupos();

      const r = await aprobar(s._id);

      expect(r.estado).toBe(200);
      expect(r.cuerpo.data).toMatchObject({ estado: 'APROBADA' });
      expect(r.cuerpo.data.enrollment_id).toBeTruthy();
      expect(r.cuerpo.data.student_user_id).toBeTruthy();
      expect(await cupos()).toBe(antes + 1);

      const estudiante = (await User.findById(r.cuerpo.data.student_user_id).select('+password_hash'))!;
      expect(estudiante.roles).toContain('ESTUDIANTE');
      expect(estudiante.debe_cambiar_password).toBe(true);
      expect(await estudiante.comparePassword(s.numero_documento)).toBe(true);
      expect(await StudentProfile.findOne({ user_id: estudiante._id })).toMatchObject({ estado: 'ACTIVO' });

      const matricula = (await Enrollment.findById(r.cuerpo.data.enrollment_id))!;
      expect(matricula).toMatchObject({ estado: 'PREINSCRITO', tipo_ingreso: 'NUEVO', folio_matricula: null, numero_libro: null, numero_folio: null });
      expect(matricula.checklist.length).toBeGreaterThan(0);
      expect(matricula.checklist.every((c) => c.estado === 'PENDIENTE')).toBe(true);
      const limite = matricula.fecha_limite_legalizacion!.getTime();
      expect(limite).toBeGreaterThan(Date.now());
      expect(limite).toBeLessThan(Date.now() + 16 * 86_400_000);

      const acudiente = (await Guardian.findOne())!;
      expect(acudiente).toMatchObject({ numero_documento: `TEL-${s.acudiente_telefono}`, email: s.acudiente_email });
      expect(await StudentGuardian.findOne({ student_id: estudiante._id })).toMatchObject({ parentesco: 'TUTOR_LEGAL', es_principal: true });
      expect(await AuditLog.countDocuments({ accion: 'USUARIO_CREADO', entidad: 'AdmissionRequest' })).toBe(1);
    });

    it('el acudiente queda como ficha de contacto: no se le crea cuenta ni acceso al portal al aprobar', async () => {
      const s = await radicar();
      await aprobar(s._id);
      expect(await Guardian.findOne({ user_id: { $ne: null } })).toBeNull();
      expect(await User.countDocuments({ roles: 'ACUDIENTE' })).toBe(0);
    });

    it('acepta un plazo propio para legalizar y rechaza uno en el pasado', async () => {
      const s = await radicar();
      expect((await aprobar(s._id, { fecha_limite_legalizacion: '2020-01-01' })).estado).toBe(400);
      const limite = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
      const r = await aprobar(s._id, { fecha_limite_legalizacion: limite });
      expect(r.estado).toBe(200);
      expect((await Enrollment.findById(r.cuerpo.data.enrollment_id))!.fecha_limite_legalizacion!.toISOString().slice(0, 10)).toBe(limite);
    });

    it('no se aprueba dos veces ni una ya rechazada', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const otra = await aprobar(s._id);
      expect(otra.estado).toBe(400);
      expect(otra.cuerpo.message).toMatch(/ya fue aprobada/i);

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

    it('LIMITACIÓN ACTUAL: al aprobar se elige el grupo a mano y no se comprueba que sea del grado que pidió la familia (al radicar sí se valida la oferta)', async () => {
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
    });

    it('lo que la familia declaró sobre apoyos pasa a la bandeja de orientación (M16) en la misma operación', async () => {
      const s = await radicar({ apoyo_declarado: { motivo_declarado: 'Diagnóstico de TDAH', aporta_soporte: true } });
      const r = await aprobar(s._id);
      const solicitud = (await SolicitudApoyo.findOne({ student_id: r.cuerpo.data.student_user_id }))!;
      expect(solicitud).toMatchObject({ origen: 'PREINSCRIPCION' });
    });

    it('solo el personal de matrículas aprueba: docente y estudiante 403', async () => {
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
      expect(await Enrollment.countDocuments({ estado: 'PREINSCRITO' })).toBe(0);
    });

    it('una aprobada no se puede rechazar', async () => {
      const s = await radicar();
      await aprobar(s._id);
      const r = await personal('PATCH', `/${s._id}/rechazar`, e.secretaria, { motivo: 'Cambio de opinión' });
      expect(r.estado).toBe(400);
      expect((await AdmissionRequest.findById(s._id))!.estado).toBe('APROBADA');
    });
  });

  describe('el recorrido completo: solicitud → aprobación → documentos → legalización', () => {
    it('termina en una matrícula con folio, y la familia ve el resultado en la consulta pública', async () => {
      const s = await radicar();
      const aprobada = await aprobar(s._id);
      const matriculaId = aprobada.cuerpo.data.enrollment_id;

      // La familia sube el documento y secretaría lo aprueba desde su bandeja.
      await subirDocumento('DOCUMENTO_IDENTIDAD', s.numero_documento);
      const revisada = await personal('PATCH', `/${matriculaId}/checklist/DOCUMENTO_IDENTIDAD/revisar`, e.secretaria, { estado: 'APROBADO' }, '/enrollments');
      expect(revisada.estado).toBe(200);

      // Legaliza como condicional (faltan documentos): se asigna el folio del Libro de Matrícula.
      const plazo = new Date(Date.now() + 20 * 86_400_000).toISOString();
      const legalizada = await personal('PATCH', `/${matriculaId}/status`, e.secretaria, { estado: 'MATRICULADO_CONDICIONAL', fecha_limite_compromiso: plazo }, '/enrollments');
      expect(legalizada.estado).toBe(200);
      expect(legalizada.cuerpo.data).toMatchObject({ estado: 'MATRICULADO_CONDICIONAL' });
      expect(legalizada.cuerpo.data.folio_matricula).toEqual(expect.any(String));
      expect(legalizada.cuerpo.data.numero_folio).toBe(1);

      // La familia ve el folio y todavía puede subir lo que le falta (condicional).
      const consulta = (await estado(s.numero_documento)).cuerpo.data.preinscripcion;
      expect(consulta).toMatchObject({ matricula_estado: 'MATRICULADO_CONDICIONAL', puede_subir_documentos: true });
      expect(consulta.folio_matricula).toBe(legalizada.cuerpo.data.folio_matricula);
      expect((await subirDocumento('FOTO', s.numero_documento)).estado).toBe(200);
    });
  });
});
