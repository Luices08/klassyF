/**
 * Fase «preparar año» (enero, antes de clases): calendario, escala y molde de la planilla, grupos con su salón, plan de
 * estudios, carga docente, líderes y planes de área, horarios publicados y las políticas de promoción y recuperación.
 * Todo por la API, como lo haría el ADMIN o coordinación desde la pantalla.
 */
import { irA } from '../nucleo/reloj';
import { como } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { registro } from '../nucleo/registro';
import { archivoPdf } from '../nucleo/archivos';
import { aLaHora, diaDelAnio } from '../nucleo/fechas';
import { asignarCarga } from '../logica/asignadorCarga';
import { asignaturaDe, claveJornada, ConfigSimulacion, planDeGrado, VariableHorarioConfig } from '../configuracion';
import { admin, coordinacion, ContextoFase, docente, eventosDelAnio, periodosDelAnio } from './comun';

interface Id {
  _id: string;
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const grupoClave = (anio: number, nomenclatura: string) => `grupo:${anio}:${nomenclatura}`;

/** El año ya existe si lo creó el asistente de la institución (el primero) o el cierre del anterior; si no, se crea. */
async function asegurarAnio(ctx: ContextoFase, anio: number): Promise<string> {
  const existente = await registro.leerOpcional<string>(`anio:${anio}`);
  if (existente) return existente;
  const { data } = await como(await admin()).post<Id>('/academic-years', {
    year: anio,
    calendario: ctx.config.calendario.calendario,
    periodos: periodosDelAnio(ctx.config, anio),
  });
  await registro.guardar(`anio:${anio}`, data._id);
  return data._id;
}

async function configurarCalendario(ctx: ContextoFase, anio: number, anioId: string): Promise<void> {
  const api = como(await admin());
  const { config } = ctx;
  await api.patch(`/academic-years/${anioId}`, {
    nombre: `Año lectivo ${anio}`,
    calendario: config.calendario.calendario,
    fecha_inicio: diaDelAnio(anio, config.calendario.inicio_anio),
    fecha_fin: diaDelAnio(anio, config.calendario.fin_anio),
    periodos: periodosDelAnio(config, anio),
  });
  const eventos = eventosDelAnio(config, anio);
  for (const e of eventos) await api.post(`/academic-years/${anioId}/eventos`, e);
  await api.patch(`/academic-years/${anioId}/escala-evaluacion`, {
    nota_minima: config.escala.minima,
    nota_maxima: config.escala.maxima,
    nota_aprobatoria: config.escala.aprobatoria,
    precision_decimales: config.escala.decimales,
    rangos: config.escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.minimo, valor_maximo: r.maximo, es_aprobatorio: r.aprobatorio })),
  });
  await api.patch(`/academic-years/${anioId}/componentes-evaluativos`, config.molde_planilla);
  ctx.log(`Calendario ${anio}: ${eventos.length} eventos, escala y molde de la planilla.`);
}

async function crearGrupos(ctx: ContextoFase, anio: number, anioId: string): Promise<void> {
  const api = como(await admin());
  let total = 0;
  for (const g of ctx.config.grupos) {
    for (const nomenclatura of g.nomenclaturas) {
      const { data } = await api.post<Id>('/groups', {
        sede_id: await registro.leer(`sede:${g.sede}`),
        academic_year_id: anioId,
        grade_id: await registro.leer(`grado:${g.grado}`),
        jornada_id: await registro.leer(`jornada:${claveJornada(g.sede, g.jornada)}`),
        nomenclatura,
        max_capacity: g.cupo,
        aula_id: await registro.leer(`aula:${nomenclatura}`),
      });
      await registro.guardar(grupoClave(anio, nomenclatura), data._id);
      total += 1;
    }
  }
  ctx.log(`Grupos ${anio}: ${total}.`);
}

