import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import Guardian from '../../src/models/guardian.model';
import EvaluacionPromocion from '../../src/models/evaluacionPromocionEstudiante.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import PromocionAnticipada from '../../src/models/promocionAnticipada.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import Subject from '../../src/models/subject.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import { actualizarConfiguracion, datosDeConfiguracion, obtenerConfiguracion } from '../../src/services/configuracionPromocionAnticipada.service';
import * as tramites from '../../src/services/promocionAnticipada.service';
import { cargarContextoNotas, definitivaAnual } from '../../src/services/recuperacion.service';
import { generarPdfResolucion } from '../../src/services/resolucionAnticipadaPdf.service';
import * as sesiones from '../../src/services/sesionComision.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario, hoy } from './escenario';
import Observacion from '../../src/models/observacion.model';
import TipoObservacion from '../../src/models/tipoObservacion.model';
import { actualizarTipo, eliminarTipo, listarCatalogo } from '../../src/services/convivenciaCatalogo.service';
import { anularObservacion, enmendarObservacion, registrarObservacion } from '../../src/services/observacion.service';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// M19 fase 6: promoción anticipada de punta a punta, del trámite a la nota anual del grado nuevo.
describe('M19: promoción anticipada', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let grupoDestinoId: string;
  let ingles: string;
  let guardianId: string;

  async function cerrarNota(estudiante: UserDocument, asignacionId: unknown, grupoId: string, materiaId: string, periodo: number, nota: number) {
    await CalificacionAsignatura.create({
      academic_year_id: n.anioId,
      teacher_assignment_id: asignacionId,
      group_id: grupoId,
      subject_id: materiaId,
      periodo_numero: periodo,
      student_id: estudiante._id,
      estado: 'DEFINITIVO',
      resultado: { componentes: [], nota_asignatura: nota },
    });
  }
  const notaEnSexto = (estudiante: UserDocument, nota: number) => cerrarNota(estudiante, n.asignacion._id, n.grupoId, n.materiaId, 1, nota);

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    n = await prepararNotas(e);

    // Grado siguiente: séptimo, con Matemáticas (equivalente a la de sexto) e Inglés técnico (materia que arranca en séptimo).
    const sexto = (await Group.findById(n.grupoId))!;
    const septimo = await Grade.create({ nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' });
    const destino = await Group.create({ sede_id: sexto.sede_id, academic_year_id: n.anioId, grade_id: septimo._id, jornada_id: sexto.jornada_id, nomenclatura: '701', max_capacity: 40 });
    grupoDestinoId = String(destino._id);
    const materiaIngles = await Subject.create({ area_id: n.areaId, nombre: 'Inglés técnico', abreviatura: 'ING', descripcion: 'x', tipo: 'OBLIGATORIA', niveles_educativos: ['SECUNDARIA'] });
    ingles = String(materiaIngles._id);
    await TeacherAssignment.create({ docente_id: e.docenteAjeno._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: destino._id, subject_id: n.materiaId, horas_semanales: 4 });
    await TeacherAssignment.create({ docente_id: e.docenteDeClase._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: destino._id, subject_id: materiaIngles._id, horas_semanales: 2 });

    const acudiente = await Guardian.create({ tipo_documento: 'CC', numero_documento: '55443322', nombre: 'Lucía', apellido: 'Pérez', telefono_principal: '3001112233', user_id: null });
    guardianId = String(acudiente._id);
    await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: acudiente._id, parentesco: 'MADRE', es_principal: true });
  }, 60_000);

  const matriculaDe = async (u: UserDocument) => String((await Enrollment.findOne({ student_id: u._id }))!._id);
  const solicitar = async (u: UserDocument = e.estudiante, tipo: 'RENDIMIENTO_EXCEPCIONAL' | 'REINICIANTE' = 'RENDIMIENTO_EXCEPCIONAL') =>
    tramites.solicitar({ enrollment_id: await matriculaDe(u), tipo, motivo: 'Desempeño superior sostenido.' }, e.coordAcademico);

  /** Una sesión de la instancia con el caso votado a favor y firmada por todos sus integrantes. */
  async function sesionFirmada(instancia: 'COMISION_EVALUACION' | 'CONSEJO_DIRECTIVO', tramiteId: string, decision: 'RECOMENDAR_ANTICIPADA' | 'NO_RECOMENDAR_ANTICIPADA' | 'APROBAR_ANTICIPADA' | 'NO_APROBAR_ANTICIPADA') {
    const gestor = instancia === 'CONSEJO_DIRECTIVO' ? e.admin : e.coordAcademico;
    const creada = await sesiones.crearSesion(
      {
        instancia,
        academic_year_id: n.anioId,
        fecha: new Date(),
        orden_del_dia: 'Promoción anticipada.',
        miembros: [
          { user_id: String(e.admin._id), cargo: 'Rector', es_presidente: true },
          { user_id: String(e.coordAcademico._id), cargo: 'Coordinadora' },
          { user_id: String(e.docenteAjeno._id), cargo: 'Docente' },
        ],
      },
      gestor
    );
    const id = String(creada._id);
    await sesiones.convocar(id, gestor);
    const conCaso = await sesiones.agregarCaso(id, { student_id: String(e.estudiante._id), tipo: 'PROMOCION_ANTICIPADA', promocion_anticipada_id: tramiteId }, gestor);
    const casoId = String(conCaso.casos[0]!._id);
    const m = conCaso.miembros.map((x) => String(x._id));
    await sesiones.actualizarSesion(id, { asistencia: m.map((miembro_id) => ({ miembro_id, asistio: true })), desarrollo: 'Se revisó la ficha del estudiante.' }, gestor);
    await sesiones.actualizarCaso(id, casoId, { votos: m.map((miembro_id) => ({ miembro_id, voto: 'A_FAVOR' as const })), decision: { tipo: decision, fundamento: 'Cumple los criterios.' } }, gestor);
    await sesiones.realizar(id, gestor);
    for (const quien of [e.admin, e.coordAcademico, e.docenteAjeno]) await sesiones.firmar(id, CLAVE, quien);
    return id;
  }

  async function hastaLista(u: UserDocument = e.estudiante) {
    const t = await solicitar(u);
    const id = String(t._id);
    await tramites.registrarConsentimiento(id, { otorgado: true, medio: 'FORMATO_FIRMADO', guardian_id: guardianId }, e.coordAcademico);
    await sesionFirmada('COMISION_EVALUACION', id, 'RECOMENDAR_ANTICIPADA');
    await sesionFirmada('CONSEJO_DIRECTIVO', id, 'APROBAR_ANTICIPADA');
    return id;
  }

  describe('solicitud', () => {
    it('la configuración nace con los valores de partida y solo el administrador la cambia', async () => {
      const inicial = datosDeConfiguracion(await obtenerConfiguracion());
      expect(inicial).toMatchObject({ activa: true, periodo_evaluacion: 1, tratamiento_notas: 'NIVELACION' });
      await expect(actualizarConfiguracion({ ...inicial, tratamiento_notas: 'DEJAR_SIN_NOTA' }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      expect((await actualizarConfiguracion({ ...inicial, tratamiento_notas: 'DEJAR_SIN_NOTA' }, e.admin)).tratamiento_notas).toBe('DEJAR_SIN_NOTA');
    });

    it('exige las notas cerradas del periodo y que cumplan el criterio del colegio; el docente no puede solicitar', async () => {
      await expect(solicitar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Faltan notas cerradas/) });
      await notaEnSexto(e.otroEstudiante, 3.5);
      await expect(solicitar(e.otroEstudiante)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/por debajo del mínimo/) });
      await notaEnSexto(e.estudiante, 4.8);
      await expect(tramites.solicitar({ enrollment_id: await matriculaDe(e.estudiante), tipo: 'RENDIMIENTO_EXCEPCIONAL' }, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      const t = await solicitar();
      expect(t).toMatchObject({ estado: 'SOLICITADA', anio: new Date().getUTCFullYear() });
      expect(t.evaluacion.promedio).toBe(4.8);
      await expect(solicitar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/ya tiene un trámite/) });
    });

    it('un reiniciante lo es por ingresar como repitente o por no haber sido promovido en ese grado el año anterior', async () => {
      await notaEnSexto(e.estudiante, 4.5);
      await expect(solicitar(e.estudiante, 'REINICIANTE')).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/no es reiniciante/) });
      await Enrollment.updateOne({ student_id: e.estudiante._id }, { tipo_ingreso: 'REPITENTE' });
      await expect(solicitar(e.estudiante, 'REINICIANTE')).resolves.toMatchObject({ tipo: 'REINICIANTE' });
    });

    it('fuera de la ventana configurada no se puede solicitar', async () => {
      await notaEnSexto(e.estudiante, 4.8);
      const anio = (await AcademicYear.findById(n.anioId))!;
      anio.periodos[0]!.fecha_fin = new Date(Date.now() - 90 * 86_400_000);
      await anio.save();
      await expect(solicitar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Venció el plazo/) });
    });
  });

  describe('trámite completo con NIVELACION (valor de partida)', () => {
    beforeEach(async () => {
      await notaEnSexto(e.estudiante, 4.8);
    });

    it('no se emite la resolución sin los pasos exigidos, y la comisión debe recomendar antes de que decida el Consejo Directivo', async () => {
      const t = await solicitar();
      const id = String(t._id);
      await expect(tramites.emitirResolucion(id, 'x', CLAVE, e.admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        sesiones.agregarCaso(
          String((await sesiones.crearSesion({ instancia: 'CONSEJO_DIRECTIVO', academic_year_id: n.anioId, fecha: new Date(), miembros: [{ user_id: String(e.admin._id), cargo: 'Rector', es_presidente: true }] }, e.admin))._id),
          { student_id: String(e.estudiante._id), tipo: 'PROMOCION_ANTICIPADA', promocion_anticipada_id: id },
          e.admin
        )
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/concepto favorable/) });
      const detalle = await tramites.obtener(id, e.admin);
      expect(detalle.requisitos_pendientes).toHaveLength(3);
    });

    it('una nivelación pendiente frena el cierre solo de ese estudiante, no el de su grupo', async () => {
      const id = await hastaLista();
      await tramites.emitirResolucion(id, 'Cumple.', CLAVE, e.admin);
      await tramites.aplicar(id, grupoDestinoId, e.admin);
      // Un compañero del grupo nuevo con todas sus notas cerradas.
      await Enrollment.updateOne({ student_id: e.otroEstudiante._id }, { group_id: grupoDestinoId });
      const clases = await TeacherAssignment.find({ group_id: grupoDestinoId });
      for (const c of clases) {
        for (const periodo of [1, 2, 3, 4]) await cerrarNota(e.otroEstudiante, c._id, grupoDestinoId, String(c.subject_id), periodo, 4);
        for (const periodo of [2, 3, 4]) await cerrarNota(e.estudiante, c._id, grupoDestinoId, String(c.subject_id), periodo, 4);
      }

      const primero = await cerrarGrupo(n.anioId, grupoDestinoId, 'CIERRE', CLAVE, e.admin);
      expect(primero).toMatchObject({ cerrados: 1 });
      expect(primero.bloqueados).toEqual([{ student_id: String(e.estudiante._id), nivelaciones_pendientes: expect.arrayContaining(['Matemáticas', 'Inglés técnico']) }]);
      expect(await EvaluacionPromocion.countDocuments({ student_id: e.otroEstudiante._id, vigente: true })).toBe(1);
      expect(await EvaluacionPromocion.countDocuments({ student_id: e.estudiante._id })).toBe(0);

      // Resuelta su nivelación, el cierre siguiente lo incluye.
      await tramites.registrarNivelacion(id, n.materiaId, 4, e.docenteAjeno);
      await tramites.registrarNivelacion(id, ingles, 4, e.docenteDeClase);
      const segundo = await cerrarGrupo(n.anioId, grupoDestinoId, 'CIERRE', CLAVE, e.admin);
      expect(segundo).toMatchObject({ cerrados: 1, omitidos: 1, bloqueados: [] });
      expect(await EvaluacionPromocion.countDocuments({ student_id: e.estudiante._id, vigente: true })).toBe(1);
    });

    it('consentimiento: solo un acudiente vinculado; si la familia no autoriza, el trámite se rechaza', async () => {
      const t = await solicitar();
      const id = String(t._id);
      const ajeno = await Guardian.create({ tipo_documento: 'CC', numero_documento: '11112222', nombre: 'Ajena', apellido: 'Persona', telefono_principal: '3000000000', user_id: null });
      await expect(tramites.registrarConsentimiento(id, { otorgado: true, medio: 'CORREO', guardian_id: String(ajeno._id) }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
      await expect(tramites.registrarConsentimiento(id, { otorgado: true, medio: 'CORREO', por_el_estudiante: true }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });
      const negada = await tramites.registrarConsentimiento(id, { otorgado: false, medio: 'ACTA_DE_REUNION', guardian_id: guardianId }, e.coordAcademico);
      expect(negada.estado).toBe('RECHAZADA');
      expect(negada.cierre?.motivo).toMatch(/no autoriza/);
    });

    it('una recomendación negativa de la comisión cierra el trámite', async () => {
      const t = await solicitar();
      await sesionFirmada('COMISION_EVALUACION', String(t._id), 'NO_RECOMENDAR_ANTICIPADA');
      const cerrado = await PromocionAnticipada.findById(t._id);
      expect(cerrado).toMatchObject({ estado: 'RECHAZADA' });
      expect(cerrado?.cierre?.motivo).toMatch(/no recomienda/);
    });

    it('del trámite a la nota anual: resolución con huella, paso al grado siguiente y nivelación que ocupa el periodo 1', async () => {
      const id = await hastaLista();
      expect((await PromocionAnticipada.findById(id))!.estado).toBe('LISTA_PARA_RESOLUCION');

      await expect(tramites.emitirResolucion(id, 'Cumple.', 'otra', e.admin)).rejects.toMatchObject({ statusCode: 401 });
      await expect(tramites.emitirResolucion(id, 'Cumple.', CLAVE, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      const resuelta = await tramites.emitirResolucion(id, 'Cumple los criterios del SIEE.', CLAVE, e.admin);
      expect(resuelta).toMatchObject({ estado: 'RESUELTA' });
      expect(resuelta.resolucion?.codigo).toBe(`RPA-${new Date().getUTCFullYear()}-001`);
      expect((await tramites.verificarIntegridad(id, e.admin)).integra).toBe(true);
      expect((await generarPdfResolucion(id, e.admin)).buffer.subarray(0, 4).toString()).toBe('%PDF');

      // Aplicar: solo el rector, a un grupo del grado siguiente y de la misma sede.
      await expect(tramites.aplicar(id, grupoDestinoId, e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      await expect(tramites.aplicar(id, n.grupoId, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/grado siguiente/) });
      const aplicada = await tramites.aplicar(id, grupoDestinoId, e.admin);
      expect(aplicada.nivelaciones_pendientes).toBe(2);
      expect(String((await Enrollment.findOne({ student_id: e.estudiante._id }))!.group_id)).toBe(grupoDestinoId);
      expect(await Enrollment.countDocuments({ student_id: e.estudiante._id })).toBe(1);
      // El sistema asienta solo la novedad con la resolución como soporte.
      const novedades = (await Enrollment.findOne({ student_id: e.estudiante._id }))!.novedades;
      expect(novedades).toHaveLength(1);
      expect(novedades[0]).toMatchObject({ tipo: 'PROMOCION_ANTICIPADA', referencia: resuelta.resolucion!.codigo });
      expect(novedades[0]!.texto).toBe(`Promovido anticipadamente de Sexto a Séptimo según Resolución No. ${resuelta.resolucion!.codigo}.`);

      // Y en el Observador: visible para el estudiante, de sistema, sin duplicarse ni poder enmendarse o anularse.
      const enObservador = await Observacion.find({ student_id: e.estudiante._id, de_sistema: true });
      expect(enObservador).toHaveLength(1);
      expect(enObservador[0]).toMatchObject({ clase: 'OBSERVACION', tipo_nombre: 'Novedad institucional', visible_estudiante: true, confidencial: false, descripcion: novedades[0]!.texto });
      expect(String(enObservador[0]!.group_id)).toBe(grupoDestinoId);
      await expect(enmendarObservacion(String(enObservador[0]!._id), { descripcion: 'Otro texto' }, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/no se enmienda ni se anula/) });
      await expect(anularObservacion(String(enObservador[0]!._id), 'Intento de anular el soporte legal.', e.admin)).rejects.toMatchObject({ statusCode: 409 });
      const tipo = (await TipoObservacion.findOne({ sistema: true }))!;
      await expect(actualizarTipo(String(tipo._id), { nombre: 'Otro nombre' }, { usuarioId: e.admin._id })).rejects.toMatchObject({ statusCode: 409 });
      await expect(eliminarTipo(String(tipo._id), { usuarioId: e.admin._id })).rejects.toMatchObject({ statusCode: 409 });
      expect((await listarCatalogo(false)).tipos.some((t) => t.sistema)).toBe(false);
      expect((await listarCatalogo(true)).tipos.some((t) => t.sistema)).toBe(true);
      await expect(registrarObservacion({ estudiantes_ids: [String(e.estudiante._id)], tipo_id: String(tipo._id), descripcion: 'x', fecha_hecho: hoy() }, e.coordAcademico)).rejects.toMatchObject({ statusCode: 400 });

      // Con la nivelación pendiente el año del grado nuevo sigue incompleto; al registrarla ocupa el lugar del periodo 1.
      const clasesNuevas = await TeacherAssignment.find({ group_id: grupoDestinoId });
      const deMate = clasesNuevas.find((c) => String(c.subject_id) === n.materiaId)!;
      for (const periodo of [2, 3, 4]) await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, periodo, 3);
      const anio = (await AcademicYear.findById(n.anioId))!;
      const sinNivelar = await cargarContextoNotas(anio, [deMate._id]);
      expect(definitivaAnual(sinNivelar, deMate._id, e.estudiante._id)).toBeNull();

      await expect(tramites.registrarNivelacion(id, n.materiaId, 4.5, e.docenteDeClase)).rejects.toMatchObject({ statusCode: 403 });
      await expect(tramites.registrarNivelacion(id, n.materiaId, 9, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 400 });
      await tramites.registrarNivelacion(id, n.materiaId, 5, e.docenteAjeno);
      const nivelada = await cargarContextoNotas(anio, [deMate._id]);
      // 5 × 30 % + 3 × 30 % + 3 × 20 % + 3 × 20 % = 3.6 (la nota del P1 es la de la nivelación)
      expect(definitivaAnual(nivelada, deMate._id, e.estudiante._id)).toBe(3.6);

      const detalle = await tramites.obtener(id, e.admin);
      expect(detalle.nivelaciones_pendientes.map((x) => x.nombre)).toEqual(['Inglés técnico']);
      await expect(tramites.anular(id, 'Ya no procede, error de digitación.', e.admin)).rejects.toMatchObject({ statusCode: 409 });

      // Alterar la resolución directo en la base se detecta.
      await PromocionAnticipada.updateOne({ _id: id }, { $set: { 'resolucion.fundamento': 'Texto alterado' } });
      expect((await tramites.verificarIntegridad(id, e.admin)).integra).toBe(false);
    });
  });

  describe('trato de las notas de los periodos no cursados', () => {
    async function aplicadaCon(tratamiento: 'COPIAR_EQUIVALENTES' | 'DEJAR_SIN_NOTA') {
      await notaEnSexto(e.estudiante, 4.8);
      const config = datosDeConfiguracion(await obtenerConfiguracion());
      await actualizarConfiguracion({ ...config, tratamiento_notas: tratamiento }, e.admin);
      const id = await hastaLista();
      await tramites.emitirResolucion(id, 'Cumple.', CLAVE, e.admin);
      await tramites.aplicar(id, grupoDestinoId, e.admin);
      const clasesNuevas = await TeacherAssignment.find({ group_id: grupoDestinoId });
      return { id, deMate: clasesNuevas.find((c) => String(c.subject_id) === n.materiaId)!, deIngles: clasesNuevas.find((c) => String(c.subject_id) === ingles)! };
    }

    it('COPIAR_EQUIVALENTES copia lo que tiene equivalente y exige nivelación solo para la materia huérfana', async () => {
      const { id, deMate, deIngles } = await aplicadaCon('COPIAR_EQUIVALENTES');
      const t = (await PromocionAnticipada.findById(id))!;
      const porMateria = new Map(t.aplicacion!.notas.map((x) => [String(x.subject_id), x]));
      expect(porMateria.get(n.materiaId)).toMatchObject({ modo: 'COPIADA', nota: 4.8 });
      expect(porMateria.get(ingles)).toMatchObject({ modo: 'NIVELACION', nota: null });
      expect(porMateria.get(ingles)?.motivo).toMatch(/sin equivalente/);
      // Solo se puede nivelar lo que quedó en nivelación.
      await expect(tramites.registrarNivelacion(id, n.materiaId, 4, e.admin)).rejects.toMatchObject({ statusCode: 404 });

      const anio = (await AcademicYear.findById(n.anioId))!;
      for (const periodo of [2, 3, 4]) await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, periodo, 3);
      for (const periodo of [2, 3, 4]) await cerrarNota(e.estudiante, deIngles._id, grupoDestinoId, ingles, periodo, 3);
      const ctx = await cargarContextoNotas(anio, [deMate._id, deIngles._id]);
      // 4.8 × 30 % + 3 × 70 % = 3.54 → 3.5 (escala de un decimal); inglés sigue incompleto hasta nivelar.
      expect(definitivaAnual(ctx, deMate._id, e.estudiante._id)).toBe(3.5);
      expect(definitivaAnual(ctx, deIngles._id, e.estudiante._id)).toBeNull();
    });

    it('DEJAR_SIN_NOTA reparte el porcentaje del periodo 1 entre los restantes y no deja un hueco que bloquee el año', async () => {
      const { id, deMate } = await aplicadaCon('DEJAR_SIN_NOTA');
      const t = (await PromocionAnticipada.findById(id))!;
      expect(t.aplicacion!.notas.every((x) => x.modo === 'SIN_NOTA')).toBe(true);
      expect((await tramites.obtener(id, e.admin)).nivelaciones_pendientes).toEqual([]);

      const anio = (await AcademicYear.findById(n.anioId))!;
      await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, 2, 4);
      await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, 3, 3);
      await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, 4, 5);
      const ctx = await cargarContextoNotas(anio, [deMate._id]);
      // (4 × 30 + 3 × 20 + 5 × 20) / 70 = 4.00
      expect(definitivaAnual(ctx, deMate._id, e.estudiante._id)).toBe(4);
    });

    it('una nota realmente cerrada en el periodo 1 del grupo nuevo manda sobre lo resuelto', async () => {
      const { deMate } = await aplicadaCon('DEJAR_SIN_NOTA');
      for (const [periodo, nota] of [[1, 5], [2, 4], [3, 3], [4, 5]] as const) await cerrarNota(e.estudiante, deMate._id, grupoDestinoId, n.materiaId, periodo, nota);
      const ctx = await cargarContextoNotas((await AcademicYear.findById(n.anioId))!, [deMate._id]);
      // 5 × 30 % + 4 × 30 % + 3 × 20 % + 5 × 20 % = 4.30
      expect(definitivaAnual(ctx, deMate._id, e.estudiante._id)).toBe(4.3);
    });
  });

  it('un trámite abierto lo anula coordinación; uno con resolución solo el rector; uno anulado deja volver a intentar', async () => {
    await notaEnSexto(e.estudiante, 4.8);
    const abierto = await solicitar();
    expect(await tramites.anular(String(abierto._id), 'La familia desistió del trámite.', e.coordAcademico)).toMatchObject({ estado: 'ANULADA' });
    await expect(tramites.anular(String(abierto._id), 'Otra vez el mismo trámite.', e.coordAcademico)).rejects.toMatchObject({ statusCode: 409 });

    const id = await hastaLista();
    await tramites.emitirResolucion(id, 'Cumple.', CLAVE, e.admin);
    await expect(tramites.anular(id, 'Error en la resolución emitida.', e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
    expect(await tramites.anular(id, 'Error en la resolución emitida.', e.admin)).toMatchObject({ estado: 'ANULADA' });
  });
});
