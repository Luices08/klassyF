import { Types } from 'mongoose';
import { LIMITE_RANKING_DASHBOARD, TTL_DASHBOARD_MS } from '../constants/dashboard';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import Area from '../models/area.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Subject from '../models/subject.model';
import { memorizar } from '../utils/cacheCorta';
import { etapasNotaEfectiva } from '../utils/notaEfectiva';
import {
  ConteoDeReprobacionPorAsignatura,
  EstudianteParaEficiencia,
  FilaEficiencia,
  GradoDelDashboard,
  ResumenRendimiento,
  clasificarEstudiante,
  porcentaje,
  rankingMorbilidadPorArea,
  rankingMorbilidadPorAsignatura,
  resumirAvancePlanillas,
  resumirCupos,
  resumirEficienciaPorGrado,
  resumirRendimiento,
} from '../utils/dashboard';
import { calcularEstadisticas } from './attendanceStats.service';
import { datosDeConfiguracion, obtenerConfiguracion } from './configuracionComision.service';
import { ContextoDashboard, FiltrosDashboard, cargarContextoDashboard, claveDeBloque, resumenDeContexto, clasesDeSeguimiento, matriculasActivasDelAlcance } from './dashboardContexto.service';

const NOTAS_CERRADAS = ['CERRADO', 'DEFINITIVO'];

/** Los grupos donde se reprueba: Preescolar no entra a ninguna medida de aprobación (Decreto 2247/1997). */
const gruposConReprobacion = (ctx: ContextoDashboard): Types.ObjectId[] => ctx.grupos.filter((g) => !g.sin_reprobacion).map((g) => g._id);

// --- Eficiencia interna por grado (y de ella, el % de aprobación) ---

export interface Eficiencia {
  periodo_notas: number;
  filas: FilaEficiencia[];
  totales: Omit<FilaEficiencia, 'grado_id' | 'grado' | 'grado_numero' | 'nivel'>;
  rendimiento: ResumenRendimiento;
}

async function calcularEficiencia(ctx: ContextoDashboard): Promise<Eficiencia> {
  const matriculas = await matriculasActivasDelAlcance(ctx);
  const grupoPor = new Map(ctx.grupos.map((g) => [g.id, g]));

  const [cierres, perdidas, retiradosPorGrupo] = await Promise.all([
    EvaluacionPromocion.find({ academic_year_id: ctx.anio._id, vigente: true, group_id: { $in: ctx.gruposIds } }).select('student_id resultado').lean(),
    CalificacionAsignatura.aggregate<{ _id: Types.ObjectId; perdidas: number }>([
      { $match: { academic_year_id: ctx.anio._id, group_id: { $in: ctx.gruposIds }, periodo_numero: ctx.periodo_notas, estado: { $in: NOTAS_CERRADAS } } },
      ...etapasNotaEfectiva(),
      { $group: { _id: '$student_id', perdidas: { $sum: { $cond: [{ $lt: ['$nota_efectiva', ctx.nota_aprobatoria] }, 1, 0] } } } },
    ]),
    // Un retiro o un traslado a otro colegio dejan la matrícula en RETIRADO: el sistema no los distingue de una deserción, así que se cuentan juntos.
    Enrollment.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { academic_year_id: ctx.anio._id, estado: 'RETIRADO', group_id: { $in: ctx.gruposIds } } },
      { $group: { _id: '$group_id', total: { $sum: 1 } } },
    ]),
  ]);
  const cierrePor = new Map(cierres.map((c) => [String(c.student_id), c.resultado as string]));
  const perdidasPor = new Map(perdidas.map((p) => [String(p._id), p.perdidas]));

  const grados = new Map<string, GradoDelDashboard>();
  for (const g of ctx.grupos) grados.set(g.grado_id, { grado_id: g.grado_id, grado: g.grado, grado_numero: g.gradoNumero, nivel: g.nivel });

  const retiradosPorGrado = new Map<string, number>();
  for (const r of retiradosPorGrupo) {
    const grado = grupoPor.get(String(r._id))?.grado_id;
    if (grado) retiradosPorGrado.set(grado, (retiradosPorGrado.get(grado) ?? 0) + r.total);
  }

  const estudiantes: EstudianteParaEficiencia[] = [];
  for (const m of matriculas) {
    const grupo = grupoPor.get(m.group_id);
    if (!grupo) continue;
    estudiantes.push({
      grado_id: grupo.grado_id,
      clasificacion: clasificarEstudiante({ resultado_oficial: cierrePor.get(m.student_id) ?? null, perdidas: perdidasPor.get(m.student_id) ?? null, sin_reprobacion: grupo.sin_reprobacion }),
    });
  }

  const filas = resumirEficienciaPorGrado([...grados.values()], estudiantes, retiradosPorGrado);
  const suma = (campo: keyof Omit<FilaEficiencia, 'grado_id' | 'grado' | 'grado_numero' | 'nivel'>) => filas.reduce((s, f) => s + f[campo], 0);
  return {
    periodo_notas: ctx.periodo_notas,
    filas,
    totales: {
      matriculados: suma('matriculados'),
      retirados: suma('retirados'),
      promovidos: suma('promovidos'),
      no_promovidos: suma('no_promovidos'),
      pendientes: suma('pendientes'),
      sin_perdidas: suma('sin_perdidas'),
      con_perdidas: suma('con_perdidas'),
      sin_notas: suma('sin_notas'),
    },
    rendimiento: resumirRendimiento(filas),
  };
}