async function cargarPlanDeEstudios(ctx: ContextoFase, anioId: string): Promise<void> {
  const api = como(await admin());
  const institucionId = await registro.leer('institucion');
  const { config } = ctx;
  const grados = config.grupos.map((g) => g.grado);
  for (const plan of config.plan_estudios) {
    const ofrecidos = plan.grados.filter((g) => grados.includes(g));
    if (ofrecidos.length === 0) continue;
    const asignaturas = await Promise.all(
      Object.entries(plan.asignaturas).map(async ([clave, horas]) => ({ subject_id: await registro.leer(`asignatura:${clave}`), intensidad_horaria_semanal: horas }))
    );
    await api.post('/curriculum/study-plan/asignaturas-grados', {
      institucion_id: institucionId,
      academic_year_id: anioId,
      grados: await Promise.all(ofrecidos.map(async (g) => ({ grade_id: await registro.leer(`grado:${g}`), asignaturas }))),
    });
    for (const p of plan.ponderaciones ?? []) {
      for (const g of ofrecidos) {
        await api.post('/curriculum/study-plan/evaluacion-area', {
          institucion_id: institucionId,
          academic_year_id: anioId,
          grade_id: await registro.leer(`grado:${g}`),
          area_id: await registro.leer(`area:${p.area}`),
          metodo_calculo: 'PONDERADO',
          asignaturas: await Promise.all(Object.entries(p.asignaturas).map(async ([clave, porcentaje]) => ({ subject_id: await registro.leer(`asignatura:${clave}`), porcentaje }))),
        });
      }
    }
  }
  ctx.log('Plan de estudios y ponderaciones cargados.');
}

/** Reparte la carga (función pura) y la guarda grupo por grupo, como la «Matriz por curso» de coordinación. */
async function cargarCargaDocente(ctx: ContextoFase, anio: number, anioId: string): Promise<Map<string, number>> {
  const { config } = ctx;
  const grupos = config.grupos.flatMap((g) => g.nomenclaturas.map((clave) => ({ clave, grado: g.grado, sede: g.sede })));
  const carga = asignarCarga(grupos, (grado) => planDeGrado(config, grado).asignaturas, config.docentes.plazas, config.docentes.horas_min, config.docentes.horas_max);
  const api = como(await coordinacion());
  for (const g of grupos) {
    const director = carga.directores.get(g.clave) as string;
    await api.post('/teacher-assignments/grupo-carga', {
      group_id: await registro.leer(grupoClave(anio, g.clave)),
      academic_year_id: anioId,
      director_grupo_id: await registro.leer(`usuario:${director}`),
      horas_direccion: 0,
      asignaciones: await Promise.all(
        carga.asignaciones.filter((a) => a.grupo === g.clave).map(async (a) => ({ subject_id: await registro.leer(`asignatura:${a.asignatura}`), docente_id: await registro.leer(`usuario:${a.docente}`) }))
      ),
    });
  }
  // Horas de cada docente por área: decide quién lidera cada una.
  const porArea = new Map<string, number>();
  for (const a of carga.asignaciones) {
    const area = asignaturaDe(config, a.asignatura).area;
    porArea.set(`${area}|${a.docente}`, (porArea.get(`${area}|${a.docente}`) ?? 0) + a.horas);
  }
  const resumen = [...carga.horas.values()];
  ctx.log(`Carga docente ${anio}: ${carga.asignaciones.length} asignaciones, ${Math.min(...resumen)}–${Math.max(...resumen)} h por docente.`);
  return porArea;
}

/**
 * Un líder por área (quien más horas dicta en ella; el cargo dura entre años). Cada líder radica su plan de área y coordinación lo
 * revisa: algunos se devuelven con comentario y se aprueban en la segunda versión, como pasa en un colegio real.
 */
