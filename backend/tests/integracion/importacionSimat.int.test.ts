import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import { ImportacionSimat, ImportacionSimatFila } from '../../src/models/importacionSimat.model';
import SolicitudApoyo from '../../src/models/solicitudApoyo.model';
import Guardian from '../../src/models/guardian.model';
import StudentGuardian from '../../src/models/studentGuardian.model';
import StudentProfile from '../../src/models/studentProfile.model';
import User from '../../src/models/user.model';
import { obtenerConfiguracion } from '../../src/services/foliatura.service';
import {
  aplicarImportacion,
  descartarImportacion,
  listarFilasImportacion,
  marcarEstudianteRevisado,
  procesarLoteAhora,
  simularImportacion,
} from '../../src/services/importacionSimat.service';
import { listarEstudiantes } from '../../src/services/student.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const CLAVE = 'Clave-segura-1';
const ANIO = new Date().getUTCFullYear();
const DANE = '123456789012';
const SEDE = '123456789001';

const ENCABEZADO = [
  'ANO', 'ESTADO', 'DANE', 'CODIGO_DANE_SEDE', 'SEDE', 'JORNADA', 'GRADO_COD', 'GRUPO', 'FECHAINI', 'NUI', 'PER_ID', 'DOC', 'TIPODOC',
  'APELLIDO1', 'APELLIDO2', 'NOMBRE1', 'NOMBRE2', 'GENERO', 'FECHA_NACIMIENTO', 'BARRIO', 'EPS', 'TIPO DE SANGRE', 'ESTRATO', 'SISBEN IV',
  'DISCAPACIDAD', 'TRA_ESP_APR_ESCOLAR', 'ETNIA', 'TELEFONO', 'CORREO', 'HA_ESTADO_VINCULADO_SRPA',
];

type Fila = Record<string, string | number>;

/** Una fila de SIMAT con valores corrientes; cada prueba cambia lo que le interesa. */
function fila(doc: string | number, extra: Fila = {}): Fila {
  return {
    ANO: ANIO, ESTADO: 'MATRICULADO', DANE: DANE, CODIGO_DANE_SEDE: SEDE, SEDE: 'Principal', JORNADA: 'MAÑANA', GRADO_COD: 6, GRUPO: 601,
    FECHAINI: '2025-12-16 10:00:00', NUI: `NUI${doc}`, PER_ID: `7${doc}`, DOC: doc, TIPODOC: 'TI:TARJETA DE IDENTIDAD', APELLIDO1: `Apellido${doc}`,
    APELLIDO2: 'Segundo', NOMBRE1: `Nombre${doc}`, NOMBRE2: '', GENERO: 'MASCULINO', FECHA_NACIMIENTO: '2016-02-05', BARRIO: 'La Estancia',
    EPS: '', 'TIPO DE SANGRE': '', ESTRATO: 'ESTRATO 2', 'SISBEN IV': 'NO APLICA', DISCAPACIDAD: 'NO APLICA', TRA_ESP_APR_ESCOLAR: 'NO APLICA',
    ETNIA: 'NO APLICA', TELEFONO: '', CORREO: '', HA_ESTADO_VINCULADO_SRPA: 'NO', ...extra,
  };
}

const csv = (filas: Fila[], nombre = 'simat.csv') => ({
  nombre,
  buffer: Buffer.from([ENCABEZADO.join(';'), ...filas.map((f) => ENCABEZADO.map((c) => String(f[c] ?? '')).join(';'))].join('\n'), 'utf-8'),
});

