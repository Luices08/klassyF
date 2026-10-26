import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Enrollment from '../../src/models/enrollment.model';
import Group from '../../src/models/group.model';
import RequisitoDocumental from '../../src/models/requisitoDocumental.model';
import { UserDocument } from '../../src/models/user.model';
import { createEnrollment, listarDocumentosPrevistos } from '../../src/services/enrollment.service';
import { adaptarDocumentosDeAntiguos } from '../../src/services/migracionDocumentosAntiguos.service';
import { revisarPazYSalvo } from '../../src/services/pazYSalvo.service';
import { asegurarCatalogoSembrado } from '../../src/services/requisitoDocumental.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);
const DOCUMENTOS_DEL_COLEGIO = ['DOCUMENTO_IDENTIDAD', 'FOTO', 'CARNE_EPS', 'DOCUMENTO_ACUDIENTE', 'DIAGNOSTICO_MEDICO_INCLUSION'];

// M04: un antiguo ya está en el sistema, así que cada año solo firma el libro; el colegio no le vuelve a pedir lo que ya tiene.
describe('M04: documentos de antiguos y repitentes', () => {
  let e: Escenario;
  let anioActual: string;
  let anioSiguiente: string;
  let grupoSiguiente: string;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    const actual = (await AcademicYear.findOne())!;
    anioActual = String(actual._id);
    const grupoActual = (await Group.findOne())!;
    const siguiente = await AcademicYear.create({
      institucion_id: actual.institucion_id,
      year: actual.year + 1,
      nombre: `Año ${actual.year + 1}`,
      calendario: 'A',
      fecha_inicio: new Date(Date.UTC(actual.year + 1, 0, 1)),
      fecha_fin: new Date(Date.UTC(actual.year + 1, 11, 31)),
      estado: 'PLANIFICACION',
      // Los periodos del año siguiente caen un año después de los del actual.
      periodos: actual.periodos.map((p) =>
        Object.fromEntries(Object.entries(p.toObject()).map(([clave, valor]) => [clave, valor instanceof Date ? new Date(Date.UTC(valor.getUTCFullYear() + 1, valor.getUTCMonth(), valor.getUTCDate())) : valor]))
      ),
    });
    anioSiguiente = String(siguiente._id);
    grupoSiguiente = String(
      (await Group.create({ sede_id: grupoActual.sede_id, academic_year_id: siguiente._id, grade_id: grupoActual.grade_id, jornada_id: grupoActual.jornada_id, nomenclatura: '701', max_capacity: 40 }))._id
    );
  }, 120_000);

  const previstos = async (tipo: 'NUEVO' | 'ANTIGUO' | 'REPITENTE' | 'TRASLADO', studentId?: string) =>
    listarDocumentosPrevistos({ group_id: grupoSiguiente, tipo_ingreso: tipo, student_id: studentId });
  const matricularAntiguo = (alumno: UserDocument, extra: Record<string, unknown> = {}) =>
    createEnrollment({ student_id: alumno._id, group_id: grupoSiguiente, academic_year_id: anioSiguiente, tipo_ingreso: 'ANTIGUO', documentos_entregados: [], ...extra }, como(e.secretaria));

  describe('al matricularlo', () => {
    it('solo se le verifica el paz y salvo del año anterior; identidad, foto, EPS y acudiente ya no se piden', async () => {
      const claves = (await previstos('ANTIGUO')).map((d) => d.tipo_documento);
      expect(claves).toEqual(['PAZ_Y_SALVO_ANIO_ANTERIOR']);
      expect((await previstos('REPITENTE')).map((d) => d.tipo_documento)).toEqual(['PAZ_Y_SALVO_ANIO_ANTERIOR']);
    });

    it('con el paz y salvo del año anterior confirmado nace definitiva, sin acta, fecha ni documentos por entregar', async () => {
      await revisarPazYSalvo(como(e.secretaria), String(e.estudiante._id), anioActual, { estado: 'CONFIRMADO' });

      const lista = await previstos('ANTIGUO', String(e.estudiante._id));
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ tipo_documento: 'PAZ_Y_SALVO_ANIO_ANTERIOR', ya_cubierto: true });

      const m = await matricularAntiguo(e.estudiante);

      expect(m.estado).toBe('MATRICULADO_DEFINITIVO');
      expect(m.fecha_limite_compromiso).toBeNull();
      expect(m.checklist).toHaveLength(1);
      // Lo aprobó el sistema: no se vio en físico ni espera archivo.
      expect(m.checklist[0]).toMatchObject({ estado: 'APROBADO', archivo_path: null, fecha_verificacion_fisica: null });
      expect(m.folio_matricula).toEqual(expect.any(String));
    });

    it('sin el paz y salvo confirmado queda condicional (lo único pendiente es ese paz y salvo) y exige la fecha del acta', async () => {
      await expect(matricularAntiguo(e.otroEstudiante)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/fecha límite/i) });

      const m = await matricularAntiguo(e.otroEstudiante, { fecha_limite_compromiso: PLAZO });

      expect(m.estado).toBe('MATRICULADO_CONDICIONAL');
      expect(m.checklist.map((c) => [c.tipo_documento, c.estado])).toEqual([['PAZ_Y_SALVO_ANIO_ANTERIOR', 'PENDIENTE']]);
    });

    it('quien llega nuevo o por traslado entrega todo, como siempre', async () => {
      for (const tipo of ['NUEVO', 'TRASLADO'] as const) {
        const claves = (await previstos(tipo)).map((d) => d.tipo_documento);
        expect(claves).toEqual(expect.arrayContaining(['DOCUMENTO_IDENTIDAD', 'FOTO', 'CARNE_EPS', 'DOCUMENTO_ACUDIENTE']));
      }
    });
  });

  describe('adaptar un colegio que ya tenía el catálogo sembrado (migrate:documentos-antiguos)', () => {
    const claveDe = (c: { tipo_documento: string }) => c.tipo_documento;
    const tiposDe = async (clave: string) => (await RequisitoDocumental.findOne({ clave }))!.tipos_ingreso;

    /** Un catálogo «de antes»: los cinco documentos se piden a todos, salvo la foto, que el colegio dejó solo para ingreso nuevo. */
    async function catalogoDeAntes() {
      await asegurarCatalogoSembrado();
      await RequisitoDocumental.updateMany({ clave: { $in: DOCUMENTOS_DEL_COLEGIO } }, { tipos_ingreso: [] });
      await RequisitoDocumental.updateOne({ clave: 'FOTO' }, { tipos_ingreso: ['NUEVO'] });
    }

    const item = (tipo: string, estado: string, extra: Record<string, unknown> = {}) => ({ tipo_documento: tipo, obligatorio: true, estado, archivo_path: null, comentario: null, fecha_carga: null, revisado_por: null, ...extra });
    let contadorFolio = 0;
    async function matricula(tipo: string, estado: string, checklist: ReturnType<typeof item>[]) {
      const alumno = await crearUsuario('ESTUDIANTE');
      contadorFolio += 1;
      return Enrollment.create({
        student_id: alumno._id,
        group_id: grupoSiguiente,
        academic_year_id: anioSiguiente,
        tipo_ingreso: tipo,
        estado,
        checklist,
        ...(estado === 'PREINSCRITO' ? {} : { folio_matricula: `PRUEBA-${contadorFolio}`, numero_libro: 900, numero_folio: contadorFolio, fecha_limite_compromiso: PLAZO }),
      });
    }

    it('simular no cambia nada y dice qué haría', async () => {
      await catalogoDeAntes();

      const r = await adaptarDocumentosDeAntiguos({ aplicar: false, limpiar_matriculas: true });

      expect(r.aplicado).toBe(false);
      expect(Object.fromEntries(r.requisitos.map((x) => [x.clave, x.accion]))).toEqual({
        DOCUMENTO_IDENTIDAD: 'ACTUALIZAR',
        FOTO: 'PERSONALIZADO',
        CARNE_EPS: 'ACTUALIZAR',
        DOCUMENTO_ACUDIENTE: 'ACTUALIZAR',
        DIAGNOSTICO_MEDICO_INCLUSION: 'ACTUALIZAR',
      });
      expect(await tiposDe('DOCUMENTO_IDENTIDAD')).toEqual([]);
    });

    it('aplicar restringe lo que el colegio no había personalizado y respeta lo personalizado', async () => {
      await catalogoDeAntes();

      await adaptarDocumentosDeAntiguos({ aplicar: true, limpiar_matriculas: false });

      expect([...(await tiposDe('DOCUMENTO_IDENTIDAD'))].sort()).toEqual(['NUEVO', 'TRASLADO']);
      expect([...(await tiposDe('CARNE_EPS'))].sort()).toEqual(['NUEVO', 'TRASLADO']);
      expect(await tiposDe('FOTO')).toEqual(['NUEVO']);
      expect((await previstos('ANTIGUO')).map(claveDe)).toEqual(['PAZ_Y_SALVO_ANIO_ANTERIOR']);
    });

    it('sin --limpiar-matriculas ninguna matrícula se toca', async () => {
      await catalogoDeAntes();
      const m = await matricula('ANTIGUO', 'PREINSCRITO', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('PAZ_Y_SALVO_ANIO_ANTERIOR', 'APROBADO')]);

      const r = await adaptarDocumentosDeAntiguos({ aplicar: true, limpiar_matriculas: false });

      expect(r.matriculas).toEqual({ con_pendientes: 0, items_retirados: 0, pasan_a_definitiva: 0 });
      expect((await Enrollment.findById(m._id))!.checklist).toHaveLength(2);
    });

    it('limpiar retira solo lo pendiente y sin archivo de antiguos en trámite, y pasa a definitiva a quien con eso queda completo', async () => {
      await catalogoDeAntes();
      const paz = item('PAZ_Y_SALVO_ANIO_ANTERIOR', 'APROBADO');
      const preinscrita = await matricula('ANTIGUO', 'PREINSCRITO', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('CARNE_EPS', 'PENDIENTE'), paz]);
      const conSubido = await matricula('REPITENTE', 'MATRICULADO_CONDICIONAL', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('FOTO', 'PENDIENTE'), item('CARNE_EPS', 'CARGADO', { archivo_path: 'uploads/eps.pdf' }), paz]);
      const quedaCompleta = await matricula('ANTIGUO', 'MATRICULADO_CONDICIONAL', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('DOCUMENTO_ACUDIENTE', 'PENDIENTE'), paz]);
      const nuevo = await matricula('NUEVO', 'PREINSCRITO', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('FOTO', 'PENDIENTE')]);

      const r = await adaptarDocumentosDeAntiguos({ aplicar: true, limpiar_matriculas: true });

      expect(r.matriculas).toEqual({ con_pendientes: 3, items_retirados: 5, pasan_a_definitiva: 1 });
      const tipos = async (m: { _id: unknown }) => (await Enrollment.findById(m._id))!.checklist.map(claveDe).sort();

      expect(await tipos(preinscrita)).toEqual(['PAZ_Y_SALVO_ANIO_ANTERIOR']);
      // Lo subido nunca se retira y la foto (personalizada por el colegio) se sigue pidiendo.
      expect(await tipos(conSubido)).toEqual(['CARNE_EPS', 'FOTO', 'PAZ_Y_SALVO_ANIO_ANTERIOR']);
      expect((await Enrollment.findById(conSubido._id))!.estado).toBe('MATRICULADO_CONDICIONAL');
      const definitiva = (await Enrollment.findById(quedaCompleta._id))!;
      expect(definitiva).toMatchObject({ estado: 'MATRICULADO_DEFINITIVO', fecha_limite_compromiso: null });
      // El ingreso nuevo no se toca.
      expect(await tipos(nuevo)).toEqual(['DOCUMENTO_IDENTIDAD', 'FOTO']);
    });

    it('repetirla no cambia nada más', async () => {
      await catalogoDeAntes();
      await matricula('ANTIGUO', 'PREINSCRITO', [item('DOCUMENTO_IDENTIDAD', 'PENDIENTE'), item('PAZ_Y_SALVO_ANIO_ANTERIOR', 'APROBADO')]);
      await adaptarDocumentosDeAntiguos({ aplicar: true, limpiar_matriculas: true });

      const otra = await adaptarDocumentosDeAntiguos({ aplicar: true, limpiar_matriculas: true });

      expect(otra.matriculas).toEqual({ con_pendientes: 0, items_retirados: 0, pasan_a_definitiva: 0 });
      expect(otra.requisitos.filter((x) => x.accion === 'ACTUALIZAR')).toHaveLength(0);
    });
  });
});