async function planesDeArea(ctx: ContextoFase, anio: number, anioId: string, porArea: Map<string, number>): Promise<void> {
  const azar = azarPara(ctx.semilla, 'planes-area', anio);
  const coord = como(await coordinacion());
  const areasDictadas = [...new Set([...porArea.keys()].map((k) => k.split('|')[0] as string))];
  let devueltos = 0;
  for (const area of areasDictadas) {
    let liderId = await registro.leerOpcional<string>(`lider:${area}`);
    let plaza = await registro.leerOpcional<string>(`lider-plaza:${area}`);
    if (!liderId || !plaza) {
      plaza = [...porArea.entries()].filter(([k]) => k.startsWith(`${area}|`)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0].split('|')[1] as string;
      const { data } = await coord.post<Id>('/planeacion/lideres-area', { area_id: await registro.leer(`area:${area}`), docente_id: await registro.leer(`usuario:${plaza}`) });
      liderId = data._id;
      await registro.guardar(`lider:${area}`, liderId);
      await registro.guardar(`lider-plaza:${area}`, plaza);
    }
    const nombreArea = ctx.config.areas.find((a) => a.codigo === area)?.nombre ?? area;
    const lider = como(await docente(plaza));
    const radicar = async (version: number) => {
      const archivo = await archivoPdf(`plan-area-${area.toLowerCase()}-${anio}-v${version}`, `Plan de área ${nombreArea} ${anio}`, [`Versión ${version}.`, 'Objetivos, contenidos por grado, criterios de evaluación y recursos.']);
      const { data } = await lider.subir<Id>('/planeacion/planes-area', archivo, {
        academic_year_id: anioId,
        lider_area_id: liderId,
        titulo: `Plan de área de ${nombreArea} ${anio}`,
        descripcion: version === 1 ? `Plan anual del área de ${nombreArea}.` : 'Versión ajustada con las observaciones de coordinación.',
      });
      return data._id;
    };
    let planId = await radicar(1);
    if (azar.prob(0.15)) {
      await coord.patch(`/planeacion/planes-area/${planId}/revision`, { decision: 'DEVUELTO', comentario: 'Falta detallar los criterios de evaluación por grado y los ajustes para estudiantes con apoyos.' });
      planId = await radicar(2);
      devueltos += 1;
    }
    await coord.patch(`/planeacion/planes-area/${planId}/revision`, { decision: 'APROBADO', comentario: 'Aprobado.' });
  }
  ctx.log(`Planes de área ${anio}: ${areasDictadas.length} aprobados (${devueltos} devueltos una vez).`);
}

/** Celdas NO_DISPONIBLE de una variable de disponibilidad; `solo_disponible` se invierte sobre las franjas de clase de la jornada. */
function celdasNoDisponibles(config: ConfigSimulacion, v: VariableHorarioConfig): Array<{ dia: number; periodo: number; valor: 'NO_DISPONIBLE' }> {
  const [sedeClave, nombreJornada] = v.jornada.split(':');
  const jornada = config.sedes.find((s) => s.clave === sedeClave)?.jornadas.find((j) => j.nombre === nombreJornada);
  if (!jornada) throw new Error(`La variable «${v.descripcion}» es de una jornada que no existe.`);
  const clases = jornada.franjas.filter((f) => f.tipo === 'CLASE').length;
  const enLista = (lista: VariableHorarioConfig['no_disponible'], dia: number, periodo: number) => (lista ?? []).some((c) => c.dias.includes(dia) && c.periodos.includes(periodo));
  const celdas: Array<{ dia: number; periodo: number; valor: 'NO_DISPONIBLE' }> = [];
  for (const dia of jornada.dias) {
    for (let periodo = 0; periodo < clases; periodo += 1) {
      const bloqueada = v.solo_disponible ? !enLista(v.solo_disponible, dia, periodo) : enLista(v.no_disponible, dia, periodo);
      if (bloqueada) celdas.push({ dia, periodo, valor: 'NO_DISPONIBLE' });
    }
  }
  return celdas;
}

async function crearVariablesHorario(ctx: ContextoFase, anioId: string): Promise<void> {
  const api = como(await coordinacion());
  for (const v of ctx.config.horarios.variables) {
    const [sede, jornada] = v.jornada.split(':') as [string, string];
    const gradeIds = await Promise.all((v.grados ?? []).map((g) => registro.leer(`grado:${g}`)));
    await api.post('/horarios/variables', {
      academic_year_id: anioId,
      jornada_id: await registro.leer(`jornada:${claveJornada(sede, jornada)}`),
      tipo: v.tipo,
      descripcion: v.descripcion,
      severidad: 'DURA',
      alcance: gradeIds.length > 0 ? { tipo: 'GRADOS', grade_ids: gradeIds } : { tipo: 'GLOBAL', grade_ids: [] },
      asignatura_ids: await Promise.all((v.asignaturas ?? []).map((a) => registro.leer(`asignatura:${a}`))),
      docente_ids: await Promise.all((v.docentes ?? []).map((d) => registro.leer(`usuario:${d}`))),
      parametros: v.tipo === 'DISPONIBILIDAD' ? { celdas: celdasNoDisponibles(ctx.config, v) } : { bloques: v.bloques ?? [] },
    });
  }
}

interface HorarioVista {
  _id: string;
  estado: string;
  conflictos_duros: number;
  error_generacion?: string | null;
}

