import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import AuditLog from '../../src/models/auditLog.model';
import CalificacionAsignatura from '../../src/models/calificacionAsignatura.model';
import Campus from '../../src/models/campus.model';
import Enrollment from '../../src/models/enrollment.model';
import { UserDocument } from '../../src/models/user.model';
import { cerrarGrupo } from '../../src/services/evaluacionPromocion.service';
import { generateToken } from '../../src/services/token.service';
import { vaciarCacheCorta } from '../../src/utils/cacheCorta';
import { detenerBaseDeDatos, iniciarBaseDeDatos, limpiarBaseDeDatos } from './baseDeDatos';
import { Escenario, armarEscenario } from './escenario';
import { EscenarioNotas, prepararNotas } from './escenarioNotas';

const CLAVE = 'Clave-segura-1';

// Dashboards de rectoría y coordinación (M30) contra la capa HTTP real: permisos por rol, forma de cada bloque y que lo calculado coincide con lo registrado.
describe('M30: dashboards de rectoría y coordinación (capa HTTP)', () => {
  let e: Escenario;
  let n: EscenarioNotas;
  let base: string;
  let cerrar: () => Promise<void>;

  async function notaCerrada(estudianteId: unknown, nota: number, periodo = 1, estado: 'CERRADO' | 'DEFINITIVO' = 'DEFINITIVO') {
    await CalificacionAsignatura.create({
      academic_year_id: n.anioId,
      teacher_assignment_id: n.asignacion._id,
      group_id: n.grupoId,
      subject_id: n.materiaId,
      periodo_numero: periodo,
      student_id: estudianteId,
      estado,
      resultado: { componentes: [], nota_asignatura: nota },
    });
  }

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
    vaciarCacheCorta();
    await limpiarBaseDeDatos();
    await CalificacionAsignatura.syncIndexes();
    e = await armarEscenario();
    n = await prepararNotas(e);
    // Un estudiante va bien, otro pierde la asignatura y el tercero aún no tiene notas.
    await notaCerrada(e.estudiante._id, 4);
    await notaCerrada(e.otroEstudiante._id, 2);
  }, 120_000);

  const pedir = async (ruta: string, usuario: UserDocument | null, query = '') => {
    const cabecera: Record<string, string> = usuario ? { Authorization: `Bearer ${generateToken(usuario)}` } : {};
    const respuesta = await fetch(`${base}/dashboard${ruta}?academic_year_id=${n.anioId}&periodo_numero=1${query}`, { headers: cabecera });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as { success: boolean; data?: any; message?: string } };
  };

  const RUTAS = ['/indicadores', '/eficiencia', '/morbilidad', '/coordinacion/entrega-notas', '/coordinacion/riesgo', '/coordinacion/recuperaciones', '/coordinacion/servicio-social', '/coordinacion/desempeno', '/coordinacion/comparativo', '/coordinacion/alertas'];

  it('exige sesión y solo deja pasar a administración y coordinación', async () => {
    for (const ruta of RUTAS) {
      expect((await pedir(ruta, null)).estado).toBe(401);
      expect((await pedir(ruta, e.docenteDeClase)).estado).toBe(403);
      expect((await pedir(ruta, e.secretaria)).estado).toBe(403);
      expect((await pedir(ruta, e.estudiante)).estado).toBe(403);
      expect((await pedir(ruta, e.coordConvivencia)).estado).toBe(403);
      expect((await pedir(ruta, e.orientador)).estado).toBe(403);
      expect((await pedir(ruta, e.admin)).estado, ruta).toBe(200);
      expect((await pedir(ruta, e.coordAcademico)).estado, ruta).toBe(200);
    }
  }, 120_000);

  it('rechaza una consulta sin año o con identificadores mal formados', async () => {
    const sinAnio = await fetch(`${base}/dashboard/indicadores`, { headers: { Authorization: `Bearer ${generateToken(e.admin)}` } });
    expect(sinAnio.status).toBe(400);
    expect((await pedir('/indicadores', e.admin, '&sede_id=no-es-un-id')).estado).toBe(400);
    expect((await pedir('/indicadores', e.admin, '&periodo_numero=99')).estado).toBe(400);
  });

  it('un año que no existe responde 404', async () => {
    const respuesta = await fetch(`${base}/dashboard/indicadores?academic_year_id=${n.grupoId}`, { headers: { Authorization: `Bearer ${generateToken(e.admin)}` } });
    expect(respuesta.status).toBe(404);
  });

  it('indicadores: matrícula contra cupos y rendimiento provisional con las notas cerradas', async () => {
    const { cuerpo } = await pedir('/indicadores', e.admin);
    const d = cuerpo.data;
    expect(d.matricula).toMatchObject({ matriculados: 3, capacidad: 40, disponibles: 37, ocupacion_pct: 7.5, preinscritos: 0 });
    // Con el año en curso nadie tiene cierre de promoción: el 50 % es «sin asignaturas perdidas» entre quienes ya tienen notas (el tercero no cuenta).
    expect(d.rendimiento).toEqual({ modo: 'PROVISIONAL', aprobacion_pct: 50, reprobacion_pct: 50, base: 2 });
    expect(d.asistencia).toMatchObject({ asistencia_pct: null, registros: 0 });
    expect(d.planillas).toMatchObject({ periodo_numero: 1, clases_total: 1, clases_cerradas: 0, notas_esperadas: 3, notas_cerradas: 2 });
    expect(d.contexto).toMatchObject({ academic_year_id: n.anioId, periodo_notas: 1, grupos: 1 });
  });

  it('un retirado sale de la matrícula y entra a la columna de retirados de su grado', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    const indicadores = (await pedir('/indicadores', e.admin)).cuerpo.data;
    expect(indicadores.matricula.matriculados).toBe(2);
    const eficiencia = (await pedir('/eficiencia', e.admin)).cuerpo.data;
    expect(eficiencia.filas).toHaveLength(1);
    expect(eficiencia.filas[0]).toMatchObject({ grado: 'Sexto', grado_numero: 6, matriculados: 2, retirados: 1, sin_perdidas: 1, con_perdidas: 1 });
    expect(eficiencia.totales).toMatchObject({ matriculados: 2, retirados: 1 });
  });

  it('eficiencia: tras el cierre de promoción cuenta el resultado oficial, y quien espera recuperación sigue como pendiente', async () => {
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    for (const periodo of [2, 3, 4]) {
      await notaCerrada(e.estudiante._id, 4, periodo);
      await notaCerrada(e.otroEstudiante._id, 2, periodo);
    }
    await cerrarGrupo(n.anioId, n.grupoId, 'CIERRE', CLAVE, e.admin);
    vaciarCacheCorta();

    const { rendimiento, filas } = (await pedir('/eficiencia', e.admin)).cuerpo.data;
    // Con la política de partida, quien pierde una asignatura va a recuperación: todavía no hay resultado final de todos, así que sigue provisional.
    expect(filas[0]).toMatchObject({ matriculados: 2, retirados: 1, promovidos: 1, pendientes: 1, no_promovidos: 0 });
    expect(rendimiento).toEqual({ modo: 'PROVISIONAL', aprobacion_pct: 50, reprobacion_pct: 50, base: 2 });
  }, 60_000);

  it('filtrar por una sede sin grupos devuelve ceros y no un error', async () => {
    const rural = await Campus.findOne({ es_principal: { $ne: true } });
    const { estado, cuerpo } = await pedir('/indicadores', e.admin, `&sede_id=${rural!._id}`);
    expect(estado).toBe(200);
    expect(cuerpo.data.matricula).toMatchObject({ matriculados: 0, capacidad: 0, ocupacion_pct: null });
    expect(cuerpo.data.rendimiento.modo).toBe('SIN_DATOS');
  });

  it('morbilidad: con tan pocos evaluados no hay ranking, y dice cuál es el mínimo', async () => {
    const { cuerpo } = await pedir('/morbilidad', e.admin);
    expect(cuerpo.data.asignaturas).toEqual([]);
    expect(cuerpo.data.minimo_evaluados).toBe(8);
    expect(cuerpo.data.reprobacion_pct).toBe(50);
  });

  it('entrega de notas: cuenta lo cerrado y lista al docente con la planilla pendiente', async () => {
    const { cuerpo } = await pedir('/coordinacion/entrega-notas', e.coordAcademico);
    const d = cuerpo.data;
    expect(d.avance).toMatchObject({ clases_total: 1, clases_cerradas: 0, notas_esperadas: 3, notas_cerradas: 2, notas_pct: 66.7 });
    expect(d.pendientes.total).toBe(1);
    expect(d.pendientes.docentes[0]).toMatchObject({ docente_id: String(e.docenteDeClase._id), pendientes: 1 });
    expect(d.pendientes.docentes[0].clases[0]).toMatchObject({ cerradas: 2, estudiantes: 3 });

    await notaCerrada(e.tercerEstudiante._id, 3.5);
    vaciarCacheCorta();
    const cerrada = (await pedir('/coordinacion/entrega-notas', e.coordAcademico)).cuerpo.data;
    expect(cerrada.avance).toMatchObject({ clases_cerradas: 1, clases_pct: 100 });
    expect(cerrada.pendientes.total).toBe(0);
  });

  it('desempeño y comparativo salen de las notas cerradas del periodo', async () => {
    const desempeno = (await pedir('/coordinacion/desempeno', e.admin)).cuerpo.data;
    expect(desempeno.total).toBe(2);
    const porNivel = Object.fromEntries(desempeno.niveles.map((x: { nivel: string; total: number }) => [x.nivel, x.total]));
    expect(porNivel).toEqual({ SUPERIOR: 0, ALTO: 1, BASICO: 0, BAJO: 1 });
    // Con un solo grupo por grado no hay nada que comparar.
    expect((await pedir('/coordinacion/comparativo', e.admin)).cuerpo.data.grados).toEqual([]);
  });

  it('riesgo: usa los umbrales del colegio y no llena la bitácora con una consulta por cada carga', async () => {
    const antes = await AuditLog.countDocuments({ accion: 'COMISION_TABLERO_CONSULTADO' });
    const { cuerpo } = await pedir('/coordinacion/riesgo', e.coordAcademico);
    expect(cuerpo.data.umbrales).toEqual({ perdidas_rojo_desde: 3, inasistencia_roja_pct: 20 });
    expect(cuerpo.data.resumen.total).toBeGreaterThan(0);
    expect(cuerpo.data.estudiantes).toEqual([]);
    expect(await AuditLog.countDocuments({ accion: 'COMISION_TABLERO_CONSULTADO' })).toBe(antes);
  });

  it('servicio social: sin grupos de décimo ni once no hay estudiantes que contar', async () => {
    const { cuerpo } = await pedir('/coordinacion/servicio-social', e.admin);
    expect(cuerpo.data).toMatchObject({ estudiantes: 0, aprobados: 0, pendientes: 0 });
    expect(cuerpo.data.por_grado).toEqual([]);
  });

  it('recuperaciones y alertas responden con su forma aunque no haya nada pendiente', async () => {
    const recuperaciones = (await pedir('/coordinacion/recuperaciones', e.admin)).cuerpo.data;
    expect(recuperaciones.periodo).toMatchObject({ periodo_numero: 1 });
    expect(recuperaciones.anual).toBeNull();
    const alertas = (await pedir('/coordinacion/alertas', e.admin)).cuerpo.data;
    expect(alertas).toMatchObject({ justificaciones_pendientes: 0, sesiones_sin_realizar: 0 });
  });

  it('reutiliza lo calculado unos segundos: un cambio inmediato no se ve hasta que vence la caché', async () => {
    const primero = (await pedir('/indicadores', e.admin)).cuerpo.data;
    await Enrollment.updateOne({ student_id: e.tercerEstudiante._id }, { estado: 'RETIRADO' });
    const segundo = (await pedir('/indicadores', e.admin)).cuerpo.data;
    expect(segundo.matricula.matriculados).toBe(primero.matricula.matriculados);
  });
});
