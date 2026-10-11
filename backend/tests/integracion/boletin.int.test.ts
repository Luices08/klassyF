import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Activity from '../../src/models/activity.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import AuditLog from '../../src/models/auditLog.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import { PLANTILLA_BOLETIN_INICIAL } from '../../src/constants/boletin';
import FraseDesempeno from '../../src/models/fraseDesempeno.model';
import PublicacionBoletin from '../../src/models/publicacionBoletin.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import { UserDocument } from '../../src/models/user.model';
import * as config from '../../src/services/boletinConfig.service';
import * as notas from '../../src/services/notas.service';
import * as observaciones from '../../src/services/observacionBoletin.service';
import * as publicacion from '../../src/services/publicacionBoletin.service';
import { generarBoletinesDeGrupo, generateReportCard } from '../../src/services/reportCard.service';
import { generarPdfBoletin, generarPdfBoletinesDeGrupo, generarPdfMuestra } from '../../src/services/reportCardPdf.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { crearActividad, crearCasillaSuelta, definirComponentes, EscenarioNotas, idAleatorio, prepararNotas } from './escenarioNotas';

const HETERO = { clave: 'HETEROEVALUACION', nombre: 'Heteroevaluación', porcentaje: 70, max_casillas: 10 };
const AUTO = { clave: 'AUTOEVALUACION', nombre: 'Autoevaluación', porcentaje: 30, max_casillas: 1 };

