import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Enrollment from '../../src/models/enrollment.model';
import Grade from '../../src/models/grade.model';
import Group from '../../src/models/group.model';
import { UserDocument } from '../../src/models/user.model';
import { agregarDocumentoChecklist, cargarDocumento, createEnrollment, listarDocumentosPorRevisar } from '../../src/services/enrollment.service';
import {
  actualizarRequisito,
  asegurarCatalogoSembrado,
  cambiarEstadoRequisito,
  crearRequisito,
  eliminarRequisito,
  listarRequisitos,
} from '../../src/services/requisitoDocumental.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, Escenario } from './escenario';

const como = (u: UserDocument) => ({ id: u._id, rol: u.rol });
const PLAZO = new Date(Date.now() + 15 * 86_400_000);

// M04: catálogo configurable de documentos de matrícula y la bandeja de revisión según quién subió el archivo.
describe('M04: requisitos documentales configurables', () => {
  let e: Escenario;
  let anio: string;
  let grupo: string;
  let numeroGrado: number;

  beforeAll(async () => {
    await iniciarBaseDeDatos();
  }, 600_000);
  afterAll(detenerBaseDeDatos);
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    e = await armarEscenario();
    anio = String((await AcademicYear.findOne())!._id);
    const g = (await Group.findOne())!;
    grupo = String(g._id);
    numeroGrado = (await Grade.findById(g.grade_id))!.numero;
  });

  const matricular = (u: UserDocument) =>
    createEnrollment({ student_id: u._id, group_id: grupo, academic_year_id: anio, tipo_ingreso: 'NUEVO', fecha_limite_compromiso: PLAZO }, como(e.secretaria));
  const checklistDe = async (id: unknown) => (await Enrollment.findById(id))!.checklist;

  it('el catálogo se siembra una sola vez y lo que el colegio elimina no vuelve', async () => {
    await asegurarCatalogoSembrado();
    const antes = await listarRequisitos();
    expect(antes.length).toBeGreaterThanOrEqual(15);
    const foto = antes.find((r) => r.clave === 'FOTO')!;
    await eliminarRequisito(String(foto._id), e.admin);
    expect(await asegurarCatalogoSembrado()).toBe(false);
    expect((await listarRequisitos()).some((r) => r.clave === 'FOTO')).toBe(false);
  });

  it('una matrícula nueva trae el checklist del catálogo, con la copia de nombre, indicación y categoría', async () => {
    const m = await matricular(e.estudiante);
    const item = (await checklistDe(m._id)).find((c) => c.tipo_documento === 'DOCUMENTO_IDENTIDAD')!;
    expect(item.nombre_personalizado).toMatch(/identidad/i);
    expect(item.indicacion).toBeTruthy();
    expect(item.categoria).toBe('IDENTIFICACION_SALUD');
  });

  it('un documento nuevo del colegio se pide al grado indicado y deja de pedirse al desactivarlo; las matrículas ya creadas no cambian', async () => {
    const anterior = await matricular(e.estudiante);
    const requisito = await crearRequisito(
      { nombre: 'Carta de buena conducta', categoria: 'INSTITUCIONAL', obligatorio: false, niveles: [], grados_numeros: [numeroGrado], tipos_ingreso: ['NUEVO'], condicion_especial: 'NINGUNA' },
      e.admin
    );
    expect(requisito.clave).toBe('CARTA_DE_BUENA_CONDUCTA');
    const nueva = await matricular(e.otroEstudiante);
    const item = (await checklistDe(nueva._id)).find((c) => c.tipo_documento === requisito.clave)!;
    expect(item.obligatorio).toBe(false);
    expect((await checklistDe(anterior._id)).some((c) => c.tipo_documento === requisito.clave)).toBe(false);

    await cambiarEstadoRequisito(String(requisito._id), 'inactivo', e.admin);
    const otra = await matricular(e.tercerEstudiante);
    expect((await checklistDe(otra._id)).some((c) => c.tipo_documento === requisito.clave)).toBe(false);
  });

  it('un documento ya usado en matrículas no se elimina (se desactiva) y editarlo no altera lo copiado', async () => {
    const m = await matricular(e.estudiante);
    const id = String((await listarRequisitos()).find((r) => r.clave === 'FOTO')!._id);
    await expect(eliminarRequisito(id, e.admin)).rejects.toMatchObject({ statusCode: 409 });
    await actualizarRequisito(id, { nombre: 'Fotografía', categoria: 'IDENTIFICACION_SALUD', obligatorio: true, niveles: [], grados_numeros: [], tipos_ingreso: [], condicion_especial: 'NINGUNA' }, e.admin);
    expect((await checklistDe(m._id)).find((c) => c.tipo_documento === 'FOTO')!.nombre_personalizado).toMatch(/Foto reciente/);
  });

  it('agregar documentos adicionales da claves distintas (antes todos eran el mismo OTRO_DOCUMENTO)', async () => {
    const m = await matricular(e.estudiante);
    await agregarDocumentoChecklist(String(m._id), { nombre_personalizado: 'Carta A' }, { id: e.secretaria._id });
    await agregarDocumentoChecklist(String(m._id), { tipo_documento: 'OTRO_DOCUMENTO', nombre_personalizado: 'Carta B' }, { id: e.secretaria._id });
    const otros = (await checklistDe(m._id)).filter((c) => c.tipo_documento.startsWith('OTRO_'));
    expect(otros).toHaveLength(2);
    expect(new Set(otros.map((c) => c.tipo_documento)).size).toBe(2);
    await expect(agregarDocumentoChecklist(String(m._id), { tipo_documento: 'DOCUMENTO_IDENTIDAD' }, { id: e.secretaria._id })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lo que sube la familia queda por revisar; lo que sube el personal con «ya verifiqué» queda aprobado y no entra a la bandeja', async () => {
    const m = await matricular(e.estudiante);
    await cargarDocumento(String(m._id), 'DOCUMENTO_IDENTIDAD', 'ruta/a.pdf', { id: null, tipo: 'FAMILIA' });
    await cargarDocumento(String(m._id), 'FOTO', 'ruta/b.pdf', { id: e.secretaria._id, tipo: 'PERSONAL', aprobar: true });
    await cargarDocumento(String(m._id), 'CARNE_EPS', 'ruta/c.pdf', { id: e.secretaria._id, tipo: 'PERSONAL', aprobar: false });

    const lista = await checklistDe(m._id);
    expect(lista.find((c) => c.tipo_documento === 'DOCUMENTO_IDENTIDAD')).toMatchObject({ estado: 'CARGADO', cargado_por_tipo: 'FAMILIA' });
    expect(lista.find((c) => c.tipo_documento === 'FOTO')).toMatchObject({ estado: 'APROBADO', cargado_por_tipo: 'PERSONAL' });
    expect(lista.find((c) => c.tipo_documento === 'CARNE_EPS')!.estado).toBe('CARGADO');

    const bandeja = await listarDocumentosPorRevisar({ academic_year_id: anio });
    expect(bandeja.data.map((f) => f.tipo_documento).sort()).toEqual(['CARNE_EPS', 'DOCUMENTO_IDENTIDAD']);
    const soloFamilia = await listarDocumentosPorRevisar({ academic_year_id: anio, subido_por: 'FAMILIA' });
    expect(soloFamilia.data.map((f) => f.tipo_documento)).toEqual(['DOCUMENTO_IDENTIDAD']);
  });
});
