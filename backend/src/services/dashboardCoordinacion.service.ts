import { Types } from 'mongoose';
import { LIMITE_RANKING_DASHBOARD, TTL_DASHBOARD_MS } from '../constants/dashboard';
import { GRADOS_SERVICIO_SOCIAL } from '../constants/titulacion';
import Attendance from '../models/attendance.model';
import AttendanceJustification from '../models/attendanceJustification.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import SesionComision from '../models/sesionComision.model';
import { UserDocument } from '../models/user.model';
import { memorizar } from '../utils/cacheCorta';
import { PromedioDeGrupo, agruparDocentesPendientes, compararGruposPorGrado, distribucionDesempeno, resumirAvancePlanillas, resumirServicioSocial } from '../utils/dashboard';
import { ContextoDashboard, FiltrosDashboard, cargarContextoDashboard, claveDeBloque, resumenDeContexto, clasesDeSeguimiento } from './dashboardContexto.service';
import { filasDeServicioSocial } from './listadosCierre.service';
import { FilaRecuperacion, ListadoRecuperaciones, listarCandidatos } from './recuperacion.service';
import { calcularTableroDeRiesgo } from './riesgoAcademico.service';

const NOTAS_CERRADAS = ['CERRADO', 'DEFINITIVO'];
const gruposConReprobacion = (ctx: ContextoDashboard): Types.ObjectId[] => ctx.grupos.filter((g) => !g.sin_reprobacion).map((g) => g._id);

/** Corre `tarea` sobre cada elemento con un máximo de llamadas a la vez: cada una abre su propia consulta y no conviene lanzar cientos juntas. */
async function enLotes<T, R>(items: readonly T[], tamano: number, tarea: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += tamano) resultados.push(...(await Promise.all(items.slice(i, i + tamano).map(tarea))));
  return resultados;
}

// --- Monitor de entrega de notas ---

/** Qué porcentaje de planillas del periodo en curso ya cerraron los docentes, y quiénes tienen entregas pendientes. */
export async function obtenerEntregaDeNotas(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('entrega-notas', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const clases = await clasesDeSeguimiento(ctx);
    const periodo = ctx.anio.periodos.find((p) => p.numero === ctx.periodo_en_curso);
    return {
      contexto: resumenDeContexto(ctx),
      corte: { periodo_numero: ctx.periodo_en_curso, estado: periodo?.estado ?? null, fecha_fin: periodo?.fecha_fin ?? null, fecha_cierre_notas: periodo?.fecha_cierre_notas ?? null },
      avance: resumirAvancePlanillas(clases),
      pendientes: agruparDocentesPendientes(clases, LIMITE_RANKING_DASHBOARD),
    };
  });
}

// --- Estudiantes en riesgo crítico ---

/**
 * Los estudiantes en rojo del semáforo de la comisión (M20): los que llegaron al tope de asignaturas perdidas o pasaron el límite de inasistencia que fijó
 * el colegio. Es el mismo cálculo del tablero, sin su auditoría; los umbrales vienen de la configuración, no de números fijos aquí.
 */
export async function obtenerRiesgo(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('riesgo', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const tablero = await calcularTableroDeRiesgo({ academic_year_id: String(ctx.anio._id), periodo_numero: ctx.periodo_en_curso, ...(filtros.sede_id ? { sede_id: filtros.sede_id } : {}) });
    const { semaforo } = tablero.umbrales;
    const criticos = tablero.estudiantes.filter((e) => e.nivel === 'ROJO');
    return {
      contexto: resumenDeContexto(ctx),
      hay_notas_provisionales: tablero.hay_notas_provisionales,
      umbrales: { perdidas_rojo_desde: semaforo.rojo_desde, inasistencia_roja_pct: semaforo.inasistencia_roja_pct },
      resumen: tablero.resumen,
      por_perdidas: criticos.filter((e) => e.perdidas.length >= semaforo.rojo_desde).length,
      por_inasistencia: criticos.filter((e) => e.inasistencia_pct > semaforo.inasistencia_roja_pct).length,
      estudiantes: criticos.slice(0, LIMITE_RANKING_DASHBOARD).map((e) => ({
        student_id: e.student_id,
        nombre: e.nombre,
        apellido: e.apellido,
        grupo: e.grupo,
        perdidas: e.perdidas.length,
        inasistencia_pct: e.inasistencia_pct,
        motivos: e.motivos,
      })),
    };
  });
}

