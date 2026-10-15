import fs from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Area from '../../src/models/area.model';
import Campus from '../../src/models/campus.model';
import DocumentoReferencia from '../../src/models/documentoReferencia.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import LiderArea from '../../src/models/liderArea.model';
import PlanArea from '../../src/models/planArea.model';
import PlanAula from '../../src/models/planAula.model';
import StudyPlan from '../../src/models/studyPlan.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import * as anios from '../../src/services/academicYear.service';
import * as actividades from '../../src/services/activity.service';
import * as lideres from '../../src/services/liderArea.service';
import { hoyColombia } from '../../src/services/attendance.service';
import * as documentos from '../../src/services/documentoReferencia.service';
import * as planesArea from '../../src/services/planArea.service';
import * as planesAula from '../../src/services/planAula.service';
import * as asignaciones from '../../src/services/teacherAssignment.service';
import * as ventanas from '../../src/services/ventanaPlanes.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { actor, armarEscenario, crearUsuario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas, proximoDiaHabil } from './escenarioNotas';

const DIA_MS = 86_400_000;
const pdf = (nombre = 'plan.pdf', contenido = '%PDF-1.4 plan de prueba') => ({ buffer: Buffer.from(contenido), mimetype: 'application/pdf', originalname: nombre });
const dia = (offset: number) => new Date(hoyColombia().getTime() + offset * DIA_MS);
const iso = (fecha: Date | string | null) => (fecha ? new Date(fecha).toISOString().slice(0, 10) : null);
const idDe = (x: { _id: unknown }) => String(x._id);