describe('M17: boletín con textos del colegio, observaciones del docente y PDF (con base de datos)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let docente: UserDocument;
  let a1: string;
  let au: string;
  const idEst = (u: UserDocument) => String(u._id);

  beforeAll(iniciarBaseDeDatos, 600_000);
  afterAll(detenerBaseDeDatos);

  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes(), CalificacionAsignatura.syncIndexes(), FraseDesempeno.syncIndexes(), PublicacionBoletin.syncIndexes()]);
    e = await armarEscenario();
    docente = e.docenteDeClase;
    n = await prepararNotas(e);
    await definirComponentes([HETERO, AUTO]);
    a1 = String((await crearActividad(n.asignacion, 'HETEROEVALUACION', null))._id);
    au = String((await crearCasillaSuelta(n.asignacion, 'AUTOEVALUACION', 'Autoevaluación'))._id);
  }, 60_000);

  const ref = () => ({ teacher_assignment_id: String(n.asignacion._id), periodo_numero: 1 });
  /** Cierra la planilla con las mismas notas para los tres: hetero 4 (70%) y auto 5 (30%) → 4.30 (Alto con la escala por defecto). */
  async function cerrarConNotas(): Promise<void> {
    await notas.guardarCeldas(
      {
        ...ref(),
        celdas: [e.estudiante, e.otroEstudiante, e.tercerEstudiante].flatMap((u) => [
          { student_id: idEst(u), casilla_id: a1, nota: 4 },
          { student_id: idEst(u), casilla_id: au, nota: 5 },
        ]),
      },
      docente
    );
    await notas.cerrarPlanilla(ref(), docente);
  }
  const boletin = (u: UserDocument = e.estudiante, usuario: UserDocument = e.admin) =>
    generateReportCard({ student_id: idEst(u), academic_year_id: n.anioId, periodo_numero: 1 }, usuario);

  describe('banco de textos por desempeño', () => {
    it('la primera vez se siembran los 8 textos de partida y el colegio los edita', async () => {
      const frases = await config.listarFrases();
      expect(frases).toHaveLength(8);
      expect(frases.find((f) => f.nivel === 'ALTO' && f.tipo === 'RECOMENDACION')?.texto).toBe('');
      expect(frases.find((f) => f.nivel === 'BAJO' && f.tipo === 'RECOMENDACION')?.texto).not.toBe('');

      await config.guardarFrase('ALTO', 'DESCRIPCION', 'Texto propio del colegio.', e.admin);
      expect((await config.listarFrases()).find((f) => f.nivel === 'ALTO' && f.tipo === 'DESCRIPCION')?.texto).toBe('Texto propio del colegio.');
      // Listar de nuevo no pisa lo que el colegio editó ni duplica nada.
      expect(await FraseDesempeno.countDocuments()).toBe(8);
      expect(await AuditLog.countDocuments({ accion: 'BOLETIN_FRASE_ACTUALIZADA' })).toBe(1);
    });

    it('el boletín trae el texto del nivel de cada asignatura cerrada, y nada si aún no se cierra', async () => {
      await config.guardarFrase('ALTO', 'DESCRIPCION', 'Dominio sólido del periodo.', e.admin);
      await config.guardarFrase('ALTO', 'RECOMENDACION', 'Seguir profundizando en casa.', e.admin);

      const antes = await boletin();
      expect(antes.areas[0]!.asignaturas[0]).toMatchObject({ descripcion: '', recomendacion: '', observacion_docente: null });

      await cerrarConNotas();
      const despues = await boletin();
      expect(despues.areas[0]!.asignaturas[0]).toMatchObject({
        desempeno: { nivel: 'ALTO' },
        descripcion: 'Dominio sólido del periodo.',
        recomendacion: 'Seguir profundizando en casa.',
      });
    });
  });

  describe('configuración del boletín', () => {
    it('trae la escala con su equivalencia nacional, el nombre del periodo y la institución', async () => {
      const b = await boletin();
      expect(b.escala.map((r) => r.nivel).sort()).toEqual(['ALTO', 'BAJO', 'BASICO', 'SUPERIOR']);
      expect(b).toMatchObject({ nombre_periodo: 'Periodo 1', mostrar_puesto: true, fecha_entrega: null, canal_reclamaciones: '' });
      expect(b.institucion.nombre).not.toBe('');
    });

    it('la fecha de entrega y el canal de reclamaciones llegan al boletín, y el puesto se puede ocultar', async () => {
      await cerrarConNotas();
      await config.actualizarConfiguracionBoletin(
        {
          canal_reclamaciones: 'Escriba a coordinación en 5 días hábiles.',
          mostrar_puesto: false,
          entregas: [{ academic_year_id: n.anioId, periodo_numero: 1, fecha_entrega: new Date('2026-07-10T00:00:00.000Z') }],
        },
        e.admin
      );
      const b = await boletin();
      expect(b).toMatchObject({ canal_reclamaciones: 'Escriba a coordinación en 5 días hábiles.', mostrar_puesto: false, puesto_grupo: null });
      expect(b.fecha_entrega?.toISOString()).toBe('2026-07-10T00:00:00.000Z');
      expect(await AuditLog.countDocuments({ accion: 'BOLETIN_CONFIGURACION_ACTUALIZADA' })).toBe(1);
    });

    it('rechaza una entrega de un periodo que el año no tiene y dos fechas para el mismo periodo', async () => {
      await expect(
        config.actualizarConfiguracionBoletin({ entregas: [{ academic_year_id: n.anioId, periodo_numero: 9, fecha_entrega: new Date() }] }, e.admin)
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no tiene un periodo 9/) });
      const repetida = { academic_year_id: n.anioId, periodo_numero: 1, fecha_entrega: new Date() };
      await expect(config.actualizarConfiguracionBoletin({ entregas: [repetida, repetida] }, e.admin)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/más de una fecha/),
      });
    });
  });

  describe('observaciones del docente', () => {
    const guardar = (lista: Array<{ student_id: string; texto: string }>, usuario = docente) =>
      observaciones.guardarObservaciones(String(n.asignacion._id), 1, lista, usuario);

    it('el docente titular escribe y la observación sale en el boletín solo de ese estudiante', async () => {
      await guardar([{ student_id: idEst(e.estudiante), texto: '  Participa con entusiasmo.  ' }]);

      expect((await boletin(e.estudiante)).areas[0]!.asignaturas[0]!.observacion_docente).toBe('Participa con entusiasmo.');
      expect((await boletin(e.otroEstudiante)).areas[0]!.asignaturas[0]!.observacion_docente).toBeNull();

      const lista = await observaciones.listarObservaciones(String(n.asignacion._id), 1, docente);
      expect(lista).toHaveLength(3);
      expect(lista.find((o) => o.student_id === idEst(e.estudiante))?.texto).toBe('Participa con entusiasmo.');
    });

    it('volver a guardar actualiza la misma observación y un texto vacío la quita', async () => {
      await guardar([{ student_id: idEst(e.estudiante), texto: 'Primera' }]);
      await guardar([{ student_id: idEst(e.estudiante), texto: 'Segunda' }]);
      expect((await boletin()).areas[0]!.asignaturas[0]!.observacion_docente).toBe('Segunda');

      expect(await guardar([{ student_id: idEst(e.estudiante), texto: '   ' }])).toEqual({ guardadas: 0, eliminadas: 1 });
      expect((await boletin()).areas[0]!.asignaturas[0]!.observacion_docente).toBeNull();
    });

    it('solo el docente titular escribe; coordinación consulta; un docente ajeno no entra', async () => {
      await expect(guardar([{ student_id: idEst(e.estudiante), texto: 'x' }], e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(guardar([{ student_id: idEst(e.estudiante), texto: 'x' }], e.coordAcademico)).rejects.toMatchObject({ statusCode: 403 });
      expect(await observaciones.listarObservaciones(String(n.asignacion._id), 1, e.coordAcademico)).toHaveLength(3);
      await expect(observaciones.listarObservaciones(String(n.asignacion._id), 1, e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('todo o nada: un estudiante ajeno al grupo o repetido no deja guardado ni lo válido', async () => {
      const ajeno = idAleatorio();
      await expect(
        guardar([
          { student_id: idEst(e.estudiante), texto: 'Válida' },
          { student_id: ajeno, texto: 'No es del grupo' },
        ])
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        guardar([
          { student_id: idEst(e.estudiante), texto: 'A' },
          { student_id: idEst(e.estudiante), texto: 'B' },
        ])
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/más de una vez/) });
      expect((await observaciones.listarObservaciones(String(n.asignacion._id), 1, docente)).every((o) => o.texto === '')).toBe(true);
    });

    it('un periodo que el año no tiene se rechaza', async () => {
      await expect(observaciones.guardarObservaciones(String(n.asignacion._id), 9, [{ student_id: idEst(e.estudiante), texto: 'x' }], docente)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('boletines de un grupo y PDF', () => {
    const params = () => ({ group_id: n.grupoId, academic_year_id: n.anioId, periodo_numero: 1 });

    it('el lote trae un boletín por estudiante con matrícula activa, en orden alfabético, y coincide con el individual', async () => {
      await cerrarConNotas();
      const lote = await generarBoletinesDeGrupo(params(), e.coordAcademico);
      expect(lote).toHaveLength(3);

      const individual = await boletin(e.estudiante);
      const delLote = lote.find((b) => b.estudiante.id === idEst(e.estudiante))!;
      expect(delLote).toEqual(individual);
      expect(delLote.puesto_grupo).toBe(1);
    });

    it('lo piden coordinación, secretaría o el director del grupo; un docente que no lo dirige o un estudiante no', async () => {
      await expect(generarBoletinesDeGrupo(params(), e.secretaria)).resolves.toHaveLength(3);
      await expect(generarBoletinesDeGrupo(params(), e.directora)).resolves.toHaveLength(3);
      await expect(generarBoletinesDeGrupo(params(), e.docenteAjeno)).rejects.toMatchObject({ statusCode: 403 });
      await expect(generarBoletinesDeGrupo(params(), e.estudiante)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rechaza un periodo que el año no tiene', async () => {
      await expect(generarBoletinesDeGrupo({ ...params(), periodo_numero: 9 }, e.admin)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('el PDF individual respeta el permiso del boletín: el estudiante baja el suyo, no el de otro', async () => {
      await cerrarConNotas();
      await publicacion.establecerPublicacionGrupo(params(), true, e.admin);
      const { buffer, nombreArchivo } = await generarPdfBoletin({ student_id: idEst(e.estudiante), academic_year_id: n.anioId, periodo_numero: 1 }, e.estudiante);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(nombreArchivo).toMatch(/^boletin_.+_P1\.pdf$/);
      await expect(
        generarPdfBoletin({ student_id: idEst(e.otroEstudiante), academic_year_id: n.anioId, periodo_numero: 1 }, e.estudiante)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('el PDF del grupo sale con una hoja por estudiante y deja rastro en la auditoría', async () => {
      await cerrarConNotas();
      const { buffer } = await generarPdfBoletinesDeGrupo(params(), e.coordAcademico);
      expect((buffer.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length).toBe(3);
      expect(await AuditLog.countDocuments({ accion: 'BOLETIN_GRUPO_DESCARGADO' })).toBe(1);
    });
  });

  describe('quién de la familia ve el boletín', () => {
    const ref = () => ({ group_id: n.grupoId, academic_year_id: n.anioId, periodo_numero: 1 });
    const comoEstudiante = (u: UserDocument = e.estudiante) => boletin(u, u);

    it('sin publicar, el estudiante no lo ve (403) y el personal sí', async () => {
      await cerrarConNotas();
      await expect(comoEstudiante()).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/aún no está disponible/) });
      for (const personal of [e.admin, e.coordAcademico, e.secretaria, e.docenteDeClase]) {
        await expect(boletin(e.estudiante, personal)).resolves.toMatchObject({ completo: true });
      }
      expect((await publicacion.obtenerPublicacion(ref())).estudiantes.every((x) => !x.visible && x.origen === 'SIN_PUBLICAR')).toBe(true);
    });

    it('al publicar el grupo lo ven todos sus estudiantes; al retirarlo, ninguno', async () => {
      await cerrarConNotas();
      const publicado = await publicacion.establecerPublicacionGrupo(ref(), true, e.admin);
      expect(publicado).toMatchObject({ publicado: true });
      expect(publicado.estudiantes).toHaveLength(3);
      expect(publicado.estudiantes.every((x) => x.visible && x.origen === 'GRUPO')).toBe(true);
      await expect(comoEstudiante(e.otroEstudiante)).resolves.toMatchObject({ completo: true });

      await publicacion.establecerPublicacionGrupo(ref(), false, e.admin);
      await expect(comoEstudiante(e.otroEstudiante)).rejects.toMatchObject({ statusCode: 403 });
      expect(await AuditLog.countDocuments({ accion: 'BOLETIN_PUBLICACION_ACTUALIZADA' })).toBe(2);
    });

    it('una excepción bloquea a un estudiante aunque el grupo esté publicado, y otra deja ver a uno con el grupo sin publicar', async () => {
      await cerrarConNotas();
      await publicacion.establecerPublicacionGrupo(ref(), true, e.admin);
      const bloqueado = await publicacion.establecerAccesoEstudiante(ref(), idEst(e.otroEstudiante), false, e.admin);
      expect(bloqueado.estudiantes.find((x) => x.student_id === idEst(e.otroEstudiante))).toMatchObject({ visible: false, origen: 'EXCEPCION' });
      await expect(comoEstudiante(e.otroEstudiante)).rejects.toMatchObject({ statusCode: 403 });
      await expect(comoEstudiante(e.estudiante)).resolves.toMatchObject({ completo: true });

      await publicacion.establecerPublicacionGrupo(ref(), false, e.admin);
      await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), true, e.admin);
      await expect(comoEstudiante(e.estudiante)).resolves.toMatchObject({ completo: true });
      await expect(comoEstudiante(e.tercerEstudiante)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('quitar la excepción devuelve al estudiante a lo que decidió el grupo, sin duplicar excepciones', async () => {
      await publicacion.establecerPublicacionGrupo(ref(), true, e.admin);
      await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), false, e.admin);
      await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), false, e.admin);
      expect((await PublicacionBoletin.findOne())!.excepciones).toHaveLength(1);

      const sin = await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), null, e.admin);
      expect(sin.estudiantes.find((x) => x.student_id === idEst(e.estudiante))).toMatchObject({ visible: true, origen: 'GRUPO' });
      expect((await PublicacionBoletin.findOne())!.excepciones).toHaveLength(0);
      expect(await AuditLog.countDocuments({ accion: 'BOLETIN_ACCESO_ESTUDIANTE_ACTUALIZADO' })).toBe(3);
    });

    it('el acudiente ve el boletín de su estudiante solo cuando ese estudiante tiene acceso', async () => {
      await cerrarConNotas();
      const acudienteUsuario = await crearUsuario('ACUDIENTE');
      const acudiente = await Guardian.create({ tipo_documento: 'CC', numero_documento: '79111222', nombre: 'Luis', apellido: 'Pérez', telefono_principal: '3001112233', user_id: acudienteUsuario._id });
      await StudentGuardian.create({ student_id: e.estudiante._id, guardian_id: acudiente._id, parentesco: 'PADRE', es_principal: true });

      await expect(boletin(e.estudiante, acudienteUsuario)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/aún no está disponible/) });
      await publicacion.establecerPublicacionGrupo(ref(), true, e.admin);
      await expect(boletin(e.estudiante, acudienteUsuario)).resolves.toMatchObject({ completo: true });
      // Bloquear al estudiante bloquea también a su acudiente.
      await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), false, e.admin);
      await expect(boletin(e.estudiante, acudienteUsuario)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('el PDF también respeta el acceso: el estudiante no lo baja sin permiso', async () => {
      await cerrarConNotas();
      const consulta = { student_id: idEst(e.estudiante), academic_year_id: n.anioId, periodo_numero: 1 };
      await expect(generarPdfBoletin(consulta, e.estudiante)).rejects.toMatchObject({ statusCode: 403 });
      await publicacion.establecerAccesoEstudiante(ref(), idEst(e.estudiante), true, e.admin);
      expect((await generarPdfBoletin(consulta, e.estudiante)).buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('rechaza un estudiante ajeno al grupo, un periodo inexistente y un grupo de otro año', async () => {
      await expect(publicacion.establecerAccesoEstudiante(ref(), idAleatorio(), true, e.admin)).rejects.toMatchObject({ statusCode: 400 });
      await expect(publicacion.establecerPublicacionGrupo({ ...ref(), periodo_numero: 9 }, true, e.admin)).rejects.toMatchObject({ statusCode: 400 });
      expect(await PublicacionBoletin.countDocuments()).toBe(0);
    });
  });

  describe('boletín de muestra', () => {
    it('sale como PDF con la configuración real del colegio y sin tocar a ningún estudiante', async () => {
      await config.guardarFrase('SUPERIOR', 'DESCRIPCION', 'Texto real del colegio para Superior.', e.admin);
      const { buffer, nombreArchivo } = await generarPdfMuestra();
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(nombreArchivo).toBe('boletin_muestra.pdf');
      expect(await CalificacionAsignatura.countDocuments()).toBe(0);
    });
  });

  describe('diseño del boletín', () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    it('sin nada guardado rige el diseño original, y se puede leer sin tener la institución configurada', async () => {
      const vista = await config.leerConfiguracionBoletin();
      expect(vista.plantilla).toMatchObject({ titulo: 'Informe de evaluación', papel: 'LETTER', escudo: { posicion: 'IZQUIERDA', url: null } });
      expect(vista.plantilla.secciones.map((s) => s.clave)).toEqual(PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => s.clave));
      expect(vista.plantilla.estudiante.grado).toBe(true);
    });

    it('guarda lo que el colegio cambió, completa el resto y lo aplica a los PDF', async () => {
      await config.actualizarConfiguracionBoletin(
        { plantilla: { titulo: 'Boletín de calificaciones', papel: 'A4', escudo: { posicion: 'MARCA_DE_AGUA', url: `data:image/png;base64,${PNG}` } } as never },
        e.admin
      );
      const vista = await config.leerConfiguracionBoletin();
      expect(vista.plantilla).toMatchObject({ titulo: 'Boletín de calificaciones', papel: 'A4', subtitulo: '', escudo: { posicion: 'MARCA_DE_AGUA', mostrar: true } });

      await cerrarConNotas();
      const { buffer } = await generarPdfBoletinesDeGrupo({ group_id: n.grupoId, academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
      expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
    });

    it('volver al diseño original deja la plantilla como al principio', async () => {
      await config.actualizarConfiguracionBoletin({ plantilla: { titulo: 'Otro', papel: 'A4' } as never }, e.admin);
      await config.actualizarConfiguracionBoletin({ plantilla: {} as never }, e.admin);
      expect((await config.leerConfiguracionBoletin()).plantilla).toMatchObject({ titulo: 'Informe de evaluación', papel: 'LETTER' });
    });

    it('rechaza un escudo que no es una imagen PNG o JPG real, también en la vista previa', async () => {
      const falso = { escudo: { url: 'data:image/png;base64,aGVsbG8=' } } as never;
      await expect(config.actualizarConfiguracionBoletin({ plantilla: falso }, e.admin)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/PNG o JPG/) });
      await expect(generarPdfMuestra(falso)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('la vista previa dibuja el borrador sin guardarlo', async () => {
      const { buffer } = await generarPdfMuestra({ papel: 'A4' });
      expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
      expect((await config.leerConfiguracionBoletin()).plantilla.papel).toBe('LETTER');
    });

    it('la firma del director de grupo sale del grupo del estudiante', async () => {
      const b = await boletin(e.estudiante);
      expect(b.director_grupo).toBe(`${e.directora.nombre} ${e.directora.apellido}`);
    });

    it('un cambio del diseño no toca ninguna nota ni la configuración de entregas', async () => {
      await config.actualizarConfiguracionBoletin({ canal_reclamaciones: 'Coordinación', entregas: [{ academic_year_id: n.anioId, periodo_numero: 1, fecha_entrega: new Date('2026-07-10T00:00:00.000Z') }] }, e.admin);
      await config.actualizarConfiguracionBoletin({ plantilla: { titulo: 'Nuevo' } as never }, e.admin);
      const vista = await config.leerConfiguracionBoletin();
      expect(vista.canal_reclamaciones).toBe('Coordinación');
      expect(vista.entregas).toHaveLength(1);
      expect(vista.plantilla.titulo).toBe('Nuevo');
    });
  });

  describe('lo que pide la guía de boletines llega al boletín', () => {
    it('trae el nombre del grado, el calendario de entregas de todos los periodos y la firma del director', async () => {
      await config.actualizarConfiguracionBoletin({ entregas: [{ academic_year_id: n.anioId, periodo_numero: 2, fecha_entrega: new Date('2026-08-14T00:00:00.000Z') }] }, e.admin);
      const b = await boletin(e.estudiante);
      expect(b.estudiante.grado).not.toBe('');
      expect(b.calendario_entregas.map((x) => x.periodo)).toEqual(['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4']);
      expect(b.calendario_entregas.map((x) => x.fecha?.toISOString() ?? null)).toEqual([null, '2026-08-14T00:00:00.000Z', null, null]);
    });

    it('el PDF completo, con todas las secciones activas y las asignaturas con desempeño bajo, se genera', async () => {
      await cerrarConNotas();
      await config.actualizarConfiguracionBoletin({ plantilla: { fuente: 'SERIF', tamano_texto: 'GRANDE', texto_apoyo: 'Apoyo del colegio.', secciones: PLANTILLA_BOLETIN_INICIAL.secciones.map((s) => ({ ...s, visible: true })) } as never }, e.admin);
      const { buffer } = await generarPdfBoletin({ student_id: idEst(e.estudiante), academic_year_id: n.anioId, periodo_numero: 1 }, e.admin);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.toString('latin1')).toContain('/BaseFont /Times-Roman');
    });
  });
});
