/**
 * Fase de un periodo: coordinación lo abre, cada docente programa sus actividades (publicándolas en todos sus grupos de la misma
 * asignatura y grado), los estudiantes entregan las digitales, el docente califica cada una unos días después, pone autoevaluación,
 * coevaluación y comportamiento y cierra su planilla; coordinación declara las definitivas, los docentes registran las
 * recuperaciones del periodo y coordinación lo cierra. Preescolar lleva valoración descriptiva en lugar de notas. Al final se
 * radican los planes de aula del periodo siguiente.
 *
 * Todo ocurre en orden cronológico: cada acción es un evento con su fecha y el reloj salta a ella antes de llamar a la API.
 */
import { irA } from '../nucleo/reloj';
import { como, Cliente } from '../nucleo/api';
import { azarPara } from '../nucleo/azar';
import { perfiles, registro } from '../nucleo/registro';
import { aLaHora, diaDelAnio, sumarDias } from '../nucleo/fechas';
import { Latentes } from '../logica/perfiles';
import {
  ActividadPlaneada,
  decidirEntrega,
  diasLectivos,
  intentoDeRecuperacion,
  moverLectivos,
  nivelDescriptivo,
  nivelEsperado,
  notaDeActividad,
  notasFormativas,
  planearActividades,
  PerfilDeAnio,
} from '../logica/notas';
import { ContextoFase, coordinacion, eventosDelAnio, secretaria } from './comun';
import { radicarPlanesDeAula } from './planeacion';

interface AsignacionVista {
  _id: string;
  horas_semanales: number;
  docente_id: { _id: string };
  subject_id: { _id: string; nombre: string };
  group_id: { _id: string; nomenclatura: string; grade_id: { _id: string; numero: number } };
}

interface MatriculaVista {
  estado: string;
  student_id: { _id: string } | string;
}

interface Evento {
  cuando: Date;
  correr: () => Promise<void>;
}

interface Clase {
  asignacion: AsignacionVista;
  docente: Cliente;
  clave: string;
  tipoNota: string;
  grado: number;
  estudiantes: string[];
  /** Casillas de la planilla: id de la actividad (o nota suelta) y lo que se planeó para ella. */
  actividades: Array<{ id: string; plan: ActividadPlaneada }>;
  esperado: Map<string, number>;
}

const ESTADOS_ACTIVOS = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'];

const RESPUESTAS = [
  'Adjunto mi desarrollo de la actividad con las respuestas a cada punto.',
  'Respondí las preguntas del taller y expliqué el procedimiento.',
  'Aquí está mi trabajo. Tuve dudas en el último punto.',
  'Entrego la actividad completa según las indicaciones de clase.',
];

const TEXTOS_DESCRIPTIVOS: Record<string, { fortalezas: string; recomendaciones: string }> = {
  ALCANZADO: {
    fortalezas: 'Participa con entusiasmo, sigue instrucciones y expresa sus ideas con claridad.',
    recomendaciones: 'Seguir proponiéndole retos y lecturas en casa para mantener su motivación.',
  },
  EN_PROCESO: {
    fortalezas: 'Muestra interés por las actividades y avanza en la construcción de sus aprendizajes.',
    recomendaciones: 'Acompañar en casa las rutinas de lectura y conteo, y reforzar la atención en clase.',
  },
  INICIADO: {
    fortalezas: 'Se relaciona bien con sus compañeros y disfruta las actividades lúdicas.',
    recomendaciones: 'Requiere acompañamiento constante en casa y en el aula para afianzar los procesos básicos.',
  },
};

function asignaturasPorClave(ctx: ContextoFase): Map<string, string> {
  const tipos = new Map<string, string>();
  for (const area of ctx.config.areas) for (const a of area.asignaturas) tipos.set(a.clave, a.tipo_nota);
  return tipos;
}

/**
 * Ejecuta los eventos en orden de fecha, moviendo el reloj a cada uno. Un evento puede agendar otros (en `nuevos`): se suman a la
 * fila en cuanto aparecen, así una entrega nunca corre antes que la actividad que la origina ni después de su calificación.
 */
async function ejecutar(eventos: Evento[], nuevos: Evento[] = []): Promise<void> {
  const fila = [...eventos];
  while (fila.length > 0) {
    // Orden estable: a igual fecha, primero lo que se agendó primero.
    let i = 0;
    for (let k = 1; k < fila.length; k += 1) if ((fila[k] as Evento).cuando < (fila[i] as Evento).cuando) i = k;
    const [e] = fila.splice(i, 1) as [Evento];
    irA(e.cuando);
    await e.correr();
    if (nuevos.length > 0) fila.push(...nuevos.splice(0));
  }
}