describe('Importación de matrículas desde SIMAT (M04)', () => {
  let e: Escenario;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
    await Enrollment.init();
    await User.init();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Enrollment.syncIndexes();
    e = await armarEscenario();
    // El libro de matrícula debe estar confirmado para aplicar una importación.
    const foliatura = await obtenerConfiguracion();
    foliatura.confirmada = true;
    await foliatura.save();
  });

  const aplicar = async (lote: { _id: unknown }, usuario = e.admin) => {
    await aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, usuario);
    await procesarLoteAhora(String(lote._id));
  };
  const resultadoDe = async (loteId: unknown, doc: string) => (await ImportacionSimatFila.findOne({ lote_id: loteId, documento: doc }))!;

  describe('simulación', () => {
    it('clasifica cada fila y no escribe ningún estudiante ni matrícula', async () => {
      const antiguoDoc = e.estudiante.numero_documento;
      const matriculasAntes = await Enrollment.countDocuments();
      const usuariosAntes = await User.countDocuments();
      const lote = await simularImportacion(
        csv([
          fila('9001', { EPS: 'SURA', 'TIPO DE SANGRE': 'O +', 'SISBEN IV': 'a4', ETNIA: 'NEGRITUDES', DISCAPACIDAD: 'DISCAPACIDAD INTELECTUAL', TELEFONO: '3127984925/3001112233' }),
          fila('9002', { GRUPO: 602 }),
          fila(antiguoDoc, { 'SISBEN IV': 'B2', TELEFONO: 3127984925, NOMBRE1: 'JUAN', APELLIDO1: 'PEREZ' }),
          fila('9003', { ESTADO: 'RETIRADO' }),
          fila('9004', { GRADO_COD: 24, GRUPO: 2401, JORNADA: 'NOCTURNA' }),
          fila('9005'),
          fila('9005'),
          fila('9006', { TIPODOC: 'VISA' }),
          fila('9007', { CODIGO_DANE_SEDE: '999999999999', SEDE: 'Fantasma' }),
          fila('9008', { DANE: '999999999999' }),
          fila('9009', { ESTADO: 'SIN CONTINUIDAD' }),
          fila('9010', { JORNADA: 'COMPLETA' }),
          fila('9011', { CODIGO_DANE_SEDE: '123456789002', SEDE: 'Rural' }),
        ]),
        e.admin,
        {}
      );

      expect(lote.estado).toBe('SIMULADO');
      expect(lote.resumen.filas_otras_instituciones).toBe(1);
      expect(lote.resumen.filas_institucion).toBe(12);
      expect(lote.resumen.por_clasificacion).toEqual({ NUEVO: 2, ANTIGUO: 1, OMITIDA: 7, ERROR: 2 });
      expect(lote.resumen.por_motivo).toMatchObject({
        GRADO_NO_SOPORTADO: 1,
        TIPO_DOCUMENTO_NO_SOPORTADO: 1,
        SEDE_NO_REGISTRADA: 1,
        JORNADA_NO_SOPORTADA: 1,
        JORNADA_SIN_CONFIGURAR: 1,
        RETIRADO_EN_SIMAT: 1,
        ESTADO_NO_MATRICULADO: 1,
        DOCUMENTO_REPETIDO: 2,
      });
      expect(lote.resumen.sin_acudiente).toBe(3);
      expect(lote.grupos_por_crear).toHaveLength(1);
      expect(lote.grupos_por_crear[0]).toMatchObject({ codigo_simat: '602', estudiantes: 1 });
      expect(lote.resumen.advertencias.join(' ')).toMatch(/Fantasma.*no está registrada/);

      // Antes de confirmar se le dice al usuario lo que debe leer: el acudiente por crear, la información por revisar y la marca de los registros.
      const claves = lote.resumen.avisos_previos.map((a) => a.clave);
      expect(claves).toEqual(expect.arrayContaining(['ACUDIENTE', 'REVISION', 'MARCA', 'GRUPOS', 'SALUD', 'FOLIOS']));
      expect(lote.resumen.avisos_previos.find((a) => a.clave === 'ACUDIENTE')).toMatchObject({ cantidad: 3, severidad: 'warning' });
      expect(lote.resumen.avisos_previos.find((a) => a.clave === 'MARCA')!.titulo).toMatch(/Importado de SIMAT/);

      // No escribió nada de los estudiantes.
      expect(await User.countDocuments()).toBe(usuariosAntes);
      expect(await Enrollment.countDocuments()).toBe(matriculasAntes);
      expect(await User.exists({ numero_documento: '9001' })).toBeNull();
      expect(await Group.countDocuments({ nomenclatura: '602' })).toBe(0);
    });

    it('las filas de otras instituciones no se guardan en ninguna parte', async () => {
      const lote = await simularImportacion(csv([fila('9001'), fila('9008', { DANE: '999999999999', NOMBRE1: 'AJENO' })]), e.admin, {});
      expect(await ImportacionSimatFila.countDocuments({ lote_id: lote._id })).toBe(1);
      expect(await ImportacionSimatFila.exists({ documento: '9008' })).toBeNull();
    });

    it('las columnas del SRPA no llegan a ninguna parte', async () => {
      const lote = await simularImportacion(csv([fila('9001', { HA_ESTADO_VINCULADO_SRPA: 'SI-DATO-RESERVADO' })]), e.admin, {});
      const guardado = JSON.stringify(await ImportacionSimatFila.find({ lote_id: lote._id }).select('+datos').lean());
      expect(guardado).not.toMatch(/RESERVADO|SRPA/i);
    });

    it('los datos de la fila completa solo existen donde se van a procesar', async () => {
      const lote = await simularImportacion(csv([fila('9001'), fila('9004', { GRADO_COD: 24, GRUPO: 2401 })]), e.admin, {});
      const filas = await ImportacionSimatFila.find({ lote_id: lote._id }).select('+datos').lean();
      expect(filas.find((f) => f.documento === '9001')!.datos).not.toBeNull();
      expect(filas.find((f) => f.documento === '9004')!.datos).toBeNull();
    });

    it('lista las filas con filtro por clasificación y búsqueda', async () => {
      const lote = await simularImportacion(csv([fila('9001'), fila('9002', { ESTADO: 'RETIRADO' })]), e.admin, {});
      const omitidas = await listarFilasImportacion(String(lote._id), e.admin, { clasificacion: 'OMITIDA' });
      expect(omitidas.total).toBe(1);
      expect(omitidas.data[0]!.documento).toBe('9002');
      expect((await listarFilasImportacion(String(lote._id), e.admin, { search: 'Nombre9001' })).total).toBe(1);
    });
  });

  describe('conflictos: lo que NO se decide solo', () => {
    it('matrícula en otro grupo, documento de otra persona, posible duplicado y cambio de documento', async () => {
      const tercer = (await User.findById(e.tercerEstudiante._id))!;
      await StudentProfile.create({ user_id: tercer._id, fecha_nacimiento: new Date('2016-02-05T00:00:00Z'), grupo_etnico: 'NINGUNO' });
      await StudentProfile.create({ user_id: e.otroEstudiante._id, fecha_nacimiento: new Date('2016-02-05T00:00:00Z'), simat_per_id: '555' });
      const lote = await simularImportacion(
        csv([
          // Ya matriculado en 601 y SIMAT lo pone en un grupo (602) que no es el suyo.
          fila(e.estudiante.numero_documento, { GRUPO: 602 }),
          // El documento es de un docente.
          fila(e.docenteDeClase.numero_documento),
          // Mismo nombre y fecha de nacimiento que otro estudiante, con otro documento.
          fila('9100', { NOMBRE1: tercer.nombre, APELLIDO1: tercer.apellido, APELLIDO2: '' }),
          // El identificador de SIMAT ya está en Klassy con otro documento.
          fila('9101', { PER_ID: '555' }),
        ]),
        e.admin,
        {}
      );
      expect(lote.resumen.por_clasificacion).toEqual({ CONFLICTO: 4 });
      expect(lote.resumen.por_motivo).toEqual({ MATRICULA_EN_OTRO_GRUPO: 1, DOCUMENTO_DE_OTRO_ROL: 1, POSIBLE_DUPLICADO: 1, CAMBIO_DE_DOCUMENTO: 1 });
    });

    it('un retirado de Klassy no se reincorpora solo, salvo que se autorice, y entonces queda auditado', async () => {
      await StudentProfile.create({ user_id: e.tercerEstudiante._id, fecha_nacimiento: new Date('2016-02-05T00:00:00Z'), estado: 'RETIRADO' });
      await Enrollment.deleteMany({ student_id: e.tercerEstudiante._id });
      const archivo = () => csv([fila(e.tercerEstudiante.numero_documento)]);

      const sin = await simularImportacion(archivo(), e.admin, {});
      expect(sin.resumen.por_motivo).toEqual({ REINGRESO_SIN_AUTORIZAR: 1 });

      const con = await simularImportacion(archivo(), e.admin, { reincorporar_retirados: true });
      expect(con.resumen.por_clasificacion).toEqual({ ANTIGUO: 1 });
      await aplicar(con);
      expect((await StudentProfile.findOne({ user_id: e.tercerEstudiante._id }))!.estado).toBe('ACTIVO');
      expect(await Enrollment.countDocuments({ student_id: e.tercerEstudiante._id, origen: 'IMPORTACION_SIMAT' })).toBe(1);
    });

    it('si SIMAT dice retirado y Klassy lo tiene matriculado, es una diferencia por revisar (no se retira solo)', async () => {
      const lote = await simularImportacion(csv([fila(e.estudiante.numero_documento, { ESTADO: 'RETIRADO' })]), e.admin, {});
      expect(lote.resumen.por_clasificacion).toEqual({ CONFLICTO: 1 });
      expect(lote.resumen.por_motivo).toEqual({ RETIRADO_EN_SIMAT: 1 });
    });
  });

  describe('aplicar', () => {
    const archivo = () =>
      csv([
        fila('9001', { EPS: 'SURA', 'TIPO DE SANGRE': 'O +', 'SISBEN IV': 'a4', ETNIA: 'NEGRITUDES', DISCAPACIDAD: 'DISCAPACIDAD INTELECTUAL', TELEFONO: '3127984925/3001112233', CORREO: 'Familia@Correo.com', BARRIO: 'Nueva Estancia' }),
        fila('9002', { GRUPO: 602 }),
        fila(e.estudiante.numero_documento, { 'SISBEN IV': 'B2', TELEFONO: 3127984925, NOMBRE1: 'JUAN', APELLIDO1: 'PEREZ' }),
      ]);

    it('exige la contraseña y haber leído las advertencias; sin eso no escribe nada', async () => {
      const lote = await simularImportacion(archivo(), e.admin, {});
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: false }, e.admin)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/advertencias/) });
      await expect(aplicarImportacion(String(lote._id), { contrasena: 'otra', confirmo_advertencias: true }, e.admin)).rejects.toMatchObject({ statusCode: 401 });
      expect((await ImportacionSimat.findById(lote._id))!.estado).toBe('SIMULADO');
      expect(await User.exists({ numero_documento: '9001' })).toBeNull();
    });

    it('crea al estudiante nuevo marcado como importado y pendiente de revisión, con su matrícula', async () => {
      const lote = await simularImportacion(archivo(), e.admin, { autorizacion_datos_salud: true, dias_compromiso: 20 });
      await aplicar(lote);

      const usuario = (await User.findOne({ numero_documento: '9001' }))!;
      expect(usuario.roles).toEqual(['ESTUDIANTE']);
      expect(usuario.telefono).toBe('3127984925');
      expect(usuario.email).toBeUndefined();
      const perfil = (await StudentProfile.findOne({ user_id: usuario._id }))!;
      expect(perfil.sisben_grupo).toBe('A4');
      expect(perfil.grupo_etnico).toBe('AFRODESCENDIENTE');
      expect(perfil.etnia_detalle).toBe('NEGRITUDES');
      expect(perfil.eps).toBe('SURA');
      expect(perfil.rh).toBe('O+');
      expect(perfil.autorizacion_datos_sensibles.otorgada).toBe(true);
      expect(perfil.correo_contacto).toBe('familia@correo.com');
      expect(perfil.simat_per_id).toBe('79001');
      expect(perfil.tiene_discapacidad).toBe(true);
      expect(perfil.origen_simat?.revision).toBe('PENDIENTE');
      expect(String(perfil.origen_simat?.lote_id)).toBe(String(lote._id));
      expect(perfil.segundo_apellido).toBe('SEGUNDO');

      const matricula = (await Enrollment.findOne({ student_id: usuario._id }))!;
      expect(matricula.origen).toBe('IMPORTACION_SIMAT');
      expect(String(matricula.importacion_simat_id)).toBe(String(lote._id));
      expect(matricula.estado).toBe('MATRICULADO_CONDICIONAL');
      expect(matricula.tipo_ingreso).toBe('NUEVO');
      expect(matricula.folio_matricula).toBeTruthy();
      expect(matricula.fecha_matricula.toISOString()).toBe('2025-12-16T15:00:00.000Z');
      const dias = (matricula.fecha_limite_compromiso!.getTime() - Date.now()) / 86_400_000;
      expect(dias).toBeGreaterThan(19);
      expect(dias).toBeLessThan(20.1);
      expect(matricula.checklist.length).toBeGreaterThan(0);
      expect(matricula.checklist.every((c) => c.estado === 'PENDIENTE')).toBe(true);
      // La discapacidad llega sola a orientación (M16), como en una matrícula normal.
      expect(await SolicitudApoyo.countDocuments({ student_id: usuario._id })).toBe(1);
    });

    it('crea el grupo que no existía, con el código de SIMAT y cupo suficiente, y no toca el que ya existía', async () => {
      const lote = await simularImportacion(archivo(), e.admin, {});
      const existente = (await Group.findOne({ nomenclatura: '601' }))!;
      await aplicar(lote);
      const nuevo = (await Group.findOne({ nomenclatura: '602' }))!;
      expect(nuevo.codigo_simat).toBe('602');
      expect(nuevo.max_capacity).toBeGreaterThanOrEqual(40);
      expect(nuevo.cupos_ocupados).toBe(1);
      expect(String(nuevo.sede_id)).toBe(String(existente.sede_id));
      const intacto = (await Group.findById(existente._id))!;
      expect(intacto.max_capacity).toBe(existente.max_capacity);
      // El grupo que el colegio ya tenía queda enlazado con SIMAT.
      expect(intacto.codigo_simat).toBe('601');
      expect(intacto.cupos_ocupados).toBe(1);
    });

    it('los folios siguen el orden en que SIMAT registró las matrículas', async () => {
      const lote = await simularImportacion(
        csv([fila('9201', { FECHAINI: '2026-02-01 08:00:00' }), fila('9202', { FECHAINI: '2025-12-16 08:00:00' }), fila('9203', { FECHAINI: '2026-01-10 08:00:00' })]),
        e.admin,
        {}
      );
      await aplicar(lote);
      const folio = async (doc: string) => (await Enrollment.findOne({ student_id: (await User.findOne({ numero_documento: doc }))!._id }))!.numero_folio!;
      expect(await folio('9202')).toBeLessThan(await folio('9203'));
      expect(await folio('9203')).toBeLessThan(await folio('9201'));
    });

    it('al que ya estaba matriculado le actualiza los datos sin tocar su matrícula ni su nombre, e informa la diferencia de identidad', async () => {
      const matriculaAntes = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
      const nombreAntes = (await User.findById(e.estudiante._id))!.nombre;
      const lote = await simularImportacion(archivo(), e.admin, {});
      const antes = await resultadoDe(lote._id, e.estudiante.numero_documento);
      expect(antes.diferencias_identidad).toEqual(['nombres', 'apellidos']);
      expect(antes.campos_a_actualizar).toEqual(expect.arrayContaining(['Teléfono', 'Grupo SISBEN']));

      await aplicar(lote);
      const usuario = (await User.findById(e.estudiante._id))!;
      expect(usuario.telefono).toBe('3127984925');
      expect(usuario.nombre).toBe(nombreAntes);
      expect((await StudentProfile.findOne({ user_id: e.estudiante._id }))!.sisben_grupo).toBe('B2');
      expect(await Enrollment.countDocuments({ student_id: e.estudiante._id })).toBe(1);
      const matriculaDespues = (await Enrollment.findOne({ student_id: e.estudiante._id }))!;
      expect(matriculaDespues.folio_matricula).toBe(matriculaAntes.folio_matricula);
      expect(matriculaDespues.origen).toBeNull();
      const despues = await resultadoDe(lote._id, e.estudiante.numero_documento);
      expect(despues.resultado).toMatchObject({ estado: 'CORRECTA', matricula: 'CONFIRMADA' });
      expect(despues.diferencias_identidad).toEqual(['nombres', 'apellidos']);
    });

    it('sin la autorización de las familias no guarda EPS ni tipo de sangre, pero sí lo demás', async () => {
      const lote = await simularImportacion(archivo(), e.admin, {});
      await aplicar(lote);
      const perfil = (await StudentProfile.findOne({ user_id: (await User.findOne({ numero_documento: '9001' }))!._id }))!;
      expect(perfil.eps).toBeUndefined();
      expect(perfil.rh).toBeUndefined();
      expect(perfil.sisben_grupo).toBe('A4');
    });

    it('termina con el progreso completo y borra los datos personales de la simulación', async () => {
      const lote = await simularImportacion(archivo(), e.admin, {});
      await aplicar(lote);
      const final = (await ImportacionSimat.findById(lote._id))!;
      expect(final.estado).toBe('APLICADO');
      expect(final.progreso).toMatchObject({ total: 3, procesadas: 3, correctas: 3, con_error: 0 });
      expect(final.expira_en).toBeNull();
      const filas = await ImportacionSimatFila.find({ lote_id: lote._id }).select('+datos').lean();
      expect(filas.every((f) => f.datos === null)).toBe(true);
      expect(filas.every((f) => f.resultado !== null)).toBe(true);
    });

    it('una fila que falla no detiene a las demás y queda con su motivo', async () => {
      // El grupo 601 se cierra: SIMAT lo trae, pero no admite más matrículas.
      await Group.updateOne({ nomenclatura: '601' }, { $set: { max_capacity: 1, cupos_ocupados: 1 } });
      const lote = await simularImportacion(csv([fila('9001'), fila('9002', { GRUPO: 602 })]), e.admin, {});
      expect(lote.resumen.advertencias.join(' ')).toMatch(/no tiene cupo/);
      await aplicar(lote);
      expect((await resultadoDe(lote._id, '9001')).resultado).toMatchObject({ estado: 'ERROR', estudiante_creado: true });
      expect((await resultadoDe(lote._id, '9001')).resultado!.detalle).toMatch(/cupos disponibles/);
      expect((await resultadoDe(lote._id, '9002')).resultado).toMatchObject({ estado: 'CORRECTA', matricula: 'CREADA' });
      expect((await ImportacionSimat.findById(lote._id))!.progreso).toMatchObject({ correctas: 1, con_error: 1 });
      // Volver a subir el mismo archivo solo reintenta lo que faltó (el estudiante ya existe).
      await Group.updateOne({ nomenclatura: '601' }, { $set: { max_capacity: 40 } });
      const otra = await simularImportacion(csv([fila('9001'), fila('9002', { GRUPO: 602 })]), e.admin, {});
      expect(otra.resumen.por_clasificacion).toEqual({ ANTIGUO: 2 });
      await aplicar(otra);
      expect((await resultadoDe(otra._id, '9001')).resultado).toMatchObject({ estado: 'CORRECTA', matricula: 'CREADA' });
      expect(await Enrollment.countDocuments({ student_id: (await User.findOne({ numero_documento: '9001' }))!._id })).toBe(1);
    });

    it('formaliza la pre-matrícula de quien ya la tenía en ese grupo', async () => {
      const pre = await crearUsuario('ESTUDIANTE');
      const grupo = (await Group.findOne({ nomenclatura: '601' }))!;
      await Enrollment.create({ student_id: pre._id, group_id: grupo._id, academic_year_id: grupo.academic_year_id, tipo_ingreso: 'ANTIGUO', estado: 'PREINSCRITO' });
      await Group.updateOne({ _id: grupo._id }, { $inc: { cupos_ocupados: 1 } });
      const lote = await simularImportacion(csv([fila(pre.numero_documento)]), e.admin, {});
      expect(lote.resumen.matriculas_por_formalizar).toBe(1);
      await aplicar(lote);
      const matricula = (await Enrollment.findOne({ student_id: pre._id }))!;
      expect(matricula.estado).toBe('MATRICULADO_CONDICIONAL');
      expect(matricula.folio_matricula).toBeTruthy();
      expect(matricula.origen).toBe('IMPORTACION_SIMAT');
      expect(await Enrollment.countDocuments({ student_id: pre._id })).toBe(1);
    });

    it('no aplica mientras el libro de matrícula no esté confirmado', async () => {
      const foliatura = await obtenerConfiguracion();
      foliatura.confirmada = false;
      await foliatura.save();
      const lote = await simularImportacion(archivo(), e.admin, {});
      expect(lote.resumen.advertencias.join(' ')).toMatch(/libro y folio/);
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/libro y folio/) });
    });

    it('una segunda aplicación es imposible', async () => {
      const lote = await simularImportacion(archivo(), e.admin, {});
      await aplicar(lote);
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('volver a subir el mismo archivo', () => {
    it('no cambia nada: ni datos, ni matrículas, ni updatedAt', async () => {
      const filas = () => [fila('9001', { EPS: 'SURA', 'TIPO DE SANGRE': 'O +', 'SISBEN IV': 'a4', TELEFONO: '3127984925', CORREO: 'a@b.com' }), fila('9002', { GRUPO: 602 })];
      await aplicar(await simularImportacion(csv(filas()), e.admin, { autorizacion_datos_salud: true }));
      const usuario = (await User.findOne({ numero_documento: '9001' }))!;
      const perfilAntes = (await StudentProfile.findOne({ user_id: usuario._id }))!;
      const usuariosAntes = await User.countDocuments();
      const matriculasAntes = await Enrollment.countDocuments();

      const segunda = await simularImportacion(csv(filas()), e.admin, { autorizacion_datos_salud: true });
      expect(segunda.resumen.por_clasificacion).toEqual({ ANTIGUO: 2 });
      expect(segunda.resumen.con_cambios).toBe(0);
      expect(segunda.resumen.matriculas_confirmadas).toBe(2);
      expect(segunda.resumen.matriculas_por_crear).toBe(0);
      expect(segunda.grupos_por_crear).toHaveLength(0);
      await aplicar(segunda);

      expect(await User.countDocuments()).toBe(usuariosAntes);
      expect(await Enrollment.countDocuments()).toBe(matriculasAntes);
      const perfilDespues = (await StudentProfile.findOne({ user_id: usuario._id }))!;
      expect(perfilDespues.updatedAt.getTime()).toBe(perfilAntes.updatedAt.getTime());
      expect((await resultadoDe(segunda._id, '9001')).resultado).toMatchObject({ estado: 'CORRECTA', matricula: 'CONFIRMADA', campos_actualizados: [] });
    });
  });

  describe('permisos y alcance', () => {
    it('solo el administrador y la secretaría; la secretaría sin sedes no puede', async () => {
      await expect(simularImportacion(csv([fila('9001')]), e.docenteDeClase, {})).rejects.toMatchObject({ statusCode: 403 });
      await expect(simularImportacion(csv([fila('9001')]), e.coordAcademico, {})).rejects.toMatchObject({ statusCode: 403 });
      await expect(simularImportacion(csv([fila('9001')]), e.secretaria, {})).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/sedes/) });
    });

    it('la secretaría solo importa las sedes que tiene asignadas', async () => {
      const rural = (await Campus.findOne({ codigo_dane_sede: '123456789002' }))!;
      const secretariaRural = await crearUsuario('SECRETARIA', { sedes_ids: [rural._id] });
      const lote = await simularImportacion(csv([fila('9001')]), secretariaRural, {});
      expect(lote.resumen.por_motivo).toEqual({ SEDE_SIN_ACCESO: 1 });
      const principal = (await Campus.findOne({ codigo_dane_sede: SEDE }))!;
      const secretariaPrincipal = await crearUsuario('SECRETARIA', { sedes_ids: [principal._id] });
      expect((await simularImportacion(csv([fila('9001')]), secretariaPrincipal, {})).resumen.por_clasificacion).toEqual({ NUEVO: 1 });
    });

    it('una secretaría no ve ni aplica las importaciones de otra; el administrador sí las ve', async () => {
      const principal = (await Campus.findOne({ codigo_dane_sede: SEDE }))!;
      const una = await crearUsuario('SECRETARIA', { sedes_ids: [principal._id] });
      const otra = await crearUsuario('SECRETARIA', { sedes_ids: [principal._id] });
      const lote = await simularImportacion(csv([fila('9001')]), una, {});
      await expect(listarFilasImportacion(String(lote._id), otra, {})).rejects.toMatchObject({ statusCode: 404 });
      await expect(aplicarImportacion(String(lote._id), { contrasena: CLAVE, confirmo_advertencias: true }, otra)).rejects.toMatchObject({ statusCode: 404 });
      expect((await listarFilasImportacion(String(lote._id), e.admin, {})).total).toBe(1);
    });

    it('una simulación se puede descartar y desaparece con todas sus filas', async () => {
      const lote = await simularImportacion(csv([fila('9001')]), e.admin, {});
      await descartarImportacion(String(lote._id), e.admin);
      expect(await ImportacionSimat.countDocuments()).toBe(0);
      expect(await ImportacionSimatFila.countDocuments()).toBe(0);
    });
  });

  describe('el archivo', () => {
    it('rechaza lo que no es de esta institución, otros años, años cerrados y columnas faltantes', async () => {
      await expect(simularImportacion(csv([fila('9008', { DANE: '999999999999' })]), e.admin, {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no trae estudiantes de esta institución/) });
      await expect(simularImportacion(csv([fila('9001', { ANO: ANIO }), fila('9002', { ANO: ANIO - 1 })]), e.admin, {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/mezcla varios años/) });
      await expect(simularImportacion(csv([fila('9001', { ANO: 2001 })]), e.admin, {})).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/año lectivo 2001/) });
      await expect(simularImportacion({ nombre: 'x.csv', buffer: Buffer.from('DOC;ESTADO\n1;MATRICULADO') }, e.admin, {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/faltan estas columnas/) });
    });

    it('solo admite xlsx, csv y txt, y comprueba el contenido real', async () => {
      const buffer = csv([fila('9001')]).buffer;
      await expect(simularImportacion({ nombre: 'a.xls', buffer }, e.admin, {})).rejects.toMatchObject({ message: expect.stringMatching(/\.xlsx/) });
      await expect(simularImportacion({ nombre: 'a.pdf', buffer }, e.admin, {})).rejects.toMatchObject({ message: expect.stringMatching(/\.xlsx, \.csv o \.txt/) });
      await expect(simularImportacion({ nombre: 'a.xlsx', buffer }, e.admin, {})).rejects.toMatchObject({ message: expect.stringMatching(/no es un Excel/) });
      await expect(simularImportacion({ nombre: 'a.csv', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]) }, e.admin, {})).rejects.toMatchObject({ message: expect.stringMatching(/Excel \(\.xlsx\) con otra extensión/) });
      await expect(simularImportacion({ nombre: 'a.txt', buffer: Buffer.from([0x41, 0x00, 0x42, 0x00]) }, e.admin, {})).rejects.toMatchObject({ message: expect.stringMatching(/no parece/) });
    });

    it('lee un txt con barras verticales y tildes en Windows-1252', async () => {
      const texto = [ENCABEZADO.join('|'), ENCABEZADO.map((c) => String(fila('9001', { NOMBRE1: 'Sabín', JORNADA: 'MAÑANA' })[c] ?? '')).join('|')].join('\r\n');
      const lote = await simularImportacion({ nombre: 'simat.txt', buffer: Buffer.from(texto, 'latin1') }, e.admin, {});
      expect(lote.formato).toBe('txt');
      expect(lote.resumen.por_clasificacion).toEqual({ NUEVO: 1 });
      expect((await resultadoDe(lote._id, '9001')).nombre).toMatch(/SABÍN/);
    });

    it('lee un xlsx con varias hojas (la de datos no es la primera), números y fechas de Excel, y deja de lado otras instituciones', async () => {
      const libro = new ExcelJS.Workbook();
      const pivote = libro.addWorksheet('Hoja2');
      pivote.addRow(['ESTADO', 'MATRICULADO']);
      pivote.addRow(['Suma de CONTADOR', null, 'GRADO_COD']);
      const datos = libro.addWorksheet('Hoja1');
      datos.addRow(ENCABEZADO);
      const agregar = (f: Fila) =>
        datos.addRow(
          ENCABEZADO.map((c) => {
            const v = f[c];
            if (c === 'DOC' || c === 'DANE' || c === 'CODIGO_DANE_SEDE' || c === 'GRADO_COD' || c === 'GRUPO' || c === 'ANO') return Number(v);
            if (c === 'FECHA_NACIMIENTO') return 42405;
            if (c === 'FECHAINI') return 46009.84545138889;
            return v ?? null;
          })
        );
      agregar(fila('1116379795', { 'SISBEN IV': 'A4' }));
      agregar(fila('9008', { DANE: '999999999999' }));
      const buffer = Buffer.from(await libro.xlsx.writeBuffer());
      const lote = await simularImportacion({ nombre: 'SIMAT.xlsx', buffer }, e.admin, {});
      expect(lote.formato).toBe('xlsx');
      expect(lote.resumen).toMatchObject({ filas_otras_instituciones: 1, filas_institucion: 1 });
      expect(lote.resumen.por_clasificacion).toEqual({ NUEVO: 1 });
      await aplicar(lote);
      const usuario = (await User.findOne({ numero_documento: '1116379795' }))!;
      const perfil = (await StudentProfile.findOne({ user_id: usuario._id }))!;
      expect(perfil.fecha_nacimiento.toISOString().slice(0, 10)).toBe('2016-02-05');
      expect(perfil.sisben_grupo).toBe('A4');
    });

    it('rechaza un xlsx con fórmulas', async () => {
      const libro = new ExcelJS.Workbook();
      const datos = libro.addWorksheet('Hoja1');
      datos.addRow(ENCABEZADO);
      const valores: Array<string | number | { formula: string }> = ENCABEZADO.map((c) => String(fila('9001')[c] ?? ''));
      valores[ENCABEZADO.indexOf('DOC')] = { formula: '1+1' };
      datos.addRow(valores);
      const buffer = Buffer.from(await libro.xlsx.writeBuffer());
      await expect(simularImportacion({ nombre: 'f.xlsx', buffer }, e.admin, {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/fórmula/) });
    });
  });

  describe('revisión de lo importado', () => {
    it('quien llegó de SIMAT sale en el listado como importado y pendiente, y no se da por revisado sin un acudiente', async () => {
      await aplicar(await simularImportacion(csv([fila('9001'), fila('9002')]), e.admin, {}));
      const importados = await listarEstudiantes({ importados_simat: true }, 'ADMIN');
      expect(importados.total).toBe(2);
      expect((importados.data[0] as { perfil: { origen_simat: { revision: string } } }).perfil.origen_simat.revision).toBe('PENDIENTE');
      expect((await listarEstudiantes({ revision_pendiente: true, sin_acudiente: true }, 'ADMIN')).total).toBe(2);
      // Quienes no vinieron de SIMAT no aparecen en el filtro.
      expect((await listarEstudiantes({ importados_simat: true, search: 'Nombre1' }, 'ADMIN')).data.every((d) => /9/.test((d as { numero_documento: string }).numero_documento))).toBe(true);

      const uno = (await User.findOne({ numero_documento: '9001' }))!;
      await expect(marcarEstudianteRevisado(String(uno._id), e.admin)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/acudiente/) });

      const acudiente = await Guardian.create({ tipo_documento: 'CC', numero_documento: '555', nombre: 'Madre', apellido: 'Uno', telefono_principal: '3001112233' });
      await StudentGuardian.create({ student_id: uno._id, guardian_id: acudiente._id, parentesco: 'MADRE', es_principal: true });
      const revisado = await marcarEstudianteRevisado(String(uno._id), e.secretaria);
      expect(revisado.origen_simat?.revision).toBe('REVISADA');
      expect(String(revisado.origen_simat?.revisada_por)).toBe(String(e.secretaria._id));
      expect((await listarEstudiantes({ revision_pendiente: true }, 'ADMIN')).total).toBe(1);
      expect((await listarEstudiantes({ revision_pendiente: true, sin_acudiente: true }, 'ADMIN')).total).toBe(1);
    });

    it('un estudiante que no vino de SIMAT no tiene revisión que dar', async () => {
      await expect(marcarEstudianteRevisado(String(e.estudiante._id), e.admin)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