/** Matriz de eficiencia interna: por grado, matriculados, retirados y resultado (oficial si ya hay cierre de promoción; si no, provisional al periodo de referencia). */
export async function obtenerEficiencia(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('eficiencia', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    return { contexto: resumenDeContexto(ctx), ...(await calcularEficiencia(ctx)) };
  });
}

// --- Indicadores globales ---

/** Las cuatro tarjetas de arriba: matrícula contra cupos, aprobación, asistencia acumulada y avance de la entrega de notas. */
export async function obtenerIndicadores(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('indicadores', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);

    const [matriculados, preinscritos, eficiencia, estadisticas, clases] = await Promise.all([
      Enrollment.countDocuments({ academic_year_id: ctx.anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS }, group_id: { $in: ctx.gruposIds } }),
      Enrollment.countDocuments({ academic_year_id: ctx.anio._id, estado: 'PREINSCRITO', group_id: { $in: ctx.gruposIds } }),
      calcularEficiencia(ctx),
      // `alcance` reemplaza el filtro de grupo: así la asistencia es la de la sede elegida, no la de toda la institución.
      calcularEstadisticas({ academic_year_id: String(ctx.anio._id), agrupar_por: 'periodo' }, { group_id: { $in: ctx.gruposIds } }),
      clasesDeSeguimiento(ctx),
    ]);

    const total = estadisticas.total;
    const asistencia = total.total_registros > 0 ? Math.round((100 - total.porcentaje_ausentismo) * 10) / 10 : null;
    const periodoEnCurso = ctx.anio.periodos.find((p) => p.numero === ctx.periodo_en_curso);

    return {
      contexto: resumenDeContexto(ctx),
      matricula: { ...resumirCupos(matriculados, ctx.grupos.reduce((s, g) => s + g.max_capacity, 0)), preinscritos },
      rendimiento: eficiencia.rendimiento,
      asistencia: {
        asistencia_pct: asistencia,
        inasistencia_pct: total.total_registros > 0 ? total.porcentaje_ausentismo : null,
        fallas_injustificadas: total.fallas_injustificadas,
        retardos: total.retardos,
        registros: total.total_registros,
      },
      planillas: {
        ...resumirAvancePlanillas(clases),
        periodo_numero: ctx.periodo_en_curso,
        fecha_cierre_notas: periodoEnCurso?.fecha_cierre_notas ?? null,
      },
    };
  });
}

// --- Morbilidad académica ---

/** Las asignaturas y áreas con más reprobación entre las notas ya cerradas del periodo de referencia, con el mínimo de evaluados que fijó el colegio en M20. */
export async function obtenerMorbilidad(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('morbilidad', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const gruposIds = gruposConReprobacion(ctx);
    const config = datosDeConfiguracion(await obtenerConfiguracion());

    const conteos = gruposIds.length
      ? await CalificacionAsignatura.aggregate<{ _id: Types.ObjectId; evaluados: number; reprobados: number }>([
          { $match: { academic_year_id: ctx.anio._id, group_id: { $in: gruposIds }, periodo_numero: ctx.periodo_notas, estado: { $in: NOTAS_CERRADAS } } },
          ...etapasNotaEfectiva(),
          { $group: { _id: '$subject_id', evaluados: { $sum: 1 }, reprobados: { $sum: { $cond: [{ $lt: ['$nota_efectiva', ctx.nota_aprobatoria] }, 1, 0] } } } },
        ])
      : [];

    const asignaturas = await Subject.find({ _id: { $in: conteos.map((c) => c._id) } }).select('nombre area_id').lean();
    const areas = await Area.find({ _id: { $in: asignaturas.map((a) => a.area_id) } }).select('nombre').lean();
    const nombreArea = new Map(areas.map((a) => [String(a._id), a.nombre]));
    const asignaturaPor = new Map(asignaturas.map((a) => [String(a._id), a]));

    const porAsignatura: ConteoDeReprobacionPorAsignatura[] = conteos.map((c) => {
      const a = asignaturaPor.get(String(c._id));
      return { clave: String(c._id), nombre: a?.nombre ?? 'Asignatura', area: (a && nombreArea.get(String(a.area_id))) ?? 'Sin área', evaluados: c.evaluados, reprobados: c.reprobados };
    });

    const evaluados = porAsignatura.reduce((s, c) => s + c.evaluados, 0);
    const reprobados = porAsignatura.reduce((s, c) => s + c.reprobados, 0);
    const minimo = config.reprobacion_masiva.minimo_estudiantes;
    return {
      contexto: resumenDeContexto(ctx),
      minimo_evaluados: minimo,
      reprobacion_pct: porcentaje(reprobados, evaluados),
      asignaturas: rankingMorbilidadPorAsignatura(porAsignatura, minimo, LIMITE_RANKING_DASHBOARD),
      areas: rankingMorbilidadPorArea(porAsignatura, minimo, LIMITE_RANKING_DASHBOARD),
    };
  });
}
