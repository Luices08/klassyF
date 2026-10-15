import fs from 'fs/promises';
import path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import Group from '../../src/models/group.model';
import LiderArea from '../../src/models/liderArea.model';
import PlanArea from '../../src/models/planArea.model';
import PlanAula from '../../src/models/planAula.model';
import DocumentoReferencia from '../../src/models/documentoReferencia.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import { hoyColombia } from '../../src/services/attendance.service';
import { generateToken } from '../../src/services/token.service';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const DIA_MS = 86_400_000;
const dia = (offset: number) => new Date(hoyColombia().getTime() + offset * DIA_MS).toISOString().slice(0, 10);

interface Respuesta {
  estado: number;
  cuerpo: { success: boolean; message?: string; data?: any; count?: number; details?: any };
}

// M07 contra la capa HTTP real: rutas, validadores Joi, permisos por rol y la subida multipart de PDF.
describe('M07: planeación documental (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let lider: UserDocument;
  /** El líder de área designado en la prueba (lo que cubre es lo que carga el plan de área). */
  let liderAreaId = '';
  let gradoId: string;
  let base: string;
  let cerrar: () => Promise<void>;

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
    await fs.rm(path.join(UPLOADS_ROOT, 'planeacion'), { recursive: true, force: true });
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([PlanArea.syncIndexes(), PlanAula.syncIndexes(), DocumentoReferencia.syncIndexes(), LiderArea.syncIndexes()]);
    liderAreaId = '';
    e = await armarEscenario();
    n = await prepararNotas(e);
    lider = await crearUsuario('DOCENTE');
    gradoId = String((await Group.findById(n.grupoId))!.grade_id);
  }, 60_000);

  const encabezado = (usuario: UserDocument | null): Record<string, string> => (usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {});

  const json = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown): Promise<Respuesta> => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...encabezado(usuario) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: await respuesta.json() };
  };

  /** Multipart como lo manda el navegador: el PDF en `file` y cada dato como campo de texto (una lista repite el campo). */
  const subir = async (
    metodo: string,
    ruta: string,
    usuario: UserDocument,
    campos: Record<string, string | string[]>,
    archivo: { contenido: BlobPart; nombre: string; tipo: string } | null
  ): Promise<Respuesta> => {
    const formulario = new FormData();
    if (archivo) formulario.append('file', new Blob([archivo.contenido], { type: archivo.tipo }), archivo.nombre);
    for (const [clave, valor] of Object.entries(campos)) for (const v of Array.isArray(valor) ? valor : [valor]) formulario.append(clave, v);
    const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers: encabezado(usuario), body: formulario });
    return { estado: respuesta.status, cuerpo: await respuesta.json() };
  };

  const pdf = (nombre = 'plan.pdf', contenido = '%PDF-1.4 plan de prueba') => ({ contenido, nombre, tipo: 'application/pdf' });

  const camposArea = (extra: Record<string, string> = {}) => ({
    academic_year_id: n.anioId,
    lider_area_id: liderAreaId,
    titulo: 'Plan de área de Matemáticas',
    descripcion: 'Secuencia anual.',
    ...extra,
  });
  const camposAula = (extra: Record<string, string> = {}) => ({
    academic_year_id: n.anioId,
    periodo_numero: '2',
    subject_id: n.materiaId,
    grade_id: gradoId,
    titulo: 'Plan de aula del periodo 2',
    descripcion: 'Unidades y evaluación.',
    ...extra,
  });

  /** El líder de toda el área (alcance por defecto: todos los niveles, jornadas y sedes), como lo designa coordinación. */
  const designarLider = async (quien: UserDocument = e.coordAcademico) => {
    const respuesta = await json('POST', '/planeacion/lideres-area', quien, { area_id: n.areaId, docente_id: String(lider._id) });
    if (respuesta.estado === 201) liderAreaId = respuesta.cuerpo.data._id as string;
    return respuesta;
  };
  const aprobarPlanDeArea = async () => {
    await designarLider();
    const creado = await subir('POST', '/planeacion/planes-area', lider, camposArea(), pdf('area.pdf'));
    expect(creado.estado).toBe(201);
    const aprobado = await json('PATCH', `/planeacion/planes-area/${creado.cuerpo.data._id}/revision`, e.coordAcademico, { decision: 'APROBADO' });
    expect(aprobado.estado).toBe(200);
    return creado.cuerpo.data._id as string;
  };
  const abrirEntregaDelPeriodo2 = () => json('PUT', `/planeacion/ventanas/${n.anioId}/periodos/2`, e.coordAcademico, { fecha_apertura: dia(-5), fecha_limite: dia(5) });

  it('cada ruta exige sesión y el rol que le corresponde', async () => {
    const id = '0123456789abcdef01234567';
    expect((await json('GET', '/planeacion/documentos-referencia', null)).estado).toBe(401);
    expect((await json('GET', `/planeacion/planes-area?academic_year_id=${n.anioId}`, null)).estado).toBe(401);

    // Los documentos de apoyo los consultan coordinación, ADMIN y docentes; los administran coordinación y ADMIN.
    for (const permitido of [e.docenteDeClase, e.coordAcademico, e.admin]) expect((await json('GET', '/planeacion/documentos-referencia', permitido)).estado).toBe(200);
    for (const ajeno of [e.estudiante, e.secretaria, e.orientador]) expect((await json('GET', '/planeacion/documentos-referencia', ajeno)).estado).toBe(403);
    expect((await subir('POST', '/planeacion/documentos-referencia', e.docenteDeClase, { titulo: 'x', area_id: n.areaId, grados_ids: gradoId }, pdf())).estado).toBe(403);
    expect((await json('DELETE', `/planeacion/documentos-referencia/${id}`, e.docenteDeClase)).estado).toBe(403);

    // Designar al líder: coordinación y ADMIN, no el docente ni otros roles.
    const datosLider = { area_id: n.areaId, docente_id: String(lider._id) };
    for (const ajeno of [e.docenteDeClase, e.estudiante, e.secretaria]) expect((await json('POST', '/planeacion/lideres-area', ajeno, datosLider)).estado).toBe(403);
    expect((await json('GET', `/planeacion/lideres-area?area_id=${n.areaId}`, e.docenteDeClase)).estado).toBe(403);
    expect((await designarLider(e.admin)).estado).toBe(201);
    expect((await json('GET', `/planeacion/lideres-area?area_id=${n.areaId}`, e.coordAcademico)).estado).toBe(200);
    expect((await json('PATCH', `/planeacion/lideres-area/${liderAreaId}`, e.docenteDeClase, { jornada: 'DIURNA' })).estado).toBe(403);
    expect((await json('DELETE', `/planeacion/lideres-area/${liderAreaId}`, e.docenteDeClase)).estado).toBe(403);

    // La ventana de entrega: la ven docentes, coordinación y ADMIN; la configuran coordinación y ADMIN.
    const ruta = `/planeacion/ventanas/${n.anioId}/periodos/2`;
    expect((await json('PUT', ruta, e.docenteDeClase, { fecha_limite: dia(5) })).estado).toBe(403);
    expect((await json('PUT', ruta, e.estudiante, { fecha_limite: dia(5) })).estado).toBe(403);
    for (const permitido of [e.coordAcademico, e.admin]) expect((await json('PUT', ruta, permitido, { fecha_limite: dia(5) })).estado).toBe(200);
    expect((await json('GET', `/planeacion/ventanas?academic_year_id=${n.anioId}`, e.docenteDeClase)).estado).toBe(200);
    expect((await json('GET', `/planeacion/ventanas?academic_year_id=${n.anioId}`, e.estudiante)).estado).toBe(403);

    // Plan de área: lo radica solo un docente (y solo el líder, lo comprueba el servicio); coordinación revisa, el ADMIN reabre.
    expect((await subir('POST', '/planeacion/planes-area', e.coordAcademico, camposArea(), pdf())).estado).toBe(403);
    expect((await subir('POST', '/planeacion/planes-area', e.admin, camposArea(), pdf())).estado).toBe(403);
    expect((await subir('POST', '/planeacion/planes-area', e.docenteDeClase, camposArea(), pdf())).estado).toBe(403);
    expect((await json('PATCH', `/planeacion/planes-area/${id}/revision`, e.docenteDeClase, { decision: 'APROBADO' })).estado).toBe(403);
    expect((await json('PATCH', `/planeacion/planes-area/${id}/reabrir`, e.coordAcademico, { motivo: 'x' })).estado).toBe(403);

    // Plan de aula: radica un docente; la bandeja es de coordinación; las tarjetas, del docente.
    expect((await subir('POST', '/planeacion/planes-aula', e.coordAcademico, camposAula(), pdf())).estado).toBe(403);
    expect((await json('GET', `/planeacion/planes-aula?academic_year_id=${n.anioId}`, e.docenteDeClase)).estado).toBe(403);
    expect((await json('GET', `/planeacion/planes-aula/mios?academic_year_id=${n.anioId}`, e.coordAcademico)).estado).toBe(403);
    expect((await json('GET', `/planeacion/planes-aula/mios?academic_year_id=${n.anioId}`, e.estudiante)).estado).toBe(403);
    expect((await json('POST', '/planeacion/planes-aula/adoptar', e.coordAcademico, { plan_origen_id: id })).estado).toBe(403);
    expect((await json('PATCH', `/planeacion/planes-aula/${id}/reabrir`, e.coordAcademico, { motivo: 'x' })).estado).toBe(403);
  });

  it('valida la forma de lo que llega, con mensajes que el usuario entiende', async () => {
    await designarLider();
    expect((await subir('POST', '/planeacion/planes-area', lider, { academic_year_id: n.anioId, lider_area_id: liderAreaId, descripcion: 'x' }, pdf())).estado).toBe(400);
    expect((await subir('POST', '/planeacion/planes-area', lider, camposArea({ academic_year_id: 'no-es-un-id' }), pdf())).estado).toBe(400);
    expect((await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula({ periodo_numero: '9' }), pdf())).estado).toBe(400);

    const sinComentario = await json('PATCH', `/planeacion/planes-area/0123456789abcdef01234567/revision`, e.coordAcademico, { decision: 'DEVUELTO' });
    expect(sinComentario.estado).toBe(400);
    expect(sinComentario.cuerpo.message).toMatch(/debes escribir un comentario/);
    expect((await json('PATCH', `/planeacion/planes-area/0123456789abcdef01234567/revision`, e.coordAcademico, { decision: 'TAL_VEZ' })).estado).toBe(400);
    expect((await json('PATCH', `/planeacion/planes-aula/0123456789abcdef01234567/reabrir`, e.admin, {})).cuerpo.message).toMatch(/motivo/);

    expect((await json('PUT', `/planeacion/ventanas/${n.anioId}/periodos/2`, e.coordAcademico, {})).estado).toBe(400);
    expect((await json('PUT', `/planeacion/ventanas/${n.anioId}/periodos/2`, e.coordAcademico, { fecha_limite: 'pronto' })).estado).toBe(400);
    const incoherente = await json('PUT', `/planeacion/ventanas/${n.anioId}/periodos/2`, e.coordAcademico, { fecha_apertura: dia(10), fecha_limite: dia(5) });
    expect(incoherente.estado).toBe(400);
    expect(incoherente.cuerpo.message).toMatch(/anterior a la apertura/);
    expect((await json('GET', '/planeacion/planes-area', e.coordAcademico)).estado).toBe(400);
    // Líderes de área: el docente es obligatorio y los niveles, la jornada y las sedes tienen que ser válidos.
    expect((await json('POST', '/planeacion/lideres-area', e.coordAcademico, { area_id: n.areaId })).estado).toBe(400);
    const datosLider = { area_id: n.areaId, docente_id: String(lider._id) };
    expect((await json('POST', '/planeacion/lideres-area', e.coordAcademico, { ...datosLider, niveles: ['UNIVERSIDAD'] })).estado).toBe(400);
    expect((await json('POST', '/planeacion/lideres-area', e.coordAcademico, { ...datosLider, jornada: 'TARDE' })).estado).toBe(400);
    expect((await json('POST', '/planeacion/lideres-area', e.coordAcademico, { ...datosLider, sedes_ids: ['no-es-un-id'] })).estado).toBe(400);
    expect((await json('PATCH', `/planeacion/lideres-area/${liderAreaId}`, e.coordAcademico, {})).estado).toBe(400);
  });

  it('documentos de referencia: subida multipart real, solo PDF, con tope de tamaño y sin exponer la ruta', async () => {
    const campos = { titulo: 'DBA de Matemáticas', descripcion: 'MEN 2016', area_id: n.areaId, grados_ids: [gradoId] };

    const sinArchivo = await subir('POST', '/planeacion/documentos-referencia', e.coordAcademico, campos, null);
    expect(sinArchivo.estado).toBe(400);
    const texto = await subir('POST', '/planeacion/documentos-referencia', e.coordAcademico, campos, { contenido: 'hola', nombre: 'notas.txt', tipo: 'text/plain' });
    expect(texto.estado).toBe(400);
    expect(texto.cuerpo.message).toMatch(/Solo se aceptan documentos en formato PDF/);
    const falso = await subir('POST', '/planeacion/documentos-referencia', e.coordAcademico, campos, { contenido: 'no soy un pdf', nombre: 'dba.pdf', tipo: 'application/pdf' });
    expect(falso.estado).toBe(400);
    expect(falso.cuerpo.message).toMatch(/no es un PDF válido/);
    const enorme = await subir('POST', '/planeacion/documentos-referencia', e.coordAcademico, campos, {
      contenido: Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(26 * 1024 * 1024)]),
      nombre: 'grande.pdf',
      tipo: 'application/pdf',
    });
    expect(enorme.estado).toBe(400);
    expect(enorme.cuerpo.message).toMatch(/25 MB/);
    expect(await DocumentoReferencia.countDocuments()).toBe(0);

    // Un PDF del tamaño de los del MEN (el de Ciencias Sociales pesa ~16 MB) sí pasa.
    const grande = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(16 * 1024 * 1024, 'x')]);
    const creado = await subir('POST', '/planeacion/documentos-referencia', e.coordAcademico, campos, { contenido: grande, nombre: 'dba-sociales.pdf', tipo: 'application/pdf' });
    expect(creado.estado).toBe(201);
    expect(creado.cuerpo.data).toMatchObject({ titulo: 'DBA de Matemáticas', area: { nombre: 'Matemáticas' }, grados: [{ nombre: 'Sexto' }], archivo: { nombre: 'dba-sociales.pdf', bytes: grande.length } });
    expect(JSON.stringify(creado.cuerpo)).not.toMatch(/uploads|sha256|"ruta"/);
    const id = creado.cuerpo.data._id as string;

    // Dos grados repitiendo el campo; sin sesión o sin rol no se baja; con rol, el contenido exacto.
    const otro = await subir('POST', '/planeacion/documentos-referencia', e.admin, { ...campos, titulo: 'Lineamientos', grados_ids: [gradoId, gradoId] }, pdf());
    expect(otro.estado).toBe(400);
    expect((await fetch(`${base}/planeacion/documentos-referencia/${id}/archivo`)).status).toBe(401);
    expect((await fetch(`${base}/planeacion/documentos-referencia/${id}/archivo`, { headers: encabezado(e.estudiante) })).status).toBe(403);
    const descarga = await fetch(`${base}/planeacion/documentos-referencia/${id}/archivo`, { headers: encabezado(e.docenteDeClase) });
    expect(descarga.status).toBe(200);
    expect(Buffer.from(await descarga.arrayBuffer()).equals(grande)).toBe(true);

    const filtrado = await json('GET', `/planeacion/documentos-referencia?area_id=${n.areaId}&grade_id=${gradoId}`, e.docenteDeClase);
    expect(filtrado.cuerpo.count).toBe(1);

    // Los datos se cambian en JSON; el PDF se reemplaza por su propia ruta (multipart por POST, como todas las subidas).
    expect((await json('PATCH', `/planeacion/documentos-referencia/${id}`, e.coordAcademico, { titulo: 'DBA 2016' })).cuerpo.data.titulo).toBe('DBA 2016');
    const reemplazado = await subir('POST', `/planeacion/documentos-referencia/${id}/archivo`, e.coordAcademico, {}, pdf('v2.pdf', '%PDF-1.4 segunda'));
    expect(reemplazado.cuerpo.data.archivo.nombre).toBe('v2.pdf');
    expect((await subir('POST', `/planeacion/documentos-referencia/${id}/archivo`, e.coordAcademico, {}, { contenido: 'x', nombre: 'x.txt', tipo: 'text/plain' })).estado).toBe(400);
    expect((await subir('POST', `/planeacion/documentos-referencia/${id}/archivo`, e.docenteDeClase, {}, pdf())).estado).toBe(403);
    expect(await (await fetch(`${base}/planeacion/documentos-referencia/${id}/archivo`, { headers: encabezado(e.admin) })).text()).toBe('%PDF-1.4 segunda');

    expect((await json('DELETE', `/planeacion/documentos-referencia/${id}`, e.coordAcademico)).estado).toBe(200);
    expect((await fetch(`${base}/planeacion/documentos-referencia/${id}/archivo`, { headers: encabezado(e.coordAcademico) })).status).toBe(404);
  });

  it('los líderes de un área se designan por nivel, jornada y sede sin cruzarse; cada uno carga solo el plan de lo suyo', async () => {
    const otro = e.docenteAjeno;
    const designar = (cuerpo: Record<string, unknown>) => json('POST', '/planeacion/lideres-area', e.coordAcademico, { area_id: n.areaId, ...cuerpo });

    const primaria = await designar({ docente_id: String(lider._id), niveles: ['PREESCOLAR', 'PRIMARIA'] });
    expect(primaria.estado).toBe(201);
    expect(primaria.cuerpo.data).toMatchObject({ niveles: ['PREESCOLAR', 'PRIMARIA'], jornada: 'TODAS', sedes: [], alcance_texto: 'Preescolar, Primaria · Todas las jornadas · Todas las sedes' });
    const secundaria = await designar({ docente_id: String(otro._id), niveles: ['SECUNDARIA', 'MEDIA'], jornada: 'DIURNA' });
    expect(secundaria.estado).toBe(201);

    // Lo que ya cubre otro no se vuelve a designar: el mensaje dice quién y qué.
    const cruce = await designar({ docente_id: String(otro._id), niveles: ['PRIMARIA'], jornada: 'NOCTURNA' });
    expect(cruce.estado).toBe(409);
    expect(cruce.cuerpo.message).toMatch(new RegExp(`Ya hay un líder.*${lider.nombre}`));
    // La nocturna de secundaria y media sí está libre: no se cruza con la diurna ni con primaria.
    const nocturna = await designar({ docente_id: String(otro._id), niveles: ['SECUNDARIA', 'MEDIA'], jornada: 'NOCTURNA' });
    expect(nocturna.estado).toBe(201);

    const lista = await json('GET', `/planeacion/lideres-area?area_id=${n.areaId}`, e.admin);
    expect(lista.cuerpo.count).toBe(3);

    // Cada uno carga el plan de lo suyo; el de otro, no.
    const idSecundaria = secundaria.cuerpo.data._id as string;
    expect((await subir('POST', '/planeacion/planes-area', lider, camposArea({ lider_area_id: idSecundaria }), pdf())).estado).toBe(403);
    const plan = await subir('POST', '/planeacion/planes-area', otro, camposArea({ lider_area_id: idSecundaria }), pdf('secundaria.pdf'));
    expect(plan.estado).toBe(201);
    expect(plan.cuerpo.data).toMatchObject({ lider_area_id: idSecundaria, alcance: { jornada: 'DIURNA' }, lider: { nombre: otro.nombre } });

    // Coordinación ve una fila por líder y una «sin líder» para lo que nadie cubre (en el colegio de la prueba no hay primaria: solo secundaria).
    const filas = (await json('GET', `/planeacion/planes-area?academic_year_id=${n.anioId}`, e.coordAcademico)).cuerpo.data as Array<{ alcance: { jornada: string } | null; lider_area_id: string | null; estado: string }>;
    expect(filas.filter((f) => f.lider_area_id).map((f) => f.estado).sort()).toEqual(['EN_REVISION', 'SIN_CARGAR', 'SIN_CARGAR']);

    // Quitar a quien ya cargó un plan lo desactiva (el plan cuelga de él); sin planes se elimina.
    const quitado = await json('DELETE', `/planeacion/lideres-area/${idSecundaria}`, e.coordAcademico);
    expect(quitado.cuerpo.data).toEqual({ eliminado: false, desactivado: true });
    expect((await json('DELETE', `/planeacion/lideres-area/${nocturna.cuerpo.data._id}`, e.coordAcademico)).cuerpo.data).toEqual({ eliminado: true, desactivado: false });
    expect((await json('GET', `/planeacion/lideres-area?area_id=${n.areaId}`, e.admin)).cuerpo.count).toBe(1);
    expect((await json('GET', `/planeacion/lideres-area?area_id=${n.areaId}&incluir_inactivos=true`, e.admin)).cuerpo.count).toBe(2);
    // Ya sin el cargo no puede reenviar.
    expect((await subir('POST', '/planeacion/planes-area', otro, camposArea({ lider_area_id: idSecundaria }), pdf())).estado).toBe(409);
  });

  it('flujo completo por la API: líder, plan de área, plan de aula fuera de plazo con su etiqueta, devolución, corrección y aprobación', async () => {
    // El líder carga el plan de área; coordinación lo devuelve con comentario; el líder responde; el ADMIN lo aprueba.
    expect((await designarLider()).cuerpo.data).toMatchObject({
      docente: { nombre: lider.nombre },
      alcance_texto: 'Todos los niveles · Todas las jornadas · Todas las sedes',
    });
    const area = await subir('POST', '/planeacion/planes-area', lider, camposArea(), pdf('area-v1.pdf', '%PDF-1.4 area uno'));
    expect(area.estado).toBe(201);
    expect(area.cuerpo.data).toMatchObject({ estado: 'EN_REVISION', version_actual: 1 });
    const areaId = area.cuerpo.data._id as string;

    // Mientras no esté aprobado, el plan de aula no se carga y el motivo es claro.
    const antes = await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula(), pdf());
    expect(antes.estado).toBe(409);
    expect(antes.cuerpo.message).toMatch(/plan de área de Matemáticas todavía no está aprobado/);

    const devuelto = await json('PATCH', `/planeacion/planes-area/${areaId}/revision`, e.coordAcademico, { decision: 'DEVUELTO', comentario: 'Falta la secuencia por periodos.' });
    expect(devuelto.cuerpo.data).toMatchObject({ estado: 'DEVUELTO', revisiones: [{ accion: 'DEVUELTO', comentario: 'Falta la secuencia por periodos.', revisor: { nombre: e.coordAcademico.nombre } }] });
    const reenviado = await subir('POST', '/planeacion/planes-area', lider, camposArea({ titulo: 'Plan de área v2' }), pdf('area-v2.pdf', '%PDF-1.4 area dos'));
    expect(reenviado.cuerpo.data).toMatchObject({ estado: 'EN_REVISION', version_actual: 2 });
    expect((await json('PATCH', `/planeacion/planes-area/${areaId}/revision`, e.admin, { decision: 'APROBADO' })).cuerpo.data.estado).toBe('APROBADO');

    // El docente lo ve aprobado y baja el PDF (la versión vigente); uno ajeno al área no.
    expect(await (await fetch(`${base}/planeacion/planes-area/${areaId}/archivo`, { headers: encabezado(e.docenteDeClase) })).text()).toBe('%PDF-1.4 area dos');
    expect(await (await fetch(`${base}/planeacion/planes-area/${areaId}/archivo?version=1`, { headers: encabezado(e.coordAcademico) })).text()).toBe('%PDF-1.4 area uno');
    expect((await fetch(`${base}/planeacion/planes-area/${areaId}/archivo`, { headers: encabezado(e.docenteAjeno) })).status).toBe(404);
    expect((await json('GET', `/planeacion/planes-area?academic_year_id=${n.anioId}`, e.docenteDeClase)).cuerpo.data).toMatchObject([{ estado: 'APROBADO', soy_lider: false }]);

    // Plan de aula del periodo 1, ya vencida su fecha límite y con el docente asignado desde antes: se acepta, con la etiqueta.
    await TeacherAssignment.collection.updateOne({ docente_id: e.docenteDeClase._id }, { $set: { createdAt: new Date(Date.now() - 200 * DIA_MS) } });
    const tarde = await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula({ periodo_numero: '1' }), pdf('aula-v1.pdf', '%PDF-1.4 aula uno'));
    expect(tarde.estado).toBe(201);
    expect(tarde.cuerpo.data).toMatchObject({ estado: 'EN_REVISION', periodo_numero: 1, radicacion: { fuera_de_plazo: true } });
    expect(typeof tarde.cuerpo.data.radicacion.fecha).toBe('string');
    expect(JSON.stringify(tarde.cuerpo)).not.toMatch(/uploads|sha256|"ruta"/);
    const aulaId = tarde.cuerpo.data._id as string;

    // Las tarjetas del docente y la bandeja de coordinación muestran lo mismo.
    const tarjetas = (await json('GET', `/planeacion/planes-aula/mios?academic_year_id=${n.anioId}`, e.docenteDeClase)).cuerpo.data.tarjetas;
    expect(tarjetas[0].periodos[0]).toMatchObject({ estado: 'EN_REVISION', plan: { radicacion: { fuera_de_plazo: true } } });
    const bandeja = (await json('GET', `/planeacion/planes-aula?academic_year_id=${n.anioId}&periodo_numero=1`, e.coordAcademico)).cuerpo.data;
    expect(bandeja.resumen).toMatchObject({ esperados: 1, en_revision: 1, fuera_de_plazo: 1 });

    // Coordinación devuelve; el formulario de reenvío sigue disponible aunque la fecha límite ya pasó, y la etiqueta no cambia.
    await json('PATCH', `/planeacion/planes-aula/${aulaId}/revision`, e.coordAcademico, { decision: 'DEVUELTO', comentario: 'Agrega la evaluación.' });
    const detalle = (await json('GET', `/planeacion/planes-aula/${aulaId}`, e.docenteDeClase)).cuerpo.data;
    expect(detalle).toMatchObject({ estado: 'DEVUELTO', revisiones: [{ comentario: 'Agrega la evaluación.' }] });
    const respuesta = await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula({ periodo_numero: '1', titulo: 'Plan P1 corregido' }), pdf('aula-v2.pdf', '%PDF-1.4 aula dos'));
    expect(respuesta.estado).toBe(201);
    expect(respuesta.cuerpo.data).toMatchObject({ estado: 'EN_REVISION', version_actual: 2, titulo: 'Plan P1 corregido', radicacion: { fuera_de_plazo: true } });

    expect((await json('PATCH', `/planeacion/planes-aula/${aulaId}/revision`, e.coordAcademico, { decision: 'APROBADO' })).cuerpo.data.estado).toBe('APROBADO');
    // Aprobado: el formulario ya no recibe nada, y el visor de actividades lo reconoce.
    expect((await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula({ periodo_numero: '1' }), pdf())).estado).toBe(409);
    const asignacionId = String((await TeacherAssignment.findOne({ docente_id: e.docenteDeClase._id }))!._id);
    expect((await json('GET', `/planeacion/planes-aula/de-asignacion?teacher_assignment_id=${asignacionId}&periodo_numero=1`, e.docenteDeClase)).cuerpo.data).toMatchObject({ aprobado: true, plan: { _id: aulaId } });

    // El PDF de cada versión: el del propio docente y el de coordinación; nadie más.
    expect(await (await fetch(`${base}/planeacion/planes-aula/${aulaId}/archivo?version=1`, { headers: encabezado(e.docenteDeClase) })).text()).toBe('%PDF-1.4 aula uno');
    expect(await (await fetch(`${base}/planeacion/planes-aula/${aulaId}/archivo`, { headers: encabezado(e.admin) })).text()).toBe('%PDF-1.4 aula dos');
    expect((await fetch(`${base}/planeacion/planes-aula/${aulaId}/archivo`, { headers: encabezado(e.docenteAjeno) })).status).toBe(404);
    expect((await fetch(`${base}/planeacion/planes-aula/${aulaId}/archivo`)).status).toBe(401);

    // Solo el ADMIN reabre, con motivo.
    expect((await json('PATCH', `/planeacion/planes-aula/${aulaId}/reabrir`, e.admin, { motivo: 'Cambió el calendario' })).cuerpo.data.estado).toBe('DEVUELTO');
  });

  it('el docente que se va deja su plan archivado y el que llega lo adopta con un clic', async () => {
    await aprobarPlanDeArea();
    await abrirEntregaDelPeriodo2();
    const plan = await subir('POST', '/planeacion/planes-aula', e.docenteDeClase, camposAula(), pdf('ana.pdf', '%PDF-1.4 plan de ana'));
    await json('PATCH', `/planeacion/planes-aula/${plan.cuerpo.data._id}/revision`, e.coordAcademico, { decision: 'APROBADO' });

    // Se retira la asignación (M08) y llega otro docente al mismo grupo.
    const asignacion = (await TeacherAssignment.findOne({ docente_id: e.docenteDeClase._id }))!;
    expect((await json('DELETE', `/teacher-assignments/${asignacion._id}`, e.coordAcademico)).estado).toBe(200);
    await TeacherAssignment.create({ docente_id: e.docenteAjeno._id, academic_year_id: n.anioId, tipo_asignacion: 'CLASE', group_id: n.grupoId, subject_id: n.materiaId, horas_semanales: 4 });

    const archivado = (await json('GET', `/planeacion/planes-aula?academic_year_id=${n.anioId}&periodo_numero=2`, e.coordAcademico)).cuerpo.data;
    expect(archivado.resumen.archivados).toBe(1);

    const oferta = (await json('GET', `/planeacion/planes-aula/mios?academic_year_id=${n.anioId}`, e.docenteAjeno)).cuerpo.data.tarjetas[0].periodos[1];
    expect(oferta.adoptables).toMatchObject([{ plan_id: plan.cuerpo.data._id, docente: { nombre: e.docenteDeClase.nombre } }]);

    const adoptado = await json('POST', '/planeacion/planes-aula/adoptar', e.docenteAjeno, { plan_origen_id: plan.cuerpo.data._id });
    expect(adoptado.estado).toBe(201);
    expect(adoptado.cuerpo.data).toMatchObject({ estado: 'APROBADO', origen: 'ADOPTADA', docente: { nombre: e.docenteAjeno.nombre } });
    expect(await (await fetch(`${base}/planeacion/planes-aula/${adoptado.cuerpo.data._id}/archivo`, { headers: encabezado(e.docenteAjeno) })).text()).toBe('%PDF-1.4 plan de ana');
    expect((await json('POST', '/planeacion/planes-aula/adoptar', e.docenteAjeno, { plan_origen_id: plan.cuerpo.data._id })).estado).toBe(409);
  });

  it('activar el año sin los planes de área aprobados responde 409 con las áreas pendientes; con todo aprobado, activa', async () => {
    await AcademicYear.updateOne({ _id: n.anioId }, { $set: { estado: 'PLANIFICACION' } });

    const rechazo = await json('PATCH', `/academic-years/${n.anioId}/activar`, e.admin);
    expect(rechazo.estado).toBe(409);
    expect(rechazo.cuerpo.message).toMatch(/no tienen su plan de área aprobado/);
    expect(rechazo.cuerpo.details.areas_pendientes).toMatchObject([{ nombre: 'Matemáticas', motivo: 'SIN_LIDER', detalle: expect.stringMatching(/líder/) }]);

    await aprobarPlanDeArea();
    const activado = await json('PATCH', `/academic-years/${n.anioId}/activar`, e.admin);
    expect(activado.estado).toBe(200);
    expect(activado.cuerpo.data.estado).toBe('EN_CURSO');
  });

  it('la ventana: docentes y coordinación la ven, coordinación y ADMIN la ajustan, y restaurarla vuelve a la sugerida', async () => {
    const inicial = (await json('GET', `/planeacion/ventanas?academic_year_id=${n.anioId}`, e.docenteDeClase)).cuerpo.data;
    expect(inicial.periodos).toHaveLength(4);
    expect(inicial.periodos[1]).toMatchObject({ numero: 2, apertura_personalizada: false, estado: 'NO_ABIERTA' });

    const ajustada = await abrirEntregaDelPeriodo2();
    expect(ajustada.cuerpo.data.periodos[1]).toMatchObject({ apertura_personalizada: true, limite_personalizado: true, estado: 'ABIERTA' });

    const restaurada = await json('PUT', `/planeacion/ventanas/${n.anioId}/periodos/2`, e.admin, { fecha_apertura: null, fecha_limite: null });
    expect(restaurada.cuerpo.data.periodos[1]).toMatchObject({ apertura_personalizada: false, estado: 'NO_ABIERTA' });
  });
});