// --- Nivelaciones y recuperaciones ---

interface ResumenRecuperacion {
  aplica: boolean;
  motivo_no_aplica: string | null;
  pendientes: number;
  estudiantes_pendientes: number;
  superadas: number;
  no_superadas: number;
}

function resumirListados(listados: readonly ListadoRecuperaciones[]): { resumen: ResumenRecuperacion; filas: FilaRecuperacion[] } {
  const filas = listados.flatMap((l) => l.filas);
  const pendientes = filas.filter((f) => f.estado === 'PENDIENTE');
  const primero = listados[0];
  return {
    filas,
    resumen: {
      aplica: primero?.aplica ?? false,
      motivo_no_aplica: primero?.motivo_no_aplica ?? null,
      pendientes: pendientes.length,
      estudiantes_pendientes: new Set(pendientes.map((f) => f.estudiante._id)).size,
      superadas: filas.filter((f) => f.estado === 'SUPERADA').length,
      no_superadas: filas.filter((f) => f.estado === 'NO_SUPERADA').length,
    },
  };
}

/**
 * Cuántos estudiantes siguen pendientes de superar una recuperación: la de periodo (el periodo de referencia) y, cuando ya cerraron todos los periodos, la de
 * fin de año. Usa `listarCandidatos` de M18 grupo por grupo, así que dice exactamente lo mismo que la pantalla de Recuperaciones. Es lo más pesado del
 * dashboard: por eso se calcula aparte y se guarda unos segundos.
 */
export async function obtenerRecuperaciones(filtros: FiltrosDashboard, usuario: UserDocument) {
  return memorizar(claveDeBloque('recuperaciones', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const anioId = String(ctx.anio._id);
    const grupos = ctx.grupos.filter((g) => !g.sin_reprobacion);
    const gradoDe = new Map(grupos.map((g) => [g.id, g.grado]));

    const consultar = (tipo: 'PERIODO' | 'ANUAL', grupoId: string) =>
      listarCandidatos({ academic_year_id: anioId, tipo, ...(tipo === 'PERIODO' ? { periodo_numero: ctx.periodo_notas } : {}), group_id: grupoId }, usuario);

    // Si el colegio no tiene recuperación para el periodo, el primer grupo lo dice y no hace falta recorrer los demás.
    const primero = grupos[0];
    const muestra = primero ? await consultar('PERIODO', primero.id) : null;
    const delPeriodo = muestra ? [muestra] : [];
    if (muestra?.aplica) delPeriodo.push(...(await enLotes(grupos.slice(1), 4, (g) => consultar('PERIODO', g.id))));
    const periodo = resumirListados(delPeriodo);

    // La de fin de año solo tiene sentido cuando ya cerraron todos los periodos.
    const terminoElAnio = ctx.anio.periodos.length > 0 && ctx.anio.periodos.every((p) => p.estado === 'CERRADO');
    const anual = terminoElAnio ? resumirListados(await enLotes(grupos, 4, (g) => consultar('ANUAL', g.id))) : null;

    const porGrado = new Map<string, number>();
    for (const f of [...periodo.filas, ...(anual?.filas ?? [])]) {
      if (f.estado !== 'PENDIENTE') continue;
      const grado = gradoDe.get(f.group_id) ?? 'Sin grado';
      porGrado.set(grado, (porGrado.get(grado) ?? 0) + 1);
    }

    return {
      contexto: resumenDeContexto(ctx),
      periodo: { periodo_numero: ctx.periodo_notas, ...periodo.resumen },
      anual: anual?.resumen ?? null,
      por_grado: [...porGrado.entries()].map(([grado, pendientes]) => ({ grado, pendientes })),
    };
  });
}

// --- Servicio social (10.° y 11.°) ---