/** Genera cada jornada en el orden de la configuración (la segunda respeta a la primera) y publica la primera versión sin conflictos duros. */
async function generarHorarios(ctx: ContextoFase, anio: number, anioId: string): Promise<void> {
  const api = como(await coordinacion());
  const adminApi = como(await admin());
  const { horarios } = ctx.config;
  for (const clave of horarios.orden) {
    const jornadaId = await registro.leer(`jornada:${clave}`);
    let publicado = false;
    for (let intento = 1; intento <= horarios.intentos && !publicado; intento += 1) {
      const { data: creado } = await api.post<HorarioVista>('/horarios/generar', {
        academic_year_id: anioId,
        jornada_id: jornadaId,
        nombre: `Horario ${anio} (intento ${intento})`,
        semilla: azarPara(ctx.semilla, 'horario', anio, clave, intento).entero(1, 2 ** 31 - 2),
        tiempo_max_ms: horarios.tiempo_max_ms,
      });
      let horario = creado;
      const limite = Date.now() + horarios.tiempo_max_ms + 60_000;
      while (horario.estado === 'GENERANDO') {
        if (Date.now() > limite) throw new Error(`El horario de ${clave} no terminó de generarse.`);
        await espera(1000);
        horario = (await api.get<{ horario: HorarioVista }>(`/horarios/${creado._id}`)).data.horario;
      }
      if (horario.estado !== 'BORRADOR' || horario.conflictos_duros > 0) {
        ctx.log(`Horario ${clave}, intento ${intento}: ${horario.estado}, ${horario.conflictos_duros} conflictos duros${horario.error_generacion ? ` (${horario.error_generacion})` : ''}.`);
        continue;
      }
      await adminApi.post(`/horarios/${horario._id}/publicar`, { confirm_password: ctx.claveAdmin });
      publicado = true;
    }
    if (!publicado) throw new Error(`No se logró un horario sin conflictos duros para ${clave} en ${horarios.intentos} intentos.`);
  }
  ctx.log(`Horarios ${anio}: ${horarios.orden.length} jornadas publicadas.`);
}

type Objeto = Record<string, unknown>;

/** Se parte de la política que devuelve el sistema (la heredada o la de partida) y solo se cambia lo que el colegio decidió. */
async function configurarPoliticas(ctx: ContextoFase, anioId: string): Promise<void> {
  const api = como(await admin());
  const { config } = ctx;
  const { data: promocion } = await api.get<Objeto>(`/promocion/politica/${anioId}`);
  const titulacion = promocion.titulacion as Objeto;
  await api.put(`/promocion/politica/${anioId}`, {
    ...promocion,
    unidad: 'ASIGNATURA',
    inasistencia: { ...(promocion.inasistencia as Objeto), activa: false },
    umbrales: { ...(promocion.umbrales as Objeto), recuperacion_hasta: config.promocion.recuperacion_hasta, efecto_nota_recuperacion: config.promocion.efecto_nota_recuperacion },
    titulacion: {
      ...titulacion,
      servicio_social: { ...(titulacion.servicio_social as Objeto), activo: true, horas_requeridas: config.promocion.servicio_social_horas, alerta_desde_grado: 10 },
    },
    texto_siee: config.promocion.texto_siee,
  });

  const { data: recuperacion } = await api.get<Objeto>(`/recuperaciones/politica/${anioId}`);
  const rp = config.recuperacion_periodo;
  const periodo = recuperacion.periodo as Objeto;
  await api.put(`/recuperaciones/politica/${anioId}`, {
    ...recuperacion,
    periodos: config.calendario.periodos.map((p) => ({ periodo_numero: p.numero, aplica: rp.aplica, momento: rp.momento })),
    periodo: { ...periodo, efecto: rp.efecto, max_intentos: rp.max_intentos },
  });
  ctx.log('Políticas de promoción y recuperación configuradas.');
}

export async function fasePrepararAnio(ctx: ContextoFase, anio: number): Promise<void> {
  irA(aLaHora(diaDelAnio(anio, '01-08'), '08:00'));
  const anioId = await asegurarAnio(ctx, anio);
  await configurarCalendario(ctx, anio, anioId);
  await crearGrupos(ctx, anio, anioId);
  await cargarPlanDeEstudios(ctx, anioId);
  const porArea = await cargarCargaDocente(ctx, anio, anioId);
  await planesDeArea(ctx, anio, anioId, porArea);
  await crearVariablesHorario(ctx, anioId);
  await generarHorarios(ctx, anio, anioId);
  await configurarPoliticas(ctx, anioId);
}