describe('M07: planeación documental (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let lider: UserDocument;
  /** El líder de área designado en la prueba: el plan de área es de lo que él cubre. */
  let liderAreaId = '';
  let gradoId: string;

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(async () => {
    await detenerBaseDeDatos();
    await fs.rm(path.join(UPLOADS_ROOT, 'planeacion'), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([PlanArea.syncIndexes(), PlanAula.syncIndexes(), DocumentoReferencia.syncIndexes(), LiderArea.syncIndexes()]);
    liderAreaId = '';
    e = await armarEscenario();
    n = await prepararNotas(e);
    docente = e.docenteDeClase;
    lider = await crearUsuario('DOCENTE');
    gradoId = String((await Group.findById(n.grupoId))!.grade_id);
  }, 60_000);

  // --- Atajos ---

  const datosArea = (extra: Partial<planesArea.RadicarPlanAreaInput> = {}): planesArea.RadicarPlanAreaInput => ({
    academic_year_id: n.anioId,
    lider_area_id: liderAreaId,
    titulo: 'Plan de área de Matemáticas 2026',
    descripcion: 'Estándares, DBA y secuencia anual.',
    ...extra,
  });

  const datosAula = (extra: Partial<planesAula.RadicarPlanAulaInput> = {}): planesAula.RadicarPlanAulaInput => ({
    academic_year_id: n.anioId,
    periodo_numero: 1,
    subject_id: n.materiaId,
    grade_id: gradoId,
    titulo: 'Plan de aula P1',
    descripcion: 'Unidades, tiempos y evaluación del periodo.',
    ...extra,
  });

  /** El líder de toda el área (alcance por defecto), como lo designa coordinación en un colegio con un jefe por área. */
  const designarLider = async () => {
    const creado = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider) }, actor(e.coordAcademico));
    liderAreaId = creado._id;
    return creado;
  };

  /** El plan de área aprobado por el camino real: el líder lo radica y coordinación lo aprueba. */
  const aprobarPlanDeArea = async () => {
    await designarLider();
    const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf('plan-area.pdf'), lider);
    await planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico);
    return radicado._id;
  };

  /** La asignación se creó hace `dias` días: el docente ya estaba cuando venció la fecha límite. */
  const envejecerAsignacion = (asignacion: TeacherAssignmentDocument, dias: number) =>
    TeacherAssignment.collection.updateOne({ _id: asignacion._id }, { $set: { createdAt: new Date(Date.now() - dias * DIA_MS) } });

  /** Abre la entrega del periodo hoy y la cierra dentro de `hasta` días (o ayer si es negativo). */
  const ventanaDelPeriodo = (numero: number, desde: number, hasta: number) =>
    ventanas.configurarVentana(n.anioId, numero, { fecha_apertura: dia(desde), fecha_limite: dia(hasta) }, e.coordAcademico);

  // --- Documentos de referencia ---

  describe('documentos de referencia', () => {
    const datosDocumento = (extra: Partial<documentos.DatosDocumentoReferencia> = {}): documentos.DatosDocumentoReferencia => ({
      titulo: 'DBA de Matemáticas',
      descripcion: 'Derechos básicos de aprendizaje',
      area_id: n.areaId,
      grados_ids: [gradoId],
      ...extra,
    });

    it('coordinación carga un PDF con su área y grados; la API no entrega la ruta y el archivo queda fuera de Mongo', async () => {
      const creado = await documentos.crearDocumentoReferencia(datosDocumento(), pdf('dba.pdf', '%PDF-1.4 dba'), e.coordAcademico);
      expect(creado).toMatchObject({
        titulo: 'DBA de Matemáticas',
        area: { _id: n.areaId, nombre: 'Matemáticas' },
        grados: [{ _id: gradoId, nombre: 'Sexto' }],
        archivo: { nombre: 'dba.pdf' },
      });
      expect(JSON.stringify(creado)).not.toMatch(/ruta|uploads|sha256/);

      const { ruta } = await documentos.rutaDelDocumentoReferencia(creado._id);
      expect(await fs.readFile(ruta, 'utf8')).toBe('%PDF-1.4 dba');
    });

    it('se lista por área y por grado; un grado distinto no lo trae', async () => {
      const otroGrado = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
      await documentos.crearDocumentoReferencia(datosDocumento({ titulo: 'Solo sexto' }), pdf(), e.coordAcademico);
      await documentos.crearDocumentoReferencia(datosDocumento({ titulo: 'Sexto y séptimo', grados_ids: [gradoId, idDe(otroGrado)] }), pdf(), e.admin);

      expect((await documentos.listarDocumentosReferencia({ area_id: n.areaId, grade_id: gradoId })).map((d) => d.titulo).sort()).toEqual(['Sexto y séptimo', 'Solo sexto']);
      expect((await documentos.listarDocumentosReferencia({ grade_id: idDe(otroGrado) })).map((d) => d.titulo)).toEqual(['Sexto y séptimo']);
      expect(await documentos.listarDocumentosReferencia({ area_id: String(new Types.ObjectId()) })).toEqual([]);
    });

    it('rechaza lo que no es un PDF, o un área o grado que no existen, sin dejar archivos huérfanos', async () => {
      const carpeta = path.join(UPLOADS_ROOT, 'planeacion', 'documentos-referencia');
      const archivos = () => fs.readdir(carpeta).catch(() => [] as string[]);
      const antes = await archivos();

      await expect(documentos.crearDocumentoReferencia(datosDocumento(), undefined, e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });
      await expect(documentos.crearDocumentoReferencia(datosDocumento(), pdf('x.pdf', 'no soy un pdf'), e.coordAcademico)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/no es un PDF/),
      });
      await expect(documentos.crearDocumentoReferencia(datosDocumento({ area_id: String(new Types.ObjectId()) }), pdf(), e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });
      await expect(documentos.crearDocumentoReferencia(datosDocumento({ grados_ids: [String(new Types.ObjectId())] }), pdf(), e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });
      expect(await DocumentoReferencia.countDocuments()).toBe(0);
      expect(await archivos()).toEqual(antes);
    });

    it('editar sus datos o reemplazar el PDF deja un solo archivo; eliminar lo borra todo', async () => {
      const creado = await documentos.crearDocumentoReferencia(datosDocumento(), pdf('v1.pdf', '%PDF-1.4 uno'), e.coordAcademico);
      const rutaV1 = (await documentos.rutaDelDocumentoReferencia(creado._id)).ruta;

      const editado = await documentos.actualizarDocumentoReferencia(creado._id, { titulo: 'DBA 2016 (corregido)' }, undefined, e.coordAcademico);
      expect(editado.titulo).toBe('DBA 2016 (corregido)');
      expect((await documentos.rutaDelDocumentoReferencia(creado._id)).ruta).toBe(rutaV1);

      await documentos.actualizarDocumentoReferencia(creado._id, {}, pdf('v2.pdf', '%PDF-1.4 dos'), e.admin);
      const rutaV2 = (await documentos.rutaDelDocumentoReferencia(creado._id)).ruta;
      expect(rutaV2).not.toBe(rutaV1);
      expect(await fs.readFile(rutaV2, 'utf8')).toBe('%PDF-1.4 dos');
      await expect(fs.access(rutaV1)).rejects.toThrow();

      await documentos.eliminarDocumentoReferencia(creado._id, e.coordAcademico);
      await expect(fs.access(rutaV2)).rejects.toThrow();
      await expect(documentos.rutaDelDocumentoReferencia(creado._id)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // --- Líder de área ---

  describe('líderes de área (por nivel, jornada y sede)', () => {
    const sedeId = async (nombre: string) => String((await Campus.findOne({ nombre }))!._id);

    it('un colegio pequeño designa un solo líder para toda el área: el alcance por defecto es todo', async () => {
      const creado = await designarLider();
      expect(creado).toMatchObject({
        docente: { nombre: lider.nombre, apellido: lider.apellido },
        niveles: [],
        jornada: 'TODAS',
        sedes: [],
        alcance_texto: 'Todos los niveles · Todas las jornadas · Todas las sedes',
        estado: 'activo',
        tiene_planes: false,
      });
      expect((await lideres.listarLideresArea({ area_id: n.areaId })).map((l) => l._id)).toEqual([creado._id]);
    });

    it('un colegio grande separa por nivel y por diurna / nocturna, y cada sede es opcional', async () => {
      const otro = e.docenteAjeno;
      const primaria = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['PRIMARIA', 'PREESCOLAR'] }, actor(e.coordAcademico));
      const secundariaDiurna = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(otro), niveles: ['SECUNDARIA', 'MEDIA'], jornada: 'DIURNA' }, actor(e.coordAcademico));
      const rural = await sedeId('Rural');
      const nocturnaRural = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['SECUNDARIA', 'MEDIA'], jornada: 'NOCTURNA', sedes_ids: [rural] }, actor(e.admin));

      expect(primaria.alcance_texto).toBe('Preescolar, Primaria · Todas las jornadas · Todas las sedes');
      expect(secundariaDiurna.alcance_texto).toBe('Secundaria, Media · Diurna · Todas las sedes');
      expect(nocturnaRural).toMatchObject({ alcance_texto: 'Secundaria, Media · Nocturna · Rural', sedes: [{ _id: rural, nombre: 'Rural' }] });
      expect(await lideres.listarLideresArea({ area_id: n.areaId })).toHaveLength(3);
    });

    it('dos líderes del mismo área no cubren lo mismo: se dice quién ya lo cubre', async () => {
      await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['SECUNDARIA'], jornada: 'DIURNA' }, actor(e.coordAcademico));
      const cruce = lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), niveles: ['SECUNDARIA', 'MEDIA'] }, actor(e.coordAcademico));
      await expect(cruce).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(new RegExp(`Ya hay un líder.*${lider.nombre}.*Secundaria · Diurna`)) });
      // Otra jornada, otro nivel u otra sede no se cruzan.
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), niveles: ['SECUNDARIA'], jornada: 'NOCTURNA' }, actor(e.coordAcademico))).resolves.toBeTruthy();
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), niveles: ['MEDIA'] }, actor(e.coordAcademico))).resolves.toBeTruthy();
    });

    it('ampliar el alcance de uno se revisa contra los demás, y reactivar uno también', async () => {
      const diurna = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), jornada: 'DIURNA' }, actor(e.coordAcademico));
      const nocturna = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), jornada: 'NOCTURNA' }, actor(e.coordAcademico));
      await expect(lideres.actualizarLiderArea(nocturna._id, { jornada: 'TODAS' }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 409 });

      // Cambiar al docente no toca lo que cubre; quitarle el cargo lo deja inactivo y libera lo que cubría.
      const relevo = await lideres.actualizarLiderArea(diurna._id, { docente_id: idDe(e.docenteAjeno) }, actor(e.coordAcademico));
      expect(relevo).toMatchObject({ docente: { nombre: e.docenteAjeno.nombre }, jornada: 'DIURNA' });
      await lideres.actualizarLiderArea(diurna._id, { estado: 'inactivo' }, actor(e.coordAcademico));
      await expect(lideres.actualizarLiderArea(nocturna._id, { jornada: 'TODAS' }, actor(e.coordAcademico))).resolves.toMatchObject({ jornada: 'TODAS' });
      await expect(lideres.actualizarLiderArea(diurna._id, { estado: 'activo' }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 409 });
    });

    it('solo un docente activo puede ser líder; la sede tiene que existir; un área inactiva no admite líder', async () => {
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.estudiante) }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 400 });
      const inactivo = await crearUsuario('DOCENTE', { estado: 'inactivo' });
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(inactivo) }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 400 });
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), sedes_ids: [String(new Types.ObjectId())] }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 400 });
      await expect(lideres.crearLiderArea(String(new Types.ObjectId()), { docente_id: idDe(lider) }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 404 });
      await Area.updateOne({ _id: n.areaId }, { $set: { estado: 'inactivo' } });
      await expect(lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider) }, actor(e.coordAcademico))).rejects.toMatchObject({ statusCode: 409 });
    });

    it('quitar a un líder sin planes lo elimina; con planes lo desactiva (el plan cuelga de él)', async () => {
      const sinPlanes = await designarLider();
      expect(await lideres.quitarLiderArea(sinPlanes._id, actor(e.admin))).toEqual({ eliminado: true, desactivado: false });
      expect(await LiderArea.countDocuments()).toBe(0);

      await designarLider();
      await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      expect(await lideres.quitarLiderArea(liderAreaId, actor(e.admin))).toEqual({ eliminado: false, desactivado: true });
      expect(await LiderArea.findById(liderAreaId).lean()).toMatchObject({ estado: 'inactivo' });
      expect(await lideres.listarLideresArea({ area_id: n.areaId })).toEqual([]);
      expect(await lideres.listarLideresArea({ area_id: n.areaId, incluir_inactivos: true })).toMatchObject([{ estado: 'inactivo', tiene_planes: true }]);
      // Ya no es líder: no puede reenviar.
      await expect(planesArea.radicarPlanDeArea(datosArea(), pdf(), lider)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cada líder carga solo el plan de lo que cubre; el plan de un nivel no habilita el plan de aula de otro', async () => {
      const otro = e.docenteAjeno;
      const primaria = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['PRIMARIA'] }, actor(e.coordAcademico));
      await ventanaDelPeriodo(2, -5, 5);

      // Con solo el líder de primaria y su plan aprobado, el docente de Sexto (secundaria) no tiene quién le apruebe el plan de área: se lo dice.
      const dePrimaria = await planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: primaria._id }, pdf(), lider);
      await planesArea.revisarPlanDeArea(dePrimaria._id, { decision: 'APROBADO' }, e.coordAcademico);
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/no tiene líder de área para Secundaria · Diurna/),
      });

      // Designado el de secundaria, sigue bloqueado hasta que su plan se apruebe; y el de primaria no puede cargar el de secundaria.
      const secundaria = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(otro), niveles: ['SECUNDARIA', 'MEDIA'] }, actor(e.coordAcademico));
      await expect(planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: secundaria._id }, pdf(), lider)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/plan de área de Matemáticas todavía no está aprobado\./),
      });

      const deSecundaria = await planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: secundaria._id }, pdf(), otro);
      await planesArea.revisarPlanDeArea(deSecundaria._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect((await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).estado).toBe('EN_REVISION');
    });

    it('la jornada decide: una clase diurna necesita el plan del líder diurno, no el del nocturno', async () => {
      const diurno = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), jornada: 'DIURNA' }, actor(e.coordAcademico));
      const nocturno = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), jornada: 'NOCTURNA' }, actor(e.coordAcademico));
      const deNocturno = await planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: nocturno._id }, pdf(), e.docenteAjeno);
      await planesArea.revisarPlanDeArea(deNocturno._id, { decision: 'APROBADO' }, e.coordAcademico);
      await ventanaDelPeriodo(2, -5, 5);
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).rejects.toMatchObject({ statusCode: 409 });

      const tarjeta = (await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!;
      // El plan aprobado del nocturno no es el de esta clase: ella cae bajo el diurno, que aún no cargó nada.
      expect(tarjeta.plan_area).toMatchObject({ estado: 'SIN_CARGAR', planes_aprobados_ids: [] });

      const deDiurno = await planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: diurno._id }, pdf(), lider);
      await planesArea.revisarPlanDeArea(deDiurno._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect((await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!.plan_area).toMatchObject({ estado: 'APROBADO', planes_aprobados_ids: [deDiurno._id] });
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).resolves.toMatchObject({ estado: 'EN_REVISION' });
    });
  });

  // --- Plan de área ---

  describe('plan de área', () => {
    it('solo el líder lo carga: ni coordinación, ni el ADMIN, ni otro docente', async () => {
      await designarLider();
      for (const otro of [e.coordAcademico, e.admin, docente]) {
        await expect(planesArea.radicarPlanDeArea(datosArea(), pdf(), otro)).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(await PlanArea.countDocuments()).toBe(0);

      const plan = await planesArea.radicarPlanDeArea(datosArea(), pdf('plan-area.pdf'), lider);
      expect(plan).toMatchObject({ estado: 'EN_REVISION', version_actual: 1, titulo: 'Plan de área de Matemáticas 2026', puede: { revisar: false, cargar: false } });
    });

    it('sin líder designado no hay plan de área que cargar', async () => {
      await expect(planesArea.radicarPlanDeArea(datosArea({ lider_area_id: String(new Types.ObjectId()) }), pdf(), lider)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('en revisión no se reemplaza; devolver exige un comentario; el líder corrige y vuelve a revisión; al aprobarse no se reemplaza', async () => {
      await designarLider();
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf('v1.pdf', '%PDF-1.4 uno'), lider);
      await expect(planesArea.radicarPlanDeArea(datosArea(), pdf(), lider)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/en revisión/) });

      await expect(planesArea.revisarPlanDeArea(radicado._id, { decision: 'DEVUELTO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/comentario/) });
      await expect(planesArea.revisarPlanDeArea(radicado._id, { decision: 'DEVUELTO', comentario: '   ' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });
      const devuelto = await planesArea.revisarPlanDeArea(radicado._id, { decision: 'DEVUELTO', comentario: 'Falta la secuencia por periodos.' }, e.coordAcademico);
      expect(devuelto).toMatchObject({ estado: 'DEVUELTO', puede: { cargar: false, revisar: false } });
      expect(devuelto.revisiones).toMatchObject([{ accion: 'DEVUELTO', comentario: 'Falta la secuencia por periodos.', version: 1 }]);

      // El líder ve el comentario y reenvía; ahora puede cargar (devuelto) y queda la versión 2 en revisión.
      const comoLider = await planesArea.obtenerPlanDeArea(radicado._id, lider);
      expect(comoLider.puede.cargar).toBe(true);
      expect(comoLider.revisiones[0]!.comentario).toBe('Falta la secuencia por periodos.');
      const corregido = await planesArea.radicarPlanDeArea(datosArea({ titulo: 'Plan de área v2' }), pdf('v2.pdf', '%PDF-1.4 dos'), lider);
      expect(corregido).toMatchObject({ estado: 'EN_REVISION', version_actual: 2, titulo: 'Plan de área v2' });
      expect(corregido.versiones.map((v) => v.numero)).toEqual([1, 2]);

      const aprobado = await planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO', comentario: 'Aprobado para todo el año.' }, e.admin);
      expect(aprobado.estado).toBe('APROBADO');
      await expect(planesArea.radicarPlanDeArea(datosArea(), pdf(), lider)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya está aprobado/) });
      // Ya decidido, no se vuelve a decidir (la carrera de dos revisores la cierra el estado).
      await expect(planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('cada versión conserva su PDF y se baja por número; la última es la que se ve por defecto', async () => {
      await designarLider();
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf('v1.pdf', '%PDF-1.4 uno'), lider);
      await planesArea.revisarPlanDeArea(radicado._id, { decision: 'DEVUELTO', comentario: 'Ajusta' }, e.coordAcademico);
      await planesArea.radicarPlanDeArea(datosArea(), pdf('v2.pdf', '%PDF-1.4 dos'), lider);

      expect(await fs.readFile((await planesArea.rutaDelArchivoPlanDeArea(radicado._id, 1, lider)).ruta, 'utf8')).toBe('%PDF-1.4 uno');
      expect(await fs.readFile((await planesArea.rutaDelArchivoPlanDeArea(radicado._id, undefined, e.coordAcademico)).ruta, 'utf8')).toBe('%PDF-1.4 dos');
      await expect(planesArea.rutaDelArchivoPlanDeArea(radicado._id, 7, lider)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('solo el ADMIN reabre uno aprobado, y con motivo; el líder lo puede corregir de nuevo', async () => {
      const id = await aprobarPlanDeArea();
      await expect(planesArea.reabrirPlanDeArea(id, 'Error en la intensidad', e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesArea.reabrirPlanDeArea(id, '   ', e.admin)).rejects.toMatchObject({ statusCode: 400 });
      const reabierto = await planesArea.reabrirPlanDeArea(id, 'Cambió la intensidad horaria', e.admin);
      expect(reabierto).toMatchObject({ estado: 'DEVUELTO', puede: { cargar: false } });
      expect(reabierto.revisiones.at(-1)).toMatchObject({ accion: 'REABIERTO', comentario: 'Cambió la intensidad horaria' });
      expect((await planesArea.obtenerPlanDeArea(id, lider)).puede.cargar).toBe(true);
    });

    it('un docente que dicta en el área lo ve solo aprobado; uno ajeno al área no lo ve; coordinación lo ve siempre', async () => {
      await designarLider();
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);

      // `docenteDeClase` dicta Matemáticas, pero el plan aún está en revisión.
      await expect(planesArea.obtenerPlanDeArea(radicado._id, docente)).rejects.toMatchObject({ statusCode: 404 });
      await expect(planesArea.obtenerPlanDeArea(radicado._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
      await expect(planesArea.rutaDelArchivoPlanDeArea(radicado._id, undefined, docente)).rejects.toMatchObject({ statusCode: 404 });
      expect((await planesArea.obtenerPlanDeArea(radicado._id, e.coordAcademico)).estado).toBe('EN_REVISION');

      await planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect((await planesArea.obtenerPlanDeArea(radicado._id, docente)).estado).toBe('APROBADO');
      await expect(planesArea.obtenerPlanDeArea(radicado._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('el listado: coordinación ve todas las áreas con quién las lidera y si bloquean el año; el líder, la suya; un docente del área, solo la que ya está aprobada', async () => {
      const otra = await Area.create({ institucion_id: (await Area.findById(n.areaId))!.institucion_id, nombre: 'Humanidades', descripcion: 'Área', codigo: 'HUM' });

      const gestion = await planesArea.listarPlanesDeArea(n.anioId, e.coordAcademico);
      expect(gestion.map((f) => f.area.nombre).sort()).toEqual(['Humanidades', 'Matemáticas']);
      // Sin líder aparece una fila «sin líder» que dice qué parte de la institución nadie cubre (nivel, jornada y, con varias sedes, la sede).
      expect(gestion.find((f) => f.area.nombre === 'Matemáticas')).toMatchObject({
        lider_area_id: null,
        estado: 'SIN_CARGAR',
        obligatoria: true,
        pendiente_para_activar: 'SIN_LIDER',
        lider: null,
        sin_cubrir: ['Secundaria · Diurna · Principal'],
      });
      // Un área sin asignaturas obligatorias en el plan de estudios no bloquea la activación.
      expect(gestion.find((f) => f.area.nombre === 'Humanidades')).toMatchObject({ obligatoria: false, pendiente_para_activar: null });

      await designarLider();
      // Con un líder para toda el área ya no queda nada sin cubrir: una sola fila, la del líder.
      const conLider = (await planesArea.listarPlanesDeArea(n.anioId, e.coordAcademico)).filter((f) => f.area.nombre === 'Matemáticas');
      expect(conLider).toHaveLength(1);
      expect(conLider[0]).toMatchObject({ lider_area_id: liderAreaId, lider: { nombre: lider.nombre }, alcance: { texto: 'Todos los niveles · Todas las jornadas · Todas las sedes' }, pendiente_para_activar: 'SIN_CARGAR' });
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      expect((await planesArea.listarPlanesDeArea(n.anioId, lider)).map((f) => f.area.nombre)).toEqual(['Matemáticas']);
      expect((await planesArea.listarPlanesDeArea(n.anioId, lider))[0]).toMatchObject({ soy_lider: true, estado: 'EN_REVISION', puede: { ver_archivo: true } });

      const comoDocente = (await planesArea.listarPlanesDeArea(n.anioId, docente))[0]!;
      expect(comoDocente).toMatchObject({ area: { nombre: 'Matemáticas' }, soy_lider: false, estado: 'EN_REVISION', plan: null, puede: { cargar: false, ver_archivo: false } });
      await planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect((await planesArea.listarPlanesDeArea(n.anioId, docente))[0]).toMatchObject({ estado: 'APROBADO', plan: { titulo: 'Plan de área de Matemáticas 2026' }, puede: { ver_archivo: true } });
      expect(await planesArea.listarPlanesDeArea(n.anioId, e.docenteAjeno)).toEqual([]);
      expect(otra).toBeTruthy();
    });

    it('un año cerrado no admite radicar ni revisar', async () => {
      await designarLider();
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      await AcademicYear.updateOne({ _id: n.anioId }, { $set: { estado: 'CERRADO' } });
      await expect(planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrado/) });
      await expect(planesArea.radicarPlanDeArea(datosArea(), pdf(), lider)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // --- Compuerta: no se activa el año con áreas obligatorias sin plan aprobado ---

  describe('activar el año lectivo', () => {
    beforeEach(async () => {
      await AcademicYear.updateOne({ _id: n.anioId }, { $set: { estado: 'PLANIFICACION' } });
    });

    const activar = () => anios.activarAnio(n.anioId, { usuarioId: e.admin._id });

    it('no se activa con un área obligatoria sin plan aprobado y dice cuál es y por qué, paso a paso', async () => {
      const pendiente = async () => {
        const error = (await activar().then(
          () => null,
          (err: { statusCode: number; message: string; details: { areas_pendientes: Array<{ nombre: string; motivo: string }> } }) => err
        ))!;
        expect(error.statusCode).toBe(409);
        expect(error.message).toMatch(/no tienen su plan de área aprobado/);
        return error.details.areas_pendientes;
      };

      expect(await pendiente()).toMatchObject([{ nombre: 'Matemáticas', motivo: 'SIN_LIDER' }]);
      await designarLider();
      expect(await pendiente()).toMatchObject([{ motivo: 'SIN_CARGAR' }]);
      const radicado = await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      expect(await pendiente()).toMatchObject([{ motivo: 'EN_REVISION' }]);
      await planesArea.revisarPlanDeArea(radicado._id, { decision: 'DEVUELTO', comentario: 'Corrige' }, e.coordAcademico);
      expect(await pendiente()).toMatchObject([{ motivo: 'DEVUELTO' }]);
      await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      await planesArea.revisarPlanDeArea(radicado._id, { decision: 'APROBADO' }, e.coordAcademico);

      expect((await activar()).estado).toBe('EN_CURSO');
    });

    it('con líderes por nivel, jornada y sede exige el plan de cada líder que el área necesita y dice qué parte nadie cubre', async () => {
      const pendientes = async () => {
        const error = (await activar().then(
          () => null,
          (err: { details: { areas_pendientes: Array<{ nombre: string; motivo: string; alcance: string }> } }) => err
        ))!;
        return error.details.areas_pendientes;
      };

      // El colegio de la prueba solo tiene Sexto (secundaria, diurna, sede Principal): el líder de primaria no es necesario y no estorba.
      await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['PRIMARIA'] }, actor(e.coordAcademico));
      expect(await pendientes()).toMatchObject([{ nombre: 'Matemáticas', motivo: 'SIN_LIDER', alcance: 'Secundaria · Diurna · Principal' }]);

      // Un líder de secundaria pero solo de la sede Rural tampoco cubre la sede Principal.
      const rural = String((await Campus.findOne({ nombre: 'Rural' }))!._id);
      const deLaRural = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(e.docenteAjeno), niveles: ['SECUNDARIA'], sedes_ids: [rural] }, actor(e.coordAcademico));
      expect(await pendientes()).toMatchObject([{ motivo: 'SIN_LIDER', alcance: 'Secundaria · Diurna · Principal' }]);

      // Con la sede Principal cubierta se exige el plan de ese líder, y solo el suyo.
      const dePrincipal = await lideres.crearLiderArea(n.areaId, { docente_id: idDe(lider), niveles: ['SECUNDARIA', 'MEDIA'], jornada: 'DIURNA', sedes_ids: [String((await Campus.findOne({ nombre: 'Principal' }))!._id)] }, actor(e.coordAcademico));
      expect(await pendientes()).toMatchObject([{ motivo: 'SIN_CARGAR', alcance: 'Secundaria, Media · Diurna · Principal' }]);
      const plan = await planesArea.radicarPlanDeArea({ ...datosArea(), lider_area_id: dePrincipal._id }, pdf(), lider);
      await planesArea.revisarPlanDeArea(plan._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect(deLaRural._id).toBeTruthy();
      expect((await activar()).estado).toBe('EN_CURSO');
    });

    it('un líder inactivo no cuenta como líder', async () => {
      await designarLider();
      await lider.updateOne({ estado: 'inactivo' });
      await expect(activar()).rejects.toMatchObject({ details: { areas_pendientes: [{ motivo: 'SIN_LIDER' }] } });
    });

    it('un área solo optativa no bloquea la activación', async () => {
      const aprobado = await aprobarPlanDeArea();
      expect(aprobado).toBeTruthy();
      const optativa = await Area.create({ institucion_id: (await Area.findById(n.areaId))!.institucion_id, nombre: 'Electivas', descripcion: 'Área', codigo: 'ELE' });
      const taller = await Subject.create({ area_id: optativa._id, nombre: 'Taller', abreviatura: 'TAL', descripcion: 'x', tipo: 'OPTATIVA', niveles_educativos: ['SECUNDARIA'] });
      await StudyPlan.updateOne({ academic_year_id: n.anioId }, { $push: { 'grades.0.asignaturas': { subject_id: taller._id, intensidad_horaria_semanal: 1 } } });
      expect((await activar()).estado).toBe('EN_CURSO');
    });

    it('una asignatura obligatoria que solo agrega un grupo también exige su área', async () => {
      await aprobarPlanDeArea();
      const humanidades = await Area.create({ institucion_id: (await Area.findById(n.areaId))!.institucion_id, nombre: 'Humanidades', descripcion: 'Área', codigo: 'HUM' });
      const lectura = await Subject.create({ area_id: humanidades._id, nombre: 'Lectura', abreviatura: 'LEC', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
      await StudyPlan.updateOne(
        { academic_year_id: n.anioId },
        { $push: { 'grades.0.personalizaciones_grupo': { group_id: n.grupoId, intensidades_personalizadas: [], asignaturas_agregadas: [{ subject_id: lectura._id, intensidad_horaria_semanal: 1, observacion: 'x' }], evaluaciones_area_personalizadas: [] } } }
      );
      await expect(activar()).rejects.toMatchObject({ statusCode: 409, details: { areas_pendientes: [{ nombre: 'Humanidades' }] } });
    });

    it('un año sin plan de estudios no tiene áreas que exigir', async () => {
      await StudyPlan.deleteMany({});
      expect((await activar()).estado).toBe('EN_CURSO');
    });
  });

  // --- Ventana de entrega ---

  describe('ventana de entrega de planes de aula', () => {
    it('mientras no se configure rige la sugerida; el listado dice si es propia o sugerida', async () => {
      const { periodos } = await ventanas.listarVentanas(n.anioId);
      expect(periodos).toHaveLength(4);
      const p2 = periodos.find((p) => p.numero === 2)!;
      expect(iso(p2.limite)).toBe(iso(dia(100))); // el día antes de que empiece el periodo 2 (+101)
      expect(iso(p2.apertura)).toBe(iso(dia(86))); // 14 días antes de que termine el periodo 1 (+100)
      expect(p2).toMatchObject({ apertura_personalizada: false, limite_personalizado: false, estado: 'NO_ABIERTA' });
      expect(periodos.find((p) => p.numero === 1)).toMatchObject({ estado: 'VENCIDA' });
    });

    it('coordinación fija apertura y límite sin tocar las fechas del periodo, y null vuelve a la sugerida', async () => {
      const antes = (await AcademicYear.findById(n.anioId))!.periodos.find((p) => p.numero === 2)!;
      const { periodos } = await ventanaDelPeriodo(2, -5, 5);
      expect(periodos.find((p) => p.numero === 2)).toMatchObject({ apertura_personalizada: true, limite_personalizado: true, estado: 'ABIERTA' });
      expect(iso(periodos.find((p) => p.numero === 2)!.limite)).toBe(iso(dia(5)));

      const despues = (await AcademicYear.findById(n.anioId))!.periodos.find((p) => p.numero === 2)!;
      expect(iso(despues.fecha_inicio)).toBe(iso(antes.fecha_inicio));
      expect(iso(despues.fecha_fin)).toBe(iso(antes.fecha_fin));
      expect(despues.estado).toBe(antes.estado);

      const restaurada = await ventanas.configurarVentana(n.anioId, 2, { fecha_apertura: null, fecha_limite: null }, e.admin);
      expect(restaurada.periodos.find((p) => p.numero === 2)).toMatchObject({ apertura_personalizada: false, limite_personalizado: false, estado: 'NO_ABIERTA' });
    });

    it('rechaza una ventana incoherente: límite antes de abrir, o límite del Periodo 1 no anterior al inicio de clases', async () => {
      await expect(ventanas.configurarVentana(n.anioId, 2, { fecha_apertura: dia(10), fecha_limite: dia(5) }, e.coordAcademico)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/anterior a la apertura/),
      });
      // El periodo 1 empieza hace 100 días: un límite posterior a esa fecha no sirve.
      await expect(ventanas.configurarVentana(n.anioId, 1, { fecha_limite: dia(-50) }, e.coordAcademico)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/Periodo 1.*anterior al inicio de clases/),
      });
      await expect(ventanas.configurarVentana(n.anioId, 9, { fecha_limite: dia(5) }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('editar el año (M05) no pierde la ventana configurada', async () => {
      await AcademicYear.updateOne({ _id: n.anioId }, { $set: { estado: 'PLANIFICACION' } });
      await ventanaDelPeriodo(3, -2, 3);
      const anio = (await AcademicYear.findById(n.anioId))!;
      await anios.actualizarAnio(
        n.anioId,
        {
          nombre: 'Año con otro nombre',
          calendario: anio.calendario,
          fecha_inicio: anio.fecha_inicio,
          fecha_fin: anio.fecha_fin,
          periodos: anio.periodos.map((p) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin })),
        },
        { usuarioId: e.admin._id }
      );
      const p3 = (await ventanas.listarVentanas(n.anioId)).periodos.find((p) => p.numero === 3)!;
      expect(p3).toMatchObject({ apertura_personalizada: true, limite_personalizado: true });
      expect(iso(p3.limite)).toBe(iso(dia(3)));
    });

    it('un año cerrado no admite configurar la ventana', async () => {
      await AcademicYear.updateOne({ _id: n.anioId }, { $set: { estado: 'CERRADO' } });
      await expect(ventanas.configurarVentana(n.anioId, 2, { fecha_limite: dia(5) }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // --- Plan de aula ---

  describe('plan de aula', () => {
    it('sin el plan de área aprobado no se carga, y el mensaje nombra el área', async () => {
      await designarLider();
      await expect(planesAula.radicarPlanDeAula(datosAula(), pdf(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/plan de área de Matemáticas todavía no está aprobado/),
      });
      await planesArea.radicarPlanDeArea(datosArea(), pdf(), lider);
      await expect(planesAula.radicarPlanDeAula(datosAula(), pdf(), docente)).rejects.toMatchObject({ statusCode: 409 });
      expect(await PlanAula.countDocuments()).toBe(0);
    });

    it('solo radica el docente que dicta esa asignatura en ese grado', async () => {
      await aprobarPlanDeArea();
      await expect(planesAula.radicarPlanDeAula(datosAula(), pdf(), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesAula.radicarPlanDeAula(datosAula(), pdf(), e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesAula.radicarPlanDeAula(datosAula({ grade_id: idDe(await Grade.create({ nivel: 'SECUNDARIA', numero: 9, nombre: 'Noveno' })) }), pdf(), docente)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 4 + 1 }), pdf(), docente)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('antes de que abra la entrega no se radica por primera vez, y el mensaje dice cuándo abre', async () => {
      await aprobarPlanDeArea();
      // El periodo 3 abre ~186 días después de hoy.
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 3 }), pdf(), docente)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/La entrega de este periodo abre el/),
      });
      await ventanaDelPeriodo(3, -1, 10);
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 3 }), pdf(), docente);
      expect(plan).toMatchObject({ estado: 'EN_REVISION', periodo_numero: 3, radicacion: { fuera_de_plazo: false } });
    });

    it('dentro de la ventana queda a tiempo; el archivo se guarda y la API no entrega la ruta', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf('p2.pdf', '%PDF-1.4 periodo 2'), docente);
      expect(plan).toMatchObject({
        estado: 'EN_REVISION',
        version_actual: 1,
        archivo_nombre: 'p2.pdf',
        origen: 'CARGADA',
        radicacion: { fuera_de_plazo: false },
        docente: { _id: idDe(docente) },
        area: { nombre: 'Matemáticas' },
        asignatura: { nombre: 'Matemáticas' },
        grado: { nombre: 'Sexto' },
        archivado: false,
      });
      expect(iso(plan.radicacion.fecha_limite)).toBe(iso(dia(5)));
      expect(JSON.stringify(plan)).not.toMatch(/ruta|uploads|sha256/);
      expect(await fs.readFile((await planesAula.rutaDelArchivoPlanDeAula(plan._id, undefined, docente)).ruta, 'utf8')).toBe('%PDF-1.4 periodo 2');
    });

    it('vencida la fecha límite el formulario sigue abierto: queda ENTREGADO FUERA DE PLAZO con fecha y hora', async () => {
      await aprobarPlanDeArea();
      // El periodo 1 venció hace ~100 días y el docente ya estaba asignado entonces.
      // Asignado hoy, cuando el periodo 1 ya venció, no se le marcaría tarde; con la asignación de antes del cierre, sí (y la tarjeta lo avisa).
      expect((await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!.periodos[0]!.radicaria_fuera_de_plazo).toBe(false);
      await envejecerAsignacion((await TeacherAssignment.findOne({ docente_id: docente._id }))!, 200);
      expect((await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!.periodos[0]!.radicaria_fuera_de_plazo).toBe(true);
      const antes = Date.now();
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf(), docente);
      expect(plan.estado).toBe('EN_REVISION');
      expect(plan.radicacion.fuera_de_plazo).toBe(true);
      expect(plan.radicacion.fecha.getTime()).toBeGreaterThanOrEqual(antes);
      expect(plan.radicacion.fecha.getTime()).toBeLessThanOrEqual(Date.now());
      expect(iso(plan.radicacion.fecha_limite)).toBe(iso(dia(-101)));
    });

    it('un docente asignado después del cierre (un reemplazo) no queda marcado fuera de plazo', async () => {
      await aprobarPlanDeArea();
      // `docenteAjeno` toma otra asignación hoy, cuando el periodo 1 ya venció.
      const grupo = (await Group.findById(n.grupoId))!;
      const otroGrupo = await Group.create({ sede_id: grupo.sede_id, academic_year_id: grupo.academic_year_id, grade_id: grupo.grade_id, jornada_id: grupo.jornada_id, nomenclatura: '602', max_capacity: 30 });
      await TeacherAssignment.create({ docente_id: e.docenteAjeno._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: otroGrupo._id, subject_id: n.materiaId, horas_semanales: 4 });
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf(), e.docenteAjeno);
      expect(plan.radicacion.fuera_de_plazo).toBe(false);
    });

    it('un plan devuelto se corrige siempre, aunque ya no haya ventana; la etiqueta de plazo es la de la primera radicación', async () => {
      await aprobarPlanDeArea();
      await envejecerAsignacion((await TeacherAssignment.findOne({ docente_id: docente._id }))!, 200);

      // Radicó tarde: la etiqueta se queda aun después de corregir.
      const tarde = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf('v1.pdf'), docente);
      expect(tarde.radicacion.fuera_de_plazo).toBe(true);
      await planesAula.revisarPlanDeAula(tarde._id, { decision: 'DEVUELTO', comentario: 'Falta la evaluación.' }, e.coordAcademico);
      const corregidoTarde = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1, titulo: 'P1 corregido' }), pdf('v2.pdf'), docente);
      expect(corregidoTarde).toMatchObject({ estado: 'EN_REVISION', version_actual: 2, titulo: 'P1 corregido', radicacion: { fuera_de_plazo: true } });
      expect(corregidoTarde.radicacion.fecha).toEqual(tarde.radicacion.fecha);

      // Radicó a tiempo: aunque la ventana venza antes de que coordinación conteste, corregir no lo marca como tardío.
      await ventanaDelPeriodo(2, -5, 5);
      const aTiempo = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      expect(aTiempo.radicacion.fuera_de_plazo).toBe(false);
      await ventanas.configurarVentana(n.anioId, 2, { fecha_limite: dia(-1) }, e.coordAcademico);
      await planesAula.revisarPlanDeAula(aTiempo._id, { decision: 'DEVUELTO', comentario: 'Ajusta los tiempos.' }, e.coordAcademico);
      const respuesta = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2, titulo: 'P2 ajustado' }), pdf(), docente);
      expect(respuesta).toMatchObject({ estado: 'EN_REVISION', version_actual: 2, radicacion: { fuera_de_plazo: false } });
    });

    it('en revisión o aprobado no se reemplaza; devolver exige comentario y reabrir es del ADMIN', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/revisión/) });

      await expect(planesAula.revisarPlanDeAula(plan._id, { decision: 'DEVUELTO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });
      const aprobado = await planesAula.revisarPlanDeAula(plan._id, { decision: 'APROBADO', comentario: 'Bien estructurado.' }, e.coordAcademico);
      expect(aprobado).toMatchObject({ estado: 'APROBADO', puede: { revisar: false, reabrir: false } });
      expect(aprobado.revisiones).toMatchObject([{ accion: 'APROBADO', comentario: 'Bien estructurado.', automatica: false }]);
      await expect(planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya está aprobado/) });
      await expect(planesAula.revisarPlanDeAula(plan._id, { decision: 'APROBADO' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });

      await expect(planesAula.reabrirPlanDeAula(plan._id, 'Cambió el calendario', e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      const reabierto = await planesAula.reabrirPlanDeAula(plan._id, 'Cambió el calendario', e.admin);
      expect(reabierto.estado).toBe('DEVUELTO');
      expect(reabierto.revisiones.at(-1)).toMatchObject({ accion: 'REABIERTO', comentario: 'Cambió el calendario' });
    });

    it('el docente solo ve su plan; coordinación ve todos; el de otro docente activo no se ve ni se descarga', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      for (const ajeno of [e.docenteAjeno, lider]) {
        await expect(planesAula.obtenerPlanDeAula(plan._id, ajeno)).rejects.toMatchObject({ statusCode: 404 });
        await expect(planesAula.rutaDelArchivoPlanDeAula(plan._id, undefined, ajeno)).rejects.toMatchObject({ statusCode: 404 });
      }
      expect((await planesAula.obtenerPlanDeAula(plan._id, e.coordAcademico)).estado).toBe('EN_REVISION');
      expect((await planesAula.obtenerPlanDeAula(plan._id, e.admin)).puede).toMatchObject({ revisar: true, ver_archivo: true });
    });

    it('un plan aprobado habilita al docente a programar actividades de ese periodo (compuerta de M11)', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(1, -120, -110);
      const asignacion = (await TeacherAssignment.findOne({ docente_id: docente._id }))!;
      const nueva = (): actividades.CreateActivityInput => ({
        teacher_assignment_id: idDe(asignacion),
        periodo_numero: 1,
        titulo: 'Taller',
        descripcion: 'Resuelve los ejercicios.',
        tipo: 'TAREA',
        componente_siee: 'COGNITIVO_SABER',
        peso_en_componente: 1,
        fecha_apertura: new Date(Date.now() - 3_600_000),
        fecha_entrega: proximoDiaHabil(3),
      });

      await expect(actividades.createActivity(nueva(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Aún no has radicado/) });
      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf(), docente);
      await expect(actividades.createActivity(nueva(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/está en revisión/) });
      await planesAula.revisarPlanDeAula(plan._id, { decision: 'DEVUELTO', comentario: 'Falta' }, e.coordAcademico);
      await expect(actividades.createActivity(nueva(), docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/devuelto con comentarios/) });
      await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf(), docente);
      await planesAula.revisarPlanDeAula(plan._id, { decision: 'APROBADO' }, e.coordAcademico);
      await expect(actividades.createActivity(nueva(), docente)).resolves.toBeTruthy();

      // Reabierto, deja de habilitar nuevas actividades.
      await planesAula.reabrirPlanDeAula(plan._id, 'Revisión de fondo', e.admin);
      await expect(actividades.createActivity(nueva(), docente)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('el visor de actividades: el plan de esa clase y periodo, solo para su docente y coordinación', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const asignacion = (await TeacherAssignment.findOne({ docente_id: docente._id }))!;
      expect(await planesAula.planDeAulaDeAsignacion(idDe(asignacion), 2, docente)).toMatchObject({ estado: 'SIN_CARGAR', aprobado: false, plan: null });

      const plan = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      await planesAula.revisarPlanDeAula(plan._id, { decision: 'APROBADO' }, e.coordAcademico);
      expect(await planesAula.planDeAulaDeAsignacion(idDe(asignacion), 2, docente)).toMatchObject({ estado: 'APROBADO', aprobado: true, plan: { _id: plan._id } });
      expect((await planesAula.planDeAulaDeAsignacion(idDe(asignacion), 2, e.coordAcademico)).aprobado).toBe(true);
      await expect(planesAula.planDeAulaDeAsignacion(idDe(asignacion), 2, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // --- Vista del docente y bandeja de coordinación ---

  describe('tarjetas del docente y bandeja de coordinación', () => {
    it('una tarjeta por asignatura y grado con sus periodos: ventana, bloqueo con motivo y, dictando dos grupos del mismo grado, un solo plan', async () => {
      const grupo = (await Group.findById(n.grupoId))!;
      const otroGrupo = await Group.create({ sede_id: grupo.sede_id, academic_year_id: grupo.academic_year_id, grade_id: grupo.grade_id, jornada_id: grupo.jornada_id, nomenclatura: '602', max_capacity: 30 });
      await TeacherAssignment.create({ docente_id: docente._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: otroGrupo._id, subject_id: n.materiaId, horas_semanales: 4 });

      const antes = await planesAula.misPlanesDeAula(n.anioId, docente);
      expect(antes.tarjetas).toHaveLength(1);
      expect(antes.tarjetas[0]).toMatchObject({
        area: { nombre: 'Matemáticas' },
        asignatura: { nombre: 'Matemáticas' },
        grado: { nombre: 'Sexto' },
        grupos: ['601', '602'],
        plan_area: { estado: 'SIN_CARGAR' },
      });
      expect(antes.tarjetas[0]!.periodos).toHaveLength(4);
      expect(antes.tarjetas[0]!.periodos[0]).toMatchObject({ numero: 1, estado: 'SIN_CARGAR', puede_cargar: false, bloqueo: { codigo: 'PLAN_AREA_PENDIENTE', mensaje: expect.stringMatching(/Matemáticas/) } });

      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const despues = (await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!;
      expect(despues.plan_area.estado).toBe('APROBADO');
      expect(despues.periodos[0]).toMatchObject({ numero: 1, puede_cargar: true, bloqueo: null, ventana: { estado: 'VENCIDA' } });
      expect(despues.periodos[1]).toMatchObject({ numero: 2, puede_cargar: true, ventana: { estado: 'ABIERTA' } });
      expect(despues.periodos[2]).toMatchObject({ numero: 3, puede_cargar: false, bloqueo: { codigo: 'VENTANA_NO_ABIERTA' }, ventana: { estado: 'NO_ABIERTA' } });

      await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      const conPlan = (await planesAula.misPlanesDeAula(n.anioId, docente)).tarjetas[0]!.periodos[1]!;
      expect(conPlan).toMatchObject({ estado: 'EN_REVISION', puede_cargar: false, bloqueo: { codigo: 'EN_REVISION' }, plan: { titulo: 'Plan de aula P1', version_actual: 1 } });
      // Un docente sin clases no tiene tarjetas.
      expect((await planesAula.misPlanesDeAula(n.anioId, lider)).tarjetas).toEqual([]);
    });

    it('la bandeja cuenta lo esperado (docente × asignatura × grado × periodo), lo que falta y lo que llegó fuera de plazo', async () => {
      await aprobarPlanDeArea();
      await envejecerAsignacion((await TeacherAssignment.findOne({ docente_id: docente._id }))!, 200);
      const tarde = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 1 }), pdf(), docente);
      await ventanaDelPeriodo(2, -5, 5);
      const aTiempo = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);
      await planesAula.revisarPlanDeAula(aTiempo._id, { decision: 'APROBADO' }, e.coordAcademico);

      const bandeja = await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId }, e.coordAcademico);
      expect(bandeja.filas).toHaveLength(4);
      expect(bandeja.resumen).toEqual({ esperados: 4, sin_cargar: 2, en_revision: 1, aprobados: 1, devueltos: 0, fuera_de_plazo: 1, archivados: 0 });
      expect(bandeja.filas.map((f) => [f.periodo_numero, f.estado])).toEqual([
        [1, 'EN_REVISION'],
        [2, 'APROBADO'],
        [3, 'SIN_CARGAR'],
        [4, 'SIN_CARGAR'],
      ]);
      expect(bandeja.filas[0]).toMatchObject({ docente: { _id: idDe(docente) }, puede: { revisar: true, reabrir: false }, plan: { _id: tarde._id, radicacion: { fuera_de_plazo: true } } });
      expect((await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId }, e.admin)).filas[1]!.puede).toEqual({ revisar: false, reabrir: true });

      // Filtros: el de estado solo recorta las filas (los contadores siguen siendo los del conjunto); el de periodo recorta ambos.
      const sinCargar = await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId, estado: 'SIN_CARGAR' }, e.coordAcademico);
      expect(sinCargar.filas).toHaveLength(2);
      expect(sinCargar.resumen).toEqual(bandeja.resumen);
      const soloPeriodo2 = await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId, periodo_numero: 2 }, e.coordAcademico);
      expect(soloPeriodo2.filas.map((f) => f.periodo_numero)).toEqual([2]);
      expect(soloPeriodo2.resumen).toEqual({ esperados: 1, sin_cargar: 0, en_revision: 0, aprobados: 1, devueltos: 0, fuera_de_plazo: 0, archivados: 0 });
      expect((await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId, docente_id: idDe(e.docenteAjeno) }, e.coordAcademico)).filas).toEqual([]);
    });
  });

  // --- Docente que se va y docente que llega ---

  describe('el docente se va y llega un reemplazo', () => {
    /** Ana (docenteDeClase) tiene su plan del periodo 2 aprobado; después se retira su asignación y llega Luis (docenteAjeno) a ese grupo. */
    const escenarioDeRelevo = async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const planDeAna = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf('ana.pdf', '%PDF-1.4 plan de ana'), docente);
      await planesAula.revisarPlanDeAula(planDeAna._id, { decision: 'APROBADO' }, e.coordAcademico);

      const asignacionDeAna = (await TeacherAssignment.findOne({ docente_id: docente._id }))!;
      await asignaciones.deleteTeacherAssignment(idDe(asignacionDeAna), { id: e.admin._id });
      const asignacionDeLuis = await TeacherAssignment.create({ docente_id: e.docenteAjeno._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: n.grupoId, subject_id: n.materiaId, horas_semanales: 4 });
      return { planDeAna, asignacionDeLuis };
    };

    it('retirar al docente no borra su plan aprobado: queda archivado en el histórico del periodo', async () => {
      const { planDeAna } = await escenarioDeRelevo();
      expect(await PlanAula.exists({ _id: planDeAna._id })).toBeTruthy();

      const bandeja = await planesAula.bandejaPlanesDeAula({ academic_year_id: n.anioId, periodo_numero: 2 }, e.coordAcademico);
      expect(bandeja.resumen.archivados).toBe(1);
      expect(bandeja.filas.find((f) => f.archivado)).toMatchObject({ docente: { _id: idDe(docente) }, estado: 'APROBADO', periodo_numero: 2, plan: { _id: planDeAna._id } });
      // Quien llegó aparece como esperado y sin cargar.
      expect(bandeja.filas.find((f) => !f.archivado)).toMatchObject({ docente: { _id: idDe(e.docenteAjeno) }, estado: 'SIN_CARGAR' });

      // La docente que se fue sigue viendo lo suyo; el archivado lo ve también coordinación, con su PDF.
      expect((await planesAula.obtenerPlanDeAula(planDeAna._id, docente)).estado).toBe('APROBADO');
      expect((await planesAula.obtenerPlanDeAula(planDeAna._id, e.coordAcademico)).archivado).toBe(true);
      expect(await fs.readFile((await planesAula.rutaDelArchivoPlanDeAula(planDeAna._id, undefined, e.coordAcademico)).ruta, 'utf8')).toBe('%PDF-1.4 plan de ana');
    });

    it('al nuevo docente se le ofrece adoptar el plan aprobado del anterior (solo ese periodo, solo aprobado)', async () => {
      const { planDeAna } = await escenarioDeRelevo();
      const tarjeta = (await planesAula.misPlanesDeAula(n.anioId, e.docenteAjeno)).tarjetas[0]!;
      expect(tarjeta.periodos[1]!.adoptables).toMatchObject([{ plan_id: planDeAna._id, docente: { _id: idDe(docente) }, titulo: 'Plan de aula P1' }]);
      expect(tarjeta.periodos[0]!.adoptables).toEqual([]);
      expect(tarjeta.periodos[2]!.adoptables).toEqual([]);

      // El nuevo docente puede ver el plan archivado para decidir si lo adopta.
      expect((await planesAula.obtenerPlanDeAula(planDeAna._id, e.docenteAjeno)).estado).toBe('APROBADO');
      expect((await planesAula.rutaDelArchivoPlanDeAula(planDeAna._id, undefined, e.docenteAjeno)).nombre).toBe('ana.pdf');
    });

    it('adoptar lo habilita al instante, sin revisión, con el rastro de dónde salió; el original queda intacto', async () => {
      const { planDeAna, asignacionDeLuis } = await escenarioDeRelevo();
      const adoptado = await planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno);

      expect(adoptado).toMatchObject({
        estado: 'APROBADO',
        periodo_numero: 2,
        origen: 'ADOPTADA',
        titulo: 'Plan de aula P1',
        docente: { _id: idDe(e.docenteAjeno) },
        radicacion: { fuera_de_plazo: false },
        versiones: [{ numero: 1, origen: 'ADOPTADA', adoptado_de: { docente: { _id: idDe(docente) }, version: 1 } }],
        revisiones: [{ accion: 'APROBADO', automatica: true, revisor: null, comentario: expect.stringMatching(/Adoptado del plan aprobado de/) }],
      });
      expect(JSON.stringify(adoptado)).not.toMatch(/uploads|sha256/);

      // El PDF se copia: cada plan conserva el suyo.
      const copia = (await planesAula.rutaDelArchivoPlanDeAula(adoptado._id, undefined, e.docenteAjeno)).ruta;
      const original = (await planesAula.rutaDelArchivoPlanDeAula(planDeAna._id, undefined, e.coordAcademico)).ruta;
      expect(copia).not.toBe(original);
      expect(await fs.readFile(copia, 'utf8')).toBe('%PDF-1.4 plan de ana');
      expect((await PlanAula.findById(planDeAna._id))!.estado).toBe('APROBADO');

      // Habilitado de inmediato: puede programar actividades del periodo 2 sin esperar a coordinación.
      await expect(
        actividades.createActivity(
          {
            teacher_assignment_id: idDe(asignacionDeLuis),
            periodo_numero: 2,
            titulo: 'Primer taller',
            descripcion: 'Desde el plan adoptado.',
            tipo: 'TAREA',
            componente_siee: 'COGNITIVO_SABER',
            peso_en_componente: 1,
            fecha_apertura: new Date(Date.now() - 3_600_000),
            fecha_entrega: dia(120),
            confirmar_alertas: true,
          },
          e.docenteAjeno
        )
      ).resolves.toBeTruthy();

      // Ya no queda nada por ofrecerle ese periodo, y no se adopta dos veces.
      expect((await planesAula.misPlanesDeAula(n.anioId, e.docenteAjeno)).tarjetas[0]!.periodos[1]).toMatchObject({ estado: 'APROBADO', adoptables: [] });
      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Ya tienes un plan/) });
    });

    it('dos docentes nuevos pueden adoptar el mismo plan archivado', async () => {
      const { planDeAna } = await escenarioDeRelevo();
      const tercero = await crearUsuario('DOCENTE');
      const grupo = (await Group.findById(n.grupoId))!;
      const otroGrupo = await Group.create({ sede_id: grupo.sede_id, academic_year_id: grupo.academic_year_id, grade_id: grupo.grade_id, jornada_id: grupo.jornada_id, nomenclatura: '603', max_capacity: 30 });
      await TeacherAssignment.create({ docente_id: tercero._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: otroGrupo._id, subject_id: n.materiaId, horas_semanales: 4 });

      await planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno);
      await planesAula.adoptarPlanDeAula(planDeAna._id, tercero);
      expect(await PlanAula.countDocuments({ periodo_numero: 2, subject_id: n.materiaId })).toBe(3);
    });

    it('no se adopta el plan de un colega que sigue dictando la asignatura, ni uno sin aprobar, ni sin tener la asignatura', async () => {
      await aprobarPlanDeArea();
      await ventanaDelPeriodo(2, -5, 5);
      const planDeAna = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2 }), pdf(), docente);

      // Luis también dicta Matemáticas de sexto (otro grupo) y Ana sigue activa: no puede copiarle el plan.
      const grupo = (await Group.findById(n.grupoId))!;
      const otroGrupo = await Group.create({ sede_id: grupo.sede_id, academic_year_id: grupo.academic_year_id, grade_id: grupo.grade_id, jornada_id: grupo.jornada_id, nomenclatura: '602', max_capacity: 30 });
      await TeacherAssignment.create({ docente_id: e.docenteAjeno._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: otroGrupo._id, subject_id: n.materiaId, horas_semanales: 4 });

      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Solo se puede adoptar un plan de aula aprobado/) });
      await planesAula.revisarPlanDeAula(planDeAna._id, { decision: 'APROBADO' }, e.coordAcademico);
      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/sigue dictando/) });
      expect((await planesAula.misPlanesDeAula(n.anioId, e.docenteAjeno)).tarjetas[0]!.periodos[1]!.adoptables).toEqual([]);

      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, lider)).rejects.toMatchObject({ statusCode: 403 });
      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, docente)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya es tuyo/) });
    });

    it('con el plan de área reabierto tampoco se adopta: el plan de aula depende de un plan de área aprobado', async () => {
      const { planDeAna } = await escenarioDeRelevo();
      const planAreaId = String((await PlanArea.findOne())!._id);
      await planesArea.reabrirPlanDeArea(planAreaId, 'Se rehace la secuencia', e.admin);
      await expect(planesAula.adoptarPlanDeAula(planDeAna._id, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/plan de área de Matemáticas/) });
      expect((await planesAula.misPlanesDeAula(n.anioId, e.docenteAjeno)).tarjetas[0]!.periodos[1]!.adoptables).toEqual([]);
    });

    it('si el nuevo docente prefiere radicar uno ajustado, lo hace por el camino normal y el del anterior sigue archivado', async () => {
      const { planDeAna } = await escenarioDeRelevo();
      const propio = await planesAula.radicarPlanDeAula(datosAula({ periodo_numero: 2, titulo: 'Plan ajustado de Luis' }), pdf('luis.pdf'), e.docenteAjeno);
      expect(propio).toMatchObject({ estado: 'EN_REVISION', origen: 'CARGADA', docente: { _id: idDe(e.docenteAjeno) } });
      expect(propio.radicacion.fuera_de_plazo).toBe(false);
      expect((await PlanAula.findById(planDeAna._id))!.estado).toBe('APROBADO');
    });
  });
});