/** Aprobado contra Pendiente en servicio social: el mismo cálculo del listado de cierre y de la titulación. */
export async function obtenerServicioSocial(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('servicio-social', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const grupos = ctx.grupos.filter((g) => GRADOS_SERVICIO_SOCIAL.includes(g.gradoNumero));
    if (grupos.length === 0) return { contexto: resumenDeContexto(ctx), exigidas: null, ...resumirServicioSocial([]), por_grado: [] };

    const { filas, exigidas } = await filasDeServicioSocial(String(ctx.anio._id), ctx.anio._id, grupos);
    return {
      contexto: resumenDeContexto(ctx),
      exigidas,
      ...resumirServicioSocial(filas),
      por_grado: GRADOS_SERVICIO_SOCIAL.map((numero) => ({ grado_numero: numero, ...resumirServicioSocial(filas.filter((f) => f.orden === numero)) })),
    };
  });
}

// --- Desempeño y comparativo de grupos ---

/** La proporción de notas de asignatura (cerradas, periodo de referencia) en cada nivel de la escala del año. */
export async function obtenerDesempeno(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('desempeno', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const gruposIds = gruposConReprobacion(ctx);
    const conteos = gruposIds.length
      ? await CalificacionAsignatura.aggregate<{ _id: number; total: number }>([
          { $match: { academic_year_id: ctx.anio._id, group_id: { $in: gruposIds }, periodo_numero: ctx.periodo_notas, estado: { $in: NOTAS_CERRADAS } } },
          { $group: { _id: '$resultado.nota_asignatura', total: { $sum: 1 } } },
        ])
      : [];
    return { contexto: resumenDeContexto(ctx), ...distribucionDesempeno(conteos.map((c) => ({ nota: c._id, total: c.total })), ctx.escala) };
  });
}

/** El promedio de cada grupo entre los del mismo grado (8-A contra 8-B), con la brecha entre el mejor y el peor. */
export async function obtenerComparativoDeGrupos(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('comparativo', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const gruposIds = gruposConReprobacion(ctx);
    const promedios = gruposIds.length
      ? await CalificacionAsignatura.aggregate<{ _id: Types.ObjectId; promedio: number; notas: number }>([
          { $match: { academic_year_id: ctx.anio._id, group_id: { $in: gruposIds }, periodo_numero: ctx.periodo_notas, estado: { $in: NOTAS_CERRADAS } } },
          { $group: { _id: '$group_id', promedio: { $avg: '$resultado.nota_asignatura' }, notas: { $sum: 1 } } },
        ])
      : [];
    const grupoPor = new Map(ctx.grupos.map((g) => [g.id, g]));
    const datos: PromedioDeGrupo[] = promedios.flatMap((p) => {
      const g = grupoPor.get(String(p._id));
      return g ? [{ grupo_id: g.id, etiqueta: g.etiqueta, grado_id: g.grado_id, grado: g.grado, grado_numero: g.gradoNumero, promedio: p.promedio, notas: p.notas }] : [];
    });
    return { contexto: resumenDeContexto(ctx), grados: compararGruposPorGrado(datos) };
  });
}

// --- Alertas de coordinación ---

/**
 * Lo que coordinación académica tiene que atender hoy: justificaciones de inasistencia por revisar y sesiones de la comisión sin realizar. Convivencia y
 * orientación NO salen aquí a propósito: el coordinador académico no ve casos, faltas ni remisiones (M14/M15).
 */
export async function obtenerAlertas(filtros: FiltrosDashboard) {
  return memorizar(claveDeBloque('alertas', filtros), TTL_DASHBOARD_MS, async () => {
    const ctx = await cargarContextoDashboard(filtros);
    const [justificaciones, sesiones] = await Promise.all([
      ctx.gruposIds.length
        ? AttendanceJustification.aggregate<{ total: number }>([
            { $match: { estado: 'PENDIENTE' } },
            { $lookup: { from: Attendance.collection.name, localField: 'attendance_id', foreignField: '_id', as: 'planilla' } },
            { $match: { 'planilla.group_id': { $in: ctx.gruposIds } } },
            { $count: 'total' },
          ])
        : [],
      SesionComision.countDocuments({ academic_year_id: ctx.anio._id, estado: { $in: ['BORRADOR', 'CONVOCADA'] } }),
    ]);
    return { contexto: resumenDeContexto(ctx), justificaciones_pendientes: justificaciones[0]?.total ?? 0, sesiones_sin_realizar: sesiones };
  });
}
