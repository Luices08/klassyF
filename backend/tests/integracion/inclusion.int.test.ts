import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Area from '../../src/models/area.model';
import AuditLog from '../../src/models/auditLog.model';
import DocumentoPiar from '../../src/models/documentoPiar.model';
import ExpedienteInclusion from '../../src/models/expedienteInclusion.model';
import Institution from '../../src/models/institution.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import StudyPlan from '../../src/models/studyPlan.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import * as ajustes from '../../src/services/ajusteAsignatura.service';
import * as documentos from '../../src/services/documentoPiar.service';
import { createEnrollment } from '../../src/services/enrollment.service';
import * as expedientes from '../../src/services/expedienteInclusion.service';
import * as solicitudes from '../../src/services/solicitudApoyo.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const pdfFalso = (): Express.Multer.File =>
  ({ buffer: Buffer.from('%PDF-1.4 escaneo firmado'), mimetype: 'application/pdf', size: 24, originalname: 'acta-firmada.pdf' }) as Express.Multer.File;

const ajusteCompleto = { objetivo_flexibilizado: 'Comprender fracciones', barrera_asignatura: 'No lee el tablero', ajuste_metodologico: 'Material ampliado', ajuste_evaluativo: 'Sustentación oral' };

describe('M16: inclusión (con base de datos)', () => {
  let e: Escenario;
  let docenteLenguaje: UserDocument;
  let matematicas: string;
  let lenguaje: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await detenerBaseDeDatos();
    await fs.rm(path.join(process.cwd(), 'uploads', 'inclusion'), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([SolicitudApoyo.syncIndexes(), ExpedienteInclusion.syncIndexes(), DocumentoPiar.syncIndexes()]);
    e = await armarEscenario();

    const institucion = (await Institution.findOne())!;
    const anio = (await AcademicYear.findOne())!;
    const area = await Area.create({ institucion_id: institucion._id, nombre: 'Matemáticas', descripcion: 'Área', codigo: 'MAT' });
    const areaLen = await Area.create({ institucion_id: institucion._id, nombre: 'Humanidades', descripcion: 'Área', codigo: 'HUM' });
    const mat = await Subject.create({ area_id: area._id, nombre: 'Matemáticas', abreviatura: 'MAT', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
    const len = await Subject.create({ area_id: areaLen._id, nombre: 'Lengua Castellana', abreviatura: 'LEN', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
    matematicas = String(mat._id);
    lenguaje = String(len._id);

    const { default: Group } = await import('../../src/models/group.model');
    const grupo = (await Group.findOne())!;
    await StudyPlan.create({
      institucion_id: institucion._id,
      academic_year_id: anio._id,
      grades: [
        {
          grade_id: grupo.grade_id,
          asignaturas: [
            { subject_id: mat._id, intensidad_horaria_semanal: 4 },
            { subject_id: len._id, intensidad_horaria_semanal: 4 },
          ],
          evaluaciones_area: [],
          personalizaciones_grupo: [],
        },
      ],
    });
    docenteLenguaje = await crearUsuario('DOCENTE', { sedes_ids: grupo.sede_id ? [grupo.sede_id] : [] });
    await TeacherAssignment.create({ docente_id: e.docenteDeClase._id, academic_year_id: anio._id, tipo_asignacion: 'CLASE', group_id: grupo._id, subject_id: mat._id, horas_semanales: 4 });
    await TeacherAssignment.create({ docente_id: docenteLenguaje._id, academic_year_id: anio._id, tipo_asignacion: 'CLASE', group_id: grupo._id, subject_id: len._id, horas_semanales: 4 });
  }, 60_000);

  const abrirConConsentimiento = async () => {
    const solicitud = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Usa gafas de aumento especiales' }, e.docenteDeClase);
    await solicitudes.valorarSolicitud(String(solicitud._id), e.orientador);
    const resuelta = await solicitudes.resolverSolicitud(String(solicitud._id), { resultado: 'ABRIR_PIAR', motivo: 'Baja visión certificada por la familia' }, e.orientador);
    const id = resuelta.expediente_id as string;
    await expedientes.registrarConsentimiento(id, { otorgado_por_nombre: 'Marta Morales', parentesco: 'Madre' }, e.orientador);
    return id;
  };

  describe('solicitudes de apoyo', () => {
    it('un docente de la clase reporta, y solo orientación ve lo declarado (la coordinación ve la fila sin el contenido)', async () => {
      await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Se le dificulta leer el tablero', observacion: 'Desde febrero' }, e.docenteDeClase);

      const orientacion = await solicitudes.bandejaDeSolicitudes(e.orientador, { pagina: 1, limite: 20 });
      expect(orientacion.data[0]).toMatchObject({ origen: 'DOCENTE', motivo_declarado: 'Se le dificulta leer el tablero' });

      const coordinacion = await solicitudes.bandejaDeSolicitudes(e.coordAcademico, { pagina: 1, limite: 20 });
      expect(coordinacion.total).toBe(1);
      expect(coordinacion.data[0]).not.toHaveProperty('motivo_declarado');

      const mias = await solicitudes.misSolicitudes(e.docenteDeClase);
      expect(mias[0]).toEqual(expect.objectContaining({ estado: 'PENDIENTE' }));
      expect(mias[0]).not.toHaveProperty('motivo_declarado');
    });

    it('un docente que no dicta ni dirige el grupo no puede reportar (404, igual que si no existiera) y duplicar da 409', async () => {
      await expect(solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Reporte sin vínculo' }, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
      await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Primer reporte' }, e.docenteDeClase);
      await expect(solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Segundo reporte' }, e.directora)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('la bandeja es de las sedes del usuario: orientación de otra sede no ve ni puede tomar la solicitud', async () => {
      const s = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Reporte' }, e.docenteDeClase);
      expect((await solicitudes.bandejaDeSolicitudes(e.orientadorOtraSede, { pagina: 1, limite: 20 })).total).toBe(0);
      await expect(solicitudes.valorarSolicitud(String(s._id), e.orientadorOtraSede)).rejects.toMatchObject({ statusCode: 404 });
      await expect(solicitudes.bandejaDeSolicitudes(e.secretaria, { pagina: 1, limite: 20 })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('no se resuelve sin tomarla antes; descartar exige motivo y no crea expediente', async () => {
      const s = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Reporte' }, e.docenteDeClase);
      await expect(solicitudes.resolverSolicitud(String(s._id), { resultado: 'DESCARTAR', motivo: 'No procede' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await solicitudes.valorarSolicitud(String(s._id), e.orientador);
      const resuelta = await solicitudes.resolverSolicitud(String(s._id), { resultado: 'SEGUIMIENTO_PSICOSOCIAL', motivo: 'Se atiende por orientación' }, e.orientador);
      expect(resuelta).toMatchObject({ estado: 'DESCARTADA', expediente_id: null });
      expect(await ExpedienteInclusion.countDocuments()).toBe(0);
    });

    it('lo declarado en la matrícula (M04) llega a la bandeja dentro de la misma transacción', async () => {
      const nuevo = await crearUsuario('ESTUDIANTE');
      const { default: Group } = await import('../../src/models/group.model');
      const grupo = (await Group.findOne())!;
      await createEnrollment(
        {
          student_id: nuevo._id,
          group_id: grupo._id,
          academic_year_id: grupo.academic_year_id,
          tipo_ingreso: 'NUEVO',
          estado_inicial: 'MATRICULADO_DEFINITIVO',
          apoyo_declarado: { motivo_declarado: 'Es hiperactivo y se distrae mucho', aporta_soporte: true },
        },
        { id: e.secretaria._id, rol: 'SECRETARIA' }
      );
      const solicitud = await SolicitudApoyo.findOne({ student_id: nuevo._id });
      expect(solicitud).toMatchObject({ origen: 'MATRICULA', estado: 'PENDIENTE', aporta_soporte: true });
    });
  });

  describe('expediente, consentimiento y ajustes', () => {
    it('sin la autorización del responsable legal no se guarda nada clínico ni se inicia la construcción', async () => {
      const s = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Baja visión' }, e.docenteDeClase);
      await solicitudes.valorarSolicitud(String(s._id), e.orientador);
      const id = String((await solicitudes.resolverSolicitud(String(s._id), { resultado: 'ABRIR_PIAR', motivo: 'Hay soporte' }, e.orientador)).expediente_id);

      await expect(expedientes.actualizarSeccion(id, 'anexo_info_general', { salud: { diagnostico_medico: 'Baja visión' } }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      await expect(expedientes.iniciarConstruccion(id, e.orientador)).rejects.toMatchObject({ statusCode: 409 });

      await expedientes.registrarConsentimiento(id, { otorgado_por_nombre: 'Marta Morales', parentesco: 'Madre' }, e.orientador);
      await expedientes.actualizarSeccion(id, 'anexo_info_general', { salud: { diagnostico_medico: 'Baja visión' } }, e.orientador);
      await expect(expedientes.iniciarConstruccion(id, e.orientador)).resolves.toEqual({ estado: 'EN_CONSTRUCCION' });
    });

    it('uno por estudiante y año: abrir otro da 409', async () => {
      const id = await abrirConConsentimiento();
      expect(id).toBeTruthy();
      await expect(expedientes.abrirExpediente({ student_id: String(e.estudiante._id), tipo: 'PIAR' }, e.orientador)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cada docente edita solo la asignatura que dicta; el director ve todas pero no edita; el ajeno no ve nada', async () => {
      const id = await abrirConConsentimiento();
      await expedientes.iniciarConstruccion(id, e.orientador);

      await ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.docenteDeClase);
      await expect(ajustes.guardarAjuste(id, lenguaje, ajusteCompleto, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.directora)).rejects.toMatchObject({ statusCode: 403 });
      await expect(ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });

      expect((await ajustes.listarAjustes(id, e.docenteDeClase)).filas.map((f) => f.asignatura)).toEqual(['Matemáticas']);
      expect((await ajustes.listarAjustes(id, e.directora)).filas).toHaveLength(2);
      await expect(ajustes.listarAjustes(id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('no se diligencia con el expediente en borrador, y un DBA de otra área se rechaza', async () => {
      const s = await solicitudes.crearSolicitud({ student_id: String(e.estudiante._id), motivo_declarado: 'Baja visión' }, e.docenteDeClase);
      await solicitudes.valorarSolicitud(String(s._id), e.orientador);
      const id = String((await solicitudes.resolverSolicitud(String(s._id), { resultado: 'ABRIR_PIAR', motivo: 'Hay soporte' }, e.orientador)).expediente_id);
      await expect(ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });

      await expedientes.registrarConsentimiento(id, { otorgado_por_nombre: 'Marta Morales', parentesco: 'Madre' }, e.orientador);
      await expedientes.iniciarConstruccion(id, e.orientador);
      await expect(ajustes.guardarAjuste(id, matematicas, { dba_ids: ['64b000000000000000000000'] }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('la coordinación solo aprueba cuando todo está completo; editar un expediente aprobado lo devuelve a construcción', async () => {
      const id = await abrirConConsentimiento();
      await expedientes.actualizarSeccion(id, 'caracteristicas', { gustos_intereses: 'Música', lo_que_hace_puede_requiere_apoyo: 'Lee con lupa' }, e.orientador);
      await expedientes.iniciarConstruccion(id, e.orientador);
      await ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.docenteDeClase);

      await expect(expedientes.aprobarExpediente(id, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
      await ajustes.guardarAjuste(id, lenguaje, ajusteCompleto, docenteLenguaje);
      await expect(expedientes.aprobarExpediente(id, e.orientador)).rejects.toMatchObject({ statusCode: 404 });
      await expect(expedientes.aprobarExpediente(id, e.coordAcademico)).resolves.toEqual({ estado: 'LISTO_PARA_ACUERDO' });

      await ajustes.guardarAjuste(id, matematicas, { ...ajusteCompleto, recursos: 'Lupa' }, e.docenteDeClase);
      const exp = await ExpedienteInclusion.findById(id);
      expect(exp).toMatchObject({ estado: 'EN_CONSTRUCCION', aprobado: null, version: 2 });
    });
  });

  describe('quién ve qué', () => {
    it('el docente recibe la ficha pedagógica sin modalidad, categoría, diagnóstico ni consentimiento; orientación recibe todo; coordinación, sin lo clínico', async () => {
      const id = await abrirConConsentimiento();
      await expedientes.actualizarSeccion(id, 'categoria_discapacidad', 'VISUAL_BAJA_VISION', e.orientador);
      await expedientes.actualizarSeccion(id, 'anexo_info_general', { salud: { diagnostico_medico: 'Baja visión bilateral' } }, e.orientador);
      await expedientes.actualizarSeccion(id, 'caracteristicas', { recomendaciones_aula: 'Primera fila', alerta_seguridad_aula: 'Reportar dolor de cabeza' }, e.orientador);

      const docente = await expedientes.obtenerExpediente(id, e.docenteDeClase);
      expect(docente).toMatchObject({ modalidad_visible: false });
      expect(docente.ficha_pedagogica.recomendaciones_aula).toBe('Primera fila');
      const texto = JSON.stringify(docente);
      for (const prohibido of ['VISUAL_BAJA_VISION', 'Baja visión bilateral', 'consentimiento', 'anexo_info_general', 'categoria_discapacidad']) expect(texto).not.toContain(prohibido);

      // La directora del grupo ve todos los ajustes, pero tampoco ve la modalidad (revelaría la condición).
      const directora = await expedientes.obtenerExpediente(id, e.directora);
      expect(directora).not.toHaveProperty('tipo');
      expect(directora).toMatchObject({ modalidad_visible: false, usa_ajustes: true });

      const orientacion = await expedientes.obtenerExpediente(id, e.orientador);
      expect(orientacion).toMatchObject({ categoria_discapacidad: 'VISUAL_BAJA_VISION' });

      const coordinacion = JSON.stringify(await expedientes.obtenerExpediente(id, e.coordAcademico));
      expect(coordinacion).not.toContain('Baja visión bilateral');
      expect(coordinacion).not.toContain('VISUAL_BAJA_VISION');
    });

    it('no existe acceso para secretaría, convivencia, orientación de otra sede ni un docente sin vínculo (404)', async () => {
      const id = await abrirConConsentimiento();
      for (const usuario of [e.secretaria, e.coordConvivencia, e.orientadorOtraSede, e.docenteAjeno]) {
        await expect(expedientes.obtenerExpediente(id, usuario)).rejects.toMatchObject({ statusCode: 404 });
      }
    });

    it('toda consulta de un expediente queda auditada, sin contenido en el detalle', async () => {
      const id = await abrirConConsentimiento();
      await expedientes.obtenerExpediente(id, e.orientador);
      const evento = await AuditLog.findOne({ accion: 'INCLUSION_EXPEDIENTE_CONSULTADO' });
      expect(evento).toBeTruthy();
      expect(evento?.detalle).toBeNull();
    });
  });

  describe('documentos y firma', () => {
    const prepararParaAcuerdo = async () => {
      const id = await abrirConConsentimiento();
      await expedientes.actualizarSeccion(id, 'caracteristicas', { gustos_intereses: 'Música', lo_que_hace_puede_requiere_apoyo: 'Lee con lupa' }, e.orientador);
      await expedientes.actualizarSeccion(id, 'compromisos_familia', [{ actividad: 'Lectura', descripcion: '30 minutos', frecuencia: 'DIARIA' }], e.orientador);
      await expedientes.iniciarConstruccion(id, e.orientador);
      await ajustes.guardarAjuste(id, matematicas, ajusteCompleto, e.docenteDeClase);
      await ajustes.guardarAjuste(id, lenguaje, ajusteCompleto, docenteLenguaje);
      await expedientes.aprobarExpediente(id, e.coordAcademico);
      return id;
    };

    it('el flujo completo: PIAR → acta → firma del rector con escaneo → expediente ACTIVO → seguimiento', async () => {
      const id = await prepararParaAcuerdo();

      await expect(documentos.emitirDocumento(id, 'ACTA_ACUERDO_FAMILIA', e.orientador)).rejects.toMatchObject({ statusCode: 409 });
      const piar = await documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador);
      const acta = await documentos.emitirDocumento(id, 'ACTA_ACUERDO_FAMILIA', e.orientador);
      expect(piar.codigo).toMatch(/^PIAR-\d{4}-0001$/);
      expect(acta.codigo).toMatch(/^AAF-\d{4}-0001$/);
      expect(acta.snapshot).toMatchObject({ referencia_piar: { codigo: piar.codigo, hash: piar.hash } });

      // La firma institucional del acta es solo del rector (ADMIN), y exige el escaneo y a quien firma por el estudiante.
      await expect(documentos.firmarDocumento(String(acta._id), { firmantes: [{ nombre: 'Marta Morales', rol: 'ACUDIENTE' }] }, pdfFalso(), e.orientador)).rejects.toMatchObject({ statusCode: 404 });
      await expect(documentos.firmarDocumento(String(acta._id), { firmantes: [{ nombre: 'Marta Morales', rol: 'ACUDIENTE' }] }, undefined, e.admin)).rejects.toMatchObject({ statusCode: 400 });
      await expect(documentos.firmarDocumento(String(acta._id), { firmantes: [{ nombre: 'Marta Morales', rol: 'ACUDIENTE' }] }, { ...pdfFalso(), buffer: Buffer.from('no es pdf') }, e.admin)).rejects.toMatchObject({ statusCode: 400 });

      const firmada = await documentos.firmarDocumento(String(acta._id), { firmantes: [{ nombre: 'Marta Morales', rol: 'ACUDIENTE' }] }, pdfFalso(), e.admin);
      expect(firmada).toMatchObject({ estado: 'FIRMADO' });
      expect(firmada.firma?.firmantes.map((f) => f.rol)).toEqual(['ACUDIENTE', 'DIRECTIVO']);
      expect((await ExpedienteInclusion.findById(id))?.estado).toBe('ACTIVO');

      await ajustes.registrarSeguimiento(id, matematicas, { periodo_numero: 1, efectividad: 'MUY_EFECTIVO', observacion: 'Avanza' }, e.docenteDeClase);
      const lista = await ajustes.listarAjustes(id, e.directora);
      expect(lista.filas.find((f) => f.asignatura === 'Matemáticas')?.ajuste?.seguimientos).toHaveLength(1);
    });

    it('un documento emitido con un contenido que ya cambió no se puede firmar', async () => {
      const id = await prepararParaAcuerdo();
      await documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador);
      const acta = await documentos.emitirDocumento(id, 'ACTA_ACUERDO_FAMILIA', e.orientador);
      await ajustes.guardarAjuste(id, matematicas, { recursos: 'Cambió después de emitir' }, e.docenteDeClase);
      await expect(documentos.firmarDocumento(String(acta._id), { firmantes: [{ nombre: 'Marta Morales', rol: 'ACUDIENTE' }] }, pdfFalso(), e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('re-emitir sustituye la versión sin firmar; lo firmado nunca se sustituye', async () => {
      const id = await prepararParaAcuerdo();
      const v1 = await documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador);
      const v2 = await documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador);
      expect(v2.version).toBe(2);
      expect(v2.codigo).not.toBe(v1.codigo);
      expect((await DocumentoPiar.findById(v1._id))?.estado).toBe('SUSTITUIDO');
    });

    it('la huella detecta una alteración directa en la base, y el modelo impide editar lo emitido', async () => {
      const id = await prepararParaAcuerdo();
      const d = await documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador);
      expect(await documentos.verificarIntegridad(String(d._id), e.orientador)).toMatchObject({ integro: true });

      const cargado = (await DocumentoPiar.findById(d._id))!;
      cargado.set('snapshot', { alterado: true });
      await expect(cargado.save()).rejects.toThrow(/no se puede modificar/);

      await DocumentoPiar.updateOne({ _id: d._id }, { $set: { 'snapshot.alterado': true } });
      expect(await documentos.verificarIntegridad(String(d._id), e.orientador)).toMatchObject({ integro: false });
    });

    it('lo confidencial (Anexo 1) solo lo ven orientación y ADMIN; la coordinación recibe 404 aunque conozca el id', async () => {
      const id = await prepararParaAcuerdo();
      const anexo = await documentos.emitirDocumento(id, 'ANEXO_INFO_GENERAL', e.orientador);
      await expect(documentos.verificarIntegridad(String(anexo._id), e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
      const vistoPorCoordinacion = await documentos.listarDocumentos(id, e.coordAcademico);
      expect(vistoPorCoordinacion.documentos.map((d) => d.clave)).not.toContain('ANEXO_INFO_GENERAL');
      expect((await documentos.listarDocumentos(id, e.orientador)).documentos.map((d) => d.clave)).toContain('ANEXO_INFO_GENERAL');
    });

    it('un año cerrado deja el expediente en solo lectura', async () => {
      const id = await prepararParaAcuerdo();
      await AcademicYear.updateOne({}, { $set: { estado: 'CERRADO' } });
      await expect(ajustes.guardarAjuste(id, matematicas, { recursos: 'x' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 409 });
      await expect(documentos.emitirDocumento(id, 'PIAR_AJUSTES', e.orientador)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