async function cargarClases(ctx: ContextoFase, anio: number, anioId: string, periodo: number): Promise<Clase[]> {
  const coord = como(await coordinacion());
  const secre = como(await secretaria());
  const { data: asignaciones } = await coord.get<AsignacionVista[]>('/teacher-assignments', { academic_year_id: anioId, tipo_asignacion: 'CLASE', estado: 'activo' });
  const claveDeAsignatura = new Map([...(await registro.porPrefijo('asignatura:')).entries()].map(([clave, id]) => [id, clave]));
  const plazaDe = new Map([...(await registro.porPrefijo('usuario:')).entries()].map(([clave, id]) => [id, clave]));
  const tipos = asignaturasPorClave(ctx);

  const perfilDe = new Map<string, PerfilDeAnio>();
  for (const p of await perfiles.todos()) {
    const delAnio = p.por_anio.find((x) => x.anio === anio);
    if (delAnio) perfilDe.set(p.student_id, { categoria: delAnio.categoria, latentes: delAnio.latentes as unknown as Latentes });
  }

  const estudiantesDe = new Map<string, string[]>();
  for (const a of asignaciones) {
    const grupoId = a.group_id._id;
    if (estudiantesDe.has(grupoId)) continue;
    const { data } = await secre.get<MatriculaVista[]>('/enrollments', { academic_year_id: anioId, group_id: grupoId, limit: 100 });
    estudiantesDe.set(
      grupoId,
      data.filter((m) => ESTADOS_ACTIVOS.includes(m.estado)).map((m) => (typeof m.student_id === 'string' ? m.student_id : m.student_id._id))
    );
  }

  return asignaciones.map((a) => {
    const clave = claveDeAsignatura.get(a.subject_id._id) ?? '';
    const tipoNota = tipos.get(clave) ?? 'MODERADA';
    const estudiantes = estudiantesDe.get(a.group_id._id) ?? [];
    const esperado = new Map<string, number>();
    for (const s of estudiantes) {
      const perfil = perfilDe.get(s);
      if (perfil) esperado.set(s, nivelEsperado(perfil, clave, tipoNota, periodo));
    }
    return {
      asignacion: a,
      docente: como({ id: a.docente_id._id, rol: 'DOCENTE', etiqueta: `docente ${plazaDe.get(a.docente_id._id) ?? a.docente_id._id}` }),
      clave,
      tipoNota,
      grado: a.group_id.grade_id.numero,
      estudiantes,
      actividades: [],
      esperado,
    };
  });
}

