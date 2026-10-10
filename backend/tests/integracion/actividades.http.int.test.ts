import fs from 'fs/promises';
import path from 'path';
import type { AddressInfo } from 'net';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AcademicYear from '../../src/models/academicYear.model';
import ActivitySubmission from '../../src/models/activitySubmission.model';
import Activity from '../../src/models/activity.model';
import CurricularDevelopment from '../../src/models/curricularDevelopment.model';
import TeacherAssignment from '../../src/models/teacherAssignment.model';
import { UserDocument } from '../../src/models/user.model';
import { hoyColombia } from '../../src/services/attendance.service';
import { generateToken } from '../../src/services/token.service';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { armarEscenario, crearUsuario, Escenario } from './escenario';
import { UPLOADS_ROOT } from '../../src/utils/uploadPaths';

const DIA_MS = 86_400_000;

function proximoDiaHabil(desdeDias: number): Date {
  const dia = hoyColombia();
  dia.setUTCDate(dia.getUTCDate() + desdeDias);
  while ([0, 6].includes(dia.getUTCDay())) dia.setUTCDate(dia.getUTCDate() + 1);
  return new Date(dia.getTime() + 17 * 3_600_000);
}

// M11 contra la capa HTTP real: rutas, validadores Joi, permisos por rol y la subida multipart.
describe('M11: actividades (capa HTTP)', () => {
  let e: Escenario;
  let base: string;
  let cerrar: () => Promise<void>;
  let asignacionId: string;

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
    await fs.rm(path.join(UPLOADS_ROOT, 'actividades'), { recursive: true, force: true });
  });
  beforeEach(async () => {
    await limpiarBaseDeDatos();
    await Promise.all([Activity.syncIndexes(), ActivitySubmission.syncIndexes()]);
    e = await armarEscenario();

    const anio = (await AcademicYear.findOne())!;
    const dia = (offset: number) => new Date(hoyColombia().getTime() + offset * DIA_MS);
    anio.set('fecha_inicio', dia(-100));
    anio.set('fecha_fin', dia(300));
    anio.set(
      'periodos',
      [
        [1, -100, 100],
        [2, 101, 200],
        [3, 201, 250],
        [4, 251, 300],
      ].map(([numero, inicio, fin]) => ({
        numero,
        nombre: `Periodo ${numero}`,
        porcentaje: numero === 1 || numero === 2 ? 30 : 20,
        fecha_inicio: dia(inicio as number),
        fecha_fin: dia(fin as number),
        estado: 'ABIERTO',
      }))
    );
    await anio.save();

    const asignacion = (await TeacherAssignment.findOne({ docente_id: e.docenteDeClase._id }))!;
    asignacionId = String(asignacion._id);
    await CurricularDevelopment.create({
      teacher_assignment_id: asignacion._id,
      periodo_numero: 1,
      competencias: 'Resuelve problemas con fracciones.',
      metodologia_y_recursos: 'Trabajo en equipo',
      criterios_evaluacion: 'Rúbrica',
      estado: 'APROBADO',
    });
  }, 60_000);

  const encabezado = (usuario: UserDocument | null): Record<string, string> => (usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {});

  const json = async (metodo: string, ruta: string, usuario: UserDocument | null, cuerpo?: unknown) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...encabezado(usuario) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; message?: string; data?: any; count?: number } };
  };

  const subir = async (ruta: string, usuario: UserDocument, archivo: { contenido: BlobPart; nombre: string; tipo: string } | null, texto = '') => {
    const formulario = new FormData();
    if (archivo) formulario.append('file', new Blob([archivo.contenido], { type: archivo.tipo }), archivo.nombre);
    formulario.append('texto_entrega', texto);
    const respuesta = await fetch(`${base}${ruta}`, { method: 'POST', headers: encabezado(usuario), body: formulario });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; message?: string; data?: any } };
  };

  const nueva = (extra: Record<string, unknown> = {}) => ({
    teacher_assignment_id: asignacionId,
    periodo_numero: 1,
    titulo: 'Taller de fracciones',
    descripcion: 'Resuelve los ejercicios.',
    tipo: 'TAREA',
    componente_siee: 'COGNITIVO_SABER',
    peso_en_componente: 1,
    fecha_apertura: new Date(Date.now() - 3_600_000).toISOString(),
    fecha_entrega: proximoDiaHabil(3).toISOString(),
    requiere_entrega: true,
    formatos_permitidos: ['PDF'],
    competencia_evaluada: 'Resuelve problemas con fracciones',
    ...extra,
  });

  it('cada ruta exige sesión y el rol que le corresponde', async () => {
    const id = '0123456789abcdef01234567';
    expect((await json('GET', '/activities/mias', null)).estado).toBe(401);

    // El estudiante no programa ni lista lo de los docentes; el docente no usa la bandeja del estudiante.
    expect((await json('POST', '/activities', e.estudiante, nueva())).estado).toBe(403);
    expect((await json('GET', '/activities', e.estudiante)).estado).toBe(403);
    expect((await json('GET', '/activities/mias', e.docenteDeClase)).estado).toBe(403);
    expect((await json('GET', `/activities/${id}/entregas`, e.estudiante)).estado).toBe(403);
    expect((await json('PATCH', `/activities/${id}/grade`, e.estudiante, { student_id: id, calificacion_numerica: 5 })).estado).toBe(403);
    expect((await json('DELETE', `/activities/${id}`, e.coordAcademico)).estado).toBe(403);
    // La secretaría y el acudiente no tienen nada que ver con las actividades.
    expect((await json('GET', '/activities', e.secretaria)).estado).toBe(403);
    expect((await json('GET', '/activities/configuracion', e.estudiante)).estado).toBe(403);
    // La política de carga la cambia coordinación, no el docente.
    expect((await json('PUT', '/activities/configuracion', e.docenteDeClase, { max_evaluaciones_por_dia: 5 })).estado).toBe(403);
  });

  it('valida la forma de lo que llega', async () => {
    const sinTitulo = { ...nueva() } as Record<string, unknown>;
    delete sinTitulo.titulo;
    expect((await json('POST', '/activities', e.docenteDeClase, sinTitulo)).estado).toBe(400);
    expect((await json('POST', '/activities', e.docenteDeClase, nueva({ tipo: 'EXAMEN_SORPRESA' }))).estado).toBe(400);
    expect((await json('POST', '/activities', e.docenteDeClase, nueva({ formatos_permitidos: ['EXE'] }))).estado).toBe(400);
    expect((await json('POST', '/activities', e.docenteDeClase, nueva({ fecha_entrega: 'mañana' }))).estado).toBe(400);
    expect((await json('PUT', '/activities/configuracion', e.coordAcademico, {})).estado).toBe(400);
  });

  it('flujo completo por la API: programar, entregar un PDF, revisar, descargar y calificar', async () => {
    const creada = await json('POST', '/activities', e.docenteDeClase, nueva());
    expect(creada.estado).toBe(201);
    const id = creada.cuerpo.data._id as string;

    // La alerta temprana responde con lo mismo que validará al guardar.
    const revision = await json(
      'GET',
      `/activities/revision-calendario?teacher_assignment_id=${asignacionId}&periodo_numero=1&fecha_entrega=${encodeURIComponent(proximoDiaHabil(3).toISOString())}&tipo=EVALUACION`,
      e.docenteDeClase
    );
    expect(revision.estado).toBe(200);
    expect(revision.cuerpo.data.alertas).toMatchObject([]);
    expect(revision.cuerpo.data.carga_del_dia).toMatchObject([{ titulo: 'Taller de fracciones' }]);

    const bandeja = await json('GET', '/activities/mias', e.estudiante);
    expect(bandeja.cuerpo.data).toMatchObject([{ _id: id, estado: 'PROGRAMADA', puede_entregar: true }]);

    // Entregas inválidas: se rechazan antes de tocar nada.
    expect((await subir(`/activities/${id}/submissions`, e.estudiante, null)).estado).toBe(400);
    const texto = await subir(`/activities/${id}/submissions`, e.estudiante, { contenido: 'hola', nombre: 'notas.txt', tipo: 'text/plain' });
    expect(texto.estado).toBe(400);
    expect(texto.cuerpo.message).toMatch(/Solo se aceptan/);
    const falso = await subir(`/activities/${id}/submissions`, e.estudiante, { contenido: 'no soy un pdf', nombre: 'tarea.pdf', tipo: 'application/pdf' });
    expect(falso.estado).toBe(400);
    expect(falso.cuerpo.message).toMatch(/no es un PDF/);
    const enorme = await subir(`/activities/${id}/submissions`, e.estudiante, {
      contenido: Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(11 * 1024 * 1024)]),
      nombre: 'grande.pdf',
      tipo: 'application/pdf',
    });
    expect(enorme.estado).toBe(400);
    expect(enorme.cuerpo.message).toMatch(/10 MB/);
    expect(await ActivitySubmission.countDocuments()).toBe(0);

    const entregada = await subir(`/activities/${id}/submissions`, e.estudiante, { contenido: '%PDF-1.4 mi tarea', nombre: 'tarea.pdf', tipo: 'application/pdf' }, 'Listo');
    expect(entregada.estado).toBe(201);
    expect(entregada.cuerpo.data).toMatchObject({ estado: 'ENTREGADA', tiene_archivo: true, archivo_nombre: 'tarea.pdf' });
    expect(JSON.stringify(entregada.cuerpo)).not.toMatch(/archivo_path|uploads/);
    const entregaId = entregada.cuerpo.data._id as string;

    const filas = await json('GET', `/activities/${id}/entregas`, e.docenteDeClase);
    expect(filas.cuerpo.count).toBe(3);

    // La evidencia solo la baja quien corresponde, con sesión.
    const descarga = await fetch(`${base}/activities/entregas/${entregaId}/archivo`, { headers: encabezado(e.docenteDeClase) });
    expect(descarga.status).toBe(200);
    expect(await descarga.text()).toBe('%PDF-1.4 mi tarea');
    expect((await fetch(`${base}/activities/entregas/${entregaId}/archivo`, { headers: encabezado(e.otroEstudiante) })).status).toBe(404);
    expect((await fetch(`${base}/activities/entregas/${entregaId}/archivo`, { headers: encabezado(e.docenteAjeno) })).status).toBe(403);
    expect((await fetch(`${base}/activities/entregas/${entregaId}/archivo`)).status).toBe(401);

    const nota = await json('PATCH', `/activities/${id}/grade`, e.docenteDeClase, { student_id: String(e.estudiante._id), calificacion_numerica: 4.2, retroalimentacion: 'Bien' });
    expect(nota.estado).toBe(200);
    expect((await json('GET', `/activities/${id}`, e.estudiante)).cuerpo.data).toMatchObject({
      estado: 'CALIFICADA',
      puede_entregar: false,
      entrega: { calificacion_numerica: 4.2, retroalimentacion: 'Bien' },
    });
    expect((await json('GET', `/activities/${id}`, e.coordAcademico)).cuerpo.data.resumen).toEqual({ estudiantes: 3, entregadas: 1, con_retraso: 0, calificadas: 1 });
    expect((await json('DELETE', `/activities/${id}`, e.docenteDeClase)).estado).toBe(409);
  });

  it('un docente ajeno no gestiona la actividad de otro, y un estudiante de otro grupo no la ve', async () => {
    const id = (await json('POST', '/activities', e.docenteDeClase, nueva())).cuerpo.data._id as string;
    expect((await json('PATCH', `/activities/${id}`, e.docenteAjeno, { titulo: 'Robada' })).estado).toBe(403);
    expect((await json('GET', `/activities/${id}/entregas`, e.docenteAjeno)).estado).toBe(403);
    expect((await json('GET', `/activities/${id}`, e.docenteAjeno)).estado).toBe(403);

    const otroGrupo = await crearUsuario('ESTUDIANTE');
    expect((await json('GET', `/activities/${id}`, otroGrupo)).estado).toBe(404);
    expect((await json('GET', '/activities/mias', otroGrupo)).cuerpo.data).toEqual([]);
  });

  it('el docente lista, consulta, edita, califica en lote y elimina por la API (lo mismo que envía el frontend)', async () => {
    const anioId = String((await AcademicYear.findOne())!._id);
    const creada = await json('POST', '/activities', e.docenteDeClase, nueva({ dba_id: null, formatos_permitidos: [], competencia_evaluada: 'Resuelve problemas con fracciones', confirmar_alertas: false }));
    expect(creada.estado).toBe(201);
    const id = creada.cuerpo.data._id as string;

    const propias = await json('GET', `/activities?academic_year_id=${anioId}&teacher_assignment_id=${asignacionId}&periodo=1`, e.docenteDeClase);
    expect(propias.cuerpo.count).toBe(1);
    expect(propias.cuerpo.data[0]).toMatchObject({ _id: id, tipo: 'TAREA', publicada: true, resumen: { estudiantes: 3, entregadas: 0 }, asignacion: { grupo: { nomenclatura: '601' } } });
    // Otro docente no ve las actividades ajenas aunque pida la asignación de ese docente.
    expect((await json('GET', `/activities?academic_year_id=${anioId}&teacher_assignment_id=${asignacionId}`, e.docenteAjeno)).cuerpo.count).toBe(0);
    expect((await json('GET', `/activities/${id}`, e.docenteDeClase)).cuerpo.data).toMatchObject({ _id: id, formatos_permitidos: [], resumen: { calificadas: 0 } });

    // Edición parcial, como la manda el drawer (solo lo que cambió).
    const editada = await json('PATCH', `/activities/${id}`, e.docenteDeClase, { titulo: 'Taller v2', confirmar_alertas: false });
    expect(editada.estado).toBe(200);
    expect(editada.cuerpo.data.titulo).toBe('Taller v2');
    expect((await json('PATCH', `/activities/${id}`, e.docenteDeClase, {})).estado).toBe(400);
    expect((await json('PATCH', `/activities/${id}`, e.docenteDeClase, { dba_id: String(new Types.ObjectId()) })).estado).toBe(400);

    // Actividad de aula: sin entregas digitales, calificada en lote.
    const aula = (await json('POST', '/activities', e.docenteDeClase, nueva({ titulo: 'Participación', requiere_entrega: false, formatos_permitidos: [], tipo: 'TRABAJO' }))).cuerpo.data._id as string;
    const lote = await json('PATCH', `/activities/${aula}/grade`, e.docenteDeClase, [
      { student_id: String(e.estudiante._id), calificacion_numerica: 4 },
      { student_id: String(e.otroEstudiante._id), calificacion_numerica: 3.5, retroalimentacion: 'Mejora' },
    ]);
    expect(lote.estado).toBe(200);
    expect(lote.cuerpo.count).toBe(2);
    expect((await json('PATCH', `/activities/${aula}/grade`, e.docenteDeClase, { student_id: String(e.estudiante._id), calificacion_numerica: 99 })).estado).toBe(400);
    expect((await subir(`/activities/${aula}/submissions`, e.estudiante, { contenido: '%PDF-1.4', nombre: 'a.pdf', tipo: 'application/pdf' })).estado).toBe(409);
    expect((await json('GET', `/activities/${aula}`, e.estudiante)).cuerpo.data).toMatchObject({ estado: 'CALIFICADA', entrega: { calificacion_numerica: 4 } });
    expect((await json('GET', `/activities/${aula}`, e.tercerEstudiante)).cuerpo.data).toMatchObject({ estado: 'PROGRAMADA', puede_entregar: false });

    expect((await json('DELETE', `/activities/${id}`, e.docenteDeClase)).estado).toBe(200);
    expect((await json('GET', `/activities/${id}`, e.docenteDeClase)).estado).toBe(404);
    expect((await json('DELETE', `/activities/${aula}`, e.docenteDeClase)).estado).toBe(409);
  });

  it('la bandeja del estudiante filtra por asignatura, estado y fecha de entrega', async () => {
    const subjectId = String((await TeacherAssignment.findById(asignacionId))!.subject_id);
    const pronto = proximoDiaHabil(3);
    const tarde = proximoDiaHabil(20);
    const a = (await json('POST', '/activities', e.docenteDeClase, nueva({ titulo: 'Pronto', fecha_entrega: pronto.toISOString() }))).cuerpo.data._id as string;
    const b = (await json('POST', '/activities', e.docenteDeClase, nueva({ titulo: 'Después', fecha_entrega: tarde.toISOString() }))).cuerpo.data._id as string;
    await subir(`/activities/${a}/submissions`, e.estudiante, { contenido: '%PDF-1.4', nombre: 'a.pdf', tipo: 'application/pdf' });

    const ids = async (consulta: string) => (await json('GET', `/activities/mias${consulta}`, e.estudiante)).cuerpo.data.map((x: { _id: string }) => x._id);
    expect(await ids('')).toEqual([a, b]); // ordenadas por fecha límite
    expect(await ids(`?subject_id=${subjectId}`)).toEqual([a, b]);
    expect(await ids(`?subject_id=${String(new Types.ObjectId())}`)).toEqual([]);
    expect(await ids('?estado=PROGRAMADA')).toEqual([b]);
    expect(await ids('?estado=ENTREGADA')).toEqual([a]);
    const dia = (d: Date) => new Date(d.getTime() - 17 * 3_600_000).toISOString().slice(0, 10);
    expect(await ids(`?desde=${dia(tarde)}`)).toEqual([b]);
    expect(await ids(`?hasta=${dia(pronto)}`)).toEqual([a]);
    expect(await ids('?periodo=2')).toEqual([]);
    expect((await json('GET', '/activities/mias?estado=INVENTADO', e.estudiante)).estado).toBe(400);
  });

  it('coordinación supervisa por grupo y fija la política de carga', async () => {
    await json('POST', '/activities', e.docenteDeClase, nueva());
    const grupoId = String((await TeacherAssignment.findById(asignacionId))!.group_id);
    const anioId = String((await AcademicYear.findOne())!._id);

    const lista = await json('GET', `/activities?academic_year_id=${anioId}&group_id=${grupoId}`, e.coordAcademico);
    expect(lista.cuerpo.count).toBe(1);
    expect(lista.cuerpo.data[0].asignacion.grupo.nomenclatura).toBe('601');

    expect((await json('PUT', '/activities/configuracion', e.coordAcademico, { max_evaluaciones_por_dia: 3, max_entregas_por_dia: 0 })).estado).toBe(200);
    expect((await json('GET', '/activities/configuracion', e.docenteDeClase)).cuerpo.data).toMatchObject({ max_evaluaciones_por_dia: 3, max_entregas_por_dia: 0 });
  });
});