export async function fasePeriodo(ctx: ContextoFase, anio: number, periodo: number): Promise<void> {
  const { config } = ctx;
  const anioId = await registro.leer(`anio:${anio}`);
  const datosPeriodo = config.calendario.periodos.find((p) => p.numero === periodo);
  if (!datosPeriodo) throw new Error(`La configuración no tiene periodo ${periodo}.`);
  const inicio = diaDelAnio(anio, datosPeriodo.inicio);
  const fin = diaDelAnio(anio, datosPeriodo.fin);
  const noLectivos = eventosDelAnio(config, anio)
    .filter((e) => ['VACACIONES', 'RECESO', 'DESARROLLO_INSTITUCIONAL'].includes(e.tipo))
    .map((e) => ({ inicio: e.fecha_inicio, fin: e.fecha_fin }));
  const lectivos = diasLectivos(inicio, fin, noLectivos);
  const coord = como(await coordinacion());
  const semilla = ctx.semilla;

  irA(aLaHora(inicio, '06:30'));
  await coord.patch(`/academic-years/${anioId}/periodos/${periodo}/estado`, { estado: 'ABIERTO' });
  const clases = await cargarClases(ctx, anio, anioId, periodo);
  const conNotas = clases.filter((c) => c.grado > 0);
  const preescolar = clases.filter((c) => c.grado === 0);
  ctx.log(`Periodo ${periodo} ${anio} abierto: ${conNotas.length} clases con planilla y ${preescolar.length} de Preescolar.`);

  // 1. Actividades: el docente planea una vez por asignatura y grado, y publica lo mismo en todos sus grupos.
  const juegos = new Map<string, Clase[]>();
  for (const c of conNotas) {
    const k = `${c.asignacion.docente_id._id}|${c.asignacion.subject_id._id}|${c.grado}`;
    juegos.set(k, [...(juegos.get(k) ?? []), c]);
  }
  const ventanaActividades = lectivos.slice(4, Math.max(5, lectivos.length - 12));
  const contadores = { actividades: 0, entregas: 0, tardias: 0, calificaciones: 0, omitidas: 0 };

  const eventos: Evento[] = [];
  const eventosEntregas: Evento[] = [];
  for (const [k, grupoClases] of juegos) {
    const primera = grupoClases[0] as Clase;
    const plan = planearActividades(ventanaActividades, primera.asignacion.horas_semanales, primera.grado, azarPara(semilla, 'actividades', anio, periodo, k));
    for (const p of plan) {
      eventos.push({
        cuando: aLaHora(p.apertura, '06:30'),
        correr: async () => {
          const respuesta = await primera.docente.post<{ _id: string; teacher_assignment_id: string }>('/activities', {
            teacher_assignment_id: primera.asignacion._id,
            periodo_numero: periodo,
            titulo: tituloDe(p, primera.asignacion.subject_id.nombre),
            descripcion: descripcionDe(p),
            tipo: p.tipo,
            componente_siee: 'HETERO',
            peso_en_componente: p.peso,
            fecha_apertura: aLaHora(p.apertura, '06:30').toISOString(),
            fecha_entrega: aLaHora(p.entrega, '23:59').toISOString(),
            requiere_entrega: p.digital,
            formatos_permitidos: [],
            permite_entrega_tardia: p.digital,
            grupos_adicionales: grupoClases.slice(1).map((c) => c.asignacion._id),
            confirmar_alertas: true,
          });
          const extra = respuesta as unknown as { copias?: Array<{ _id: string; teacher_assignment_id: string }>; omitidas?: unknown[] };
          contadores.omitidas += extra.omitidas?.length ?? 0;
          for (const a of [respuesta.data, ...(extra.copias ?? [])]) {
            const clase = grupoClases.find((c) => c.asignacion._id === String(a.teacher_assignment_id));
            if (!clase) continue;
            clase.actividades.push({ id: a._id, plan: p });
            contadores.actividades += 1;
            if (p.digital) programarEntregas(clase, a._id, p);
          }
          // Las entregas se programaron al publicar: se ejecutan en su propio turno cronológico.
        },
      });
      for (const clase of grupoClases) {
        eventos.push({
          cuando: aLaHora(moverLectivos(lectivos, p.entrega, 4), '16:00'),
          correr: async () => {
            const actividad = clase.actividades.find((x) => x.plan === p);
            if (!actividad) return;
            const celdas = clase.estudiantes.flatMap((s) => {
              const perfil = latentesDe(clase, s);
              if (!perfil) return [];
              const azar = azarPara(semilla, 'nota', anio, periodo, actividad.id, s);
              const entrega = decisionDe(clase, actividad.id, p, s, perfil);
              return [{ student_id: s, casilla_id: actividad.id, nota: notaDeActividad(clase.esperado.get(s) ?? 3, perfil, clase.tipoNota, p.tipo, entrega, azar) }];
            });
            if (celdas.length === 0) return;
            await clase.docente.put('/notas/planilla', { teacher_assignment_id: clase.asignacion._id, periodo_numero: periodo, celdas });
            contadores.calificaciones += celdas.length;
          },
        });
      }
    }
  }

  const perfilPorEstudiante = new Map<string, Latentes>();
  for (const p of await perfiles.todos()) {
    const delAnio = p.por_anio.find((x) => x.anio === anio);
    if (delAnio) perfilPorEstudiante.set(p.student_id, delAnio.latentes as unknown as Latentes);
  }
  const latentesDe = (_clase: Clase, s: string) => perfilPorEstudiante.get(s) ?? null;
  const decisionDe = (_clase: Clase, actividadId: string, p: ActividadPlaneada, s: string, latentes: Latentes) =>
    decidirEntrega(latentes, p.tipo, azarPara(semilla, 'entrega', anio, periodo, actividadId, s));

  const programarEntregas = (clase: Clase, actividadId: string, p: ActividadPlaneada) => {
    for (const s of clase.estudiantes) {
      const latentes = perfilPorEstudiante.get(s);
      if (!latentes) continue;
      const decision = decisionDe(clase, actividadId, p, s, latentes);
      if (!decision.entrega) continue;
      const azar = azarPara(semilla, 'momento-entrega', anio, periodo, actividadId, s);
      const dia = decision.tarde ? sumarDias(p.entrega, azar.entero(1, 3)) : moverLectivos(lectivos, p.apertura, azar.entero(0, Math.max(0, lectivos.indexOf(p.entrega) - lectivos.indexOf(p.apertura))));
      const cuando = aLaHora(dia, `${String(azar.entero(14, 21)).padStart(2, '0')}:${String(azar.entero(0, 59)).padStart(2, '0')}`);
      eventosEntregas.push({
        cuando,
        correr: async () => {
          await como({ id: s, rol: 'ESTUDIANTE', etiqueta: `estudiante ${s}` }).post(`/activities/${actividadId}/submissions`, { texto_entrega: azar.elegir(RESPUESTAS) });
          contadores.entregas += 1;
          if (decision.tarde) contadores.tardias += 1;
        },
      });
    }
  };

  // Publicar una actividad agenda sus entregas: se suman a la fila en cuanto aparecen, siempre en orden de fecha.
  await ejecutar(eventos, eventosEntregas);
  ctx.log(
    `Periodo ${periodo}: ${contadores.actividades} actividades, ${contadores.entregas} entregas (${contadores.tardias} tarde) y ${contadores.calificaciones} notas de actividades${contadores.omitidas ? `; ${contadores.omitidas} copias omitidas` : ''}.`
  );

  // 2. Cierre: semana de digitación, notas formativas, cierre de planillas, definitivas, recuperaciones y cierre del periodo.
  const cierre: Evento[] = [];
  cierre.push({ cuando: aLaHora(moverLectivos(lectivos, fin, -10), '07:00'), correr: async () => void (await coord.patch(`/academic-years/${anioId}/periodos/${periodo}/estado`, { estado: 'EN_DIGITACION' })) });

  for (const clase of conNotas) {
    const azar = azarPara(semilla, 'cierre', anio, periodo, clase.asignacion._id);
    const diaFormativas = moverLectivos(lectivos, fin, -8 - azar.entero(0, 1));
    cierre.push({
      cuando: aLaHora(diaFormativas, `${String(azar.entero(8, 17)).padStart(2, '0')}:00`),
      correr: async () => {
        const base = { teacher_assignment_id: clase.asignacion._id, periodo_numero: periodo };
        const columnas: Record<string, string> = {};
        for (const [bloque, nombre] of [['AUTO', 'Autoevaluación'], ['COEV', 'Coevaluación'], ['COMP', 'Comportamiento']] as const) {
          const { data } = await clase.docente.post<{ _id: string }>('/notas/columnas', { ...base, bloque_clave: bloque, nombre });
          columnas[bloque] = data._id;
        }
        const celdas = clase.estudiantes.flatMap((s) => {
          const latentes = perfilPorEstudiante.get(s);
          if (!latentes) return [];
          const notas = notasFormativas(clase.esperado.get(s) ?? 3, latentes, azarPara(semilla, 'formativas', anio, periodo, clase.asignacion._id, s));
          return (['AUTO', 'COEV', 'COMP'] as const).map((b) => ({ student_id: s, casilla_id: columnas[b] as string, nota: notas[b] }));
        });
        if (celdas.length > 0) await clase.docente.put('/notas/planilla', { ...base, celdas });
      },
    });
    cierre.push({
      cuando: aLaHora(moverLectivos(lectivos, fin, -7 + azar.entero(0, 1)), `${String(azar.entero(7, 18)).padStart(2, '0')}:30`),
      correr: async () => void (await clase.docente.post('/notas/planilla/cerrar', { teacher_assignment_id: clase.asignacion._id, periodo_numero: periodo })),
    });
  }

  for (const clase of preescolar) {
    cierre.push({
      cuando: aLaHora(moverLectivos(lectivos, fin, -7), '11:00'),
      correr: async () => {
        const valoraciones = clase.estudiantes.map((s) => {
          const nivel = nivelDescriptivo(clase.esperado.get(s) ?? 3.5, azarPara(semilla, 'descriptiva', anio, periodo, clase.asignacion._id, s));
          return { student_id: s, nivel, ...(TEXTOS_DESCRIPTIVOS[nivel] as { fortalezas: string; recomendaciones: string }) };
        });
        if (valoraciones.length > 0) await clase.docente.put('/valoraciones-descriptivas/planilla', { teacher_assignment_id: clase.asignacion._id, periodo_numero: periodo, valoraciones });
      },
    });
  }

  let definitivas = 0;
  cierre.push({
    cuando: aLaHora(moverLectivos(lectivos, fin, -5), '15:00'),
    correr: async () => {
      const { data } = await coord.post<{ definitivas: number }>('/notas/definitivas', { academic_year_id: anioId, periodo_numero: periodo });
      definitivas = data.definitivas;
    },
  });

  const recuperaciones = { presentadas: 0, superadas: 0, candidatos: 0 };
  for (const clase of conNotas) {
    cierre.push({
      cuando: aLaHora(moverLectivos(lectivos, fin, -1), `${String(azarPara(semilla, 'hora-recuperacion', clase.asignacion._id).entero(7, 16)).padStart(2, '0')}:15`),
      correr: async () => {
        const { data } = await clase.docente.get<{ aplica: boolean; filas: Array<{ estudiante: { _id: string }; estado: string; habilitado: boolean }> }>('/recuperaciones', {
          academic_year_id: anioId,
          tipo: 'PERIODO',
          periodo_numero: periodo,
          teacher_assignment_id: clase.asignacion._id,
        });
        if (!data.aplica) return;
        for (const fila of data.filas.filter((f) => f.habilitado && f.estado === 'PENDIENTE')) {
          recuperaciones.candidatos += 1;
          const s = fila.estudiante._id;
          const latentes = perfilPorEstudiante.get(s);
          if (!latentes) continue;
          const nota = intentoDeRecuperacion(clase.esperado.get(s) ?? 2.5, latentes, azarPara(semilla, 'recuperacion', anio, periodo, clase.asignacion._id, s));
          if (nota === null) continue;
          await clase.docente.post('/recuperaciones/intentos', {
            teacher_assignment_id: clase.asignacion._id,
            student_id: s,
            tipo: 'PERIODO',
            periodo_numero: periodo,
            nota,
            observacion: 'Taller de refuerzo y sustentación.',
          });
          recuperaciones.presentadas += 1;
          if (nota >= config.escala.aprobatoria) recuperaciones.superadas += 1;
        }
      },
    });
  }

  cierre.push({ cuando: aLaHora(sumarDias(fin, config.calendario.recuperacion_periodo.dias_limite_despues_del_fin + 1), '08:00'), correr: async () => void (await coord.patch(`/academic-years/${anioId}/periodos/${periodo}/estado`, { estado: 'CERRADO' })) });
  await ejecutar(cierre);
  ctx.log(
    `Periodo ${periodo} cerrado: ${definitivas} planillas definitivas; recuperaciones: ${recuperaciones.candidatos} pendientes, ${recuperaciones.presentadas} presentadas, ${recuperaciones.superadas} superadas.`
  );

  // 3. Planes de aula del periodo siguiente, entre el cierre de este y el inicio del otro.
  const siguiente = config.calendario.periodos.find((p) => p.numero === periodo + 1);
  if (siguiente) {
    const inicioSiguiente = diaDelAnio(anio, siguiente.inicio);
    const dia = new Date(Math.max(sumarDias(fin, config.calendario.recuperacion_periodo.dias_limite_despues_del_fin + 2).getTime(), sumarDias(inicioSiguiente, -5).getTime()));
    irA(aLaHora(dia, '09:00'));
    await radicarPlanesDeAula(ctx, anio, periodo + 1);
  }
}

function tituloDe(p: ActividadPlaneada, asignatura: string): string {
  const nombres: Record<string, string[]> = {
    TAREA: ['Taller de práctica', 'Ejercicios de refuerzo', 'Guía de trabajo', 'Cuestionario de lectura'],
    TRABAJO: ['Trabajo en grupo', 'Mapa conceptual', 'Informe de clase', 'Exposición'],
    PROYECTO: ['Proyecto de aula'],
    EVALUACION: ['Evaluación del periodo'],
  };
  const lista = nombres[p.tipo] ?? ['Actividad'];
  return `${lista[p.indice % lista.length]} ${p.indice + 1} — ${asignatura}`;
}

function descripcionDe(p: ActividadPlaneada): string {
  if (p.tipo === 'EVALUACION') return 'Evaluación escrita de los temas trabajados en el periodo.';
  return p.digital ? 'Resuelve la actividad y entrega tu respuesta escrita por la plataforma antes de la fecha límite.' : 'Actividad de clase: se desarrolla y revisa en el aula.';
}
