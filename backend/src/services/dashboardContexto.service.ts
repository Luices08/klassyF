import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import ApiError from '../utils/ApiError';
import { ClaseParaAvance, elegirPeriodoDeReferencia, elegirPeriodoEnCurso } from '../utils/dashboard';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { etiquetaDeGrupo } from '../utils/sabanaCalificaciones';
import { idsDeGradosSinReprobacion } from './nivelesSinReprobacion.service';
import { seguimiento } from './notas.service';

export interface FiltrosDashboard {
  academic_year_id: string;
  sede_id?: string;
  /** Si se indica, mide ese periodo; si no, cada bloque elige el que le corresponde (ver `ContextoDashboard`). */
  periodo_numero?: number;
}

export interface GrupoDeDashboard {
  _id: Types.ObjectId;
  id: string;
  etiqueta: string;
  gradoNumero: number;
  grado_id: string;
  grado: string;
  /** Nivel del catálogo de grados (M01): el panel agrupa por él en vez de quemar rangos de grados. */
  nivel?: string;
  sede_id: string;
  max_capacity: number;
  cupos_ocupados: number;
  /** Preescolar: nadie reprueba (Decreto 2247/1997). */
  sin_reprobacion: boolean;
}

export interface ContextoDashboard {
  anio: AcademicYearDocument;
  grupos: GrupoDeDashboard[];
  gruposIds: Types.ObjectId[];
  /** El periodo de las planillas que se están entregando (en digitación o abierto). */
  periodo_en_curso: number;
  /** El periodo cuyas notas cerradas miden rendimiento, morbilidad y desempeño: el último que ya tiene notas cerradas. */
  periodo_notas: number;
  nota_aprobatoria: number;
  escala: ReturnType<typeof escalaEfectiva>;
}

/**
 * Lo que todo bloque de un dashboard necesita saber: el año, los grupos que entran (los no cerrados, de la sede elegida o de todas) y los periodos a medir.
 * Un año sin grupos no es un error de la pantalla: devuelve listas vacías y cada bloque muestra «sin datos».
 */
export async function cargarContextoDashboard(filtros: FiltrosDashboard): Promise<ContextoDashboard> {
  const anio = await AcademicYear.findById(filtros.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const docs = await Group.find({ academic_year_id: anio._id, estado: { $ne: 'CLOSED' }, ...(filtros.sede_id ? { sede_id: filtros.sede_id } : {}) }).lean();
  const [grados, sinReprobacion] = await Promise.all([Grade.find({ _id: { $in: docs.map((g) => g.grade_id) } }).select('nombre numero nivel').lean(), idsDeGradosSinReprobacion()]);
  const gradoPor = new Map(grados.map((g) => [String(g._id), g]));
  const grupos = docs
    .map((g): GrupoDeDashboard => {
      const grado = gradoPor.get(String(g.grade_id));
      return {
        _id: g._id,
        id: String(g._id),
        etiqueta: etiquetaDeGrupo(grado?.numero ?? 0, grado?.nombre ?? '', g.nomenclatura),
        gradoNumero: grado?.numero ?? 0,
        grado_id: String(g.grade_id),
        grado: grado?.nombre ?? '',
        nivel: grado?.nivel,
        sede_id: String(g.sede_id),
        max_capacity: g.max_capacity,
        cupos_ocupados: g.cupos_ocupados,
        sin_reprobacion: sinReprobacion.includes(String(g.grade_id)),
      };
    })
    .sort((a, b) => a.gradoNumero - b.gradoNumero || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  const gruposIds = grupos.map((g) => g._id);

  const periodosDelAnio = anio.periodos.map((p) => p.numero);
  const conNotasCerradas =
    gruposIds.length === 0
      ? []
      : await CalificacionAsignatura.distinct('periodo_numero', { academic_year_id: anio._id, group_id: { $in: gruposIds }, estado: { $in: ['CERRADO', 'DEFINITIVO'] } });

  const periodo_en_curso = elegirPeriodoEnCurso(filtros.periodo_numero, anio.periodos);
  const periodo_notas = elegirPeriodoDeReferencia(filtros.periodo_numero, periodosDelAnio, conNotasCerradas as number[]);
  const escala = escalaEfectiva(anio.escala_evaluacion);
  return { anio, grupos, gruposIds, periodo_en_curso, periodo_notas, nota_aprobatoria: escala.nota_aprobatoria, escala };
}

/** Las matrículas activas de los grupos del alcance: un estudiante, un grupo. */
export async function matriculasActivasDelAlcance(ctx: ContextoDashboard): Promise<Array<{ student_id: string; group_id: string }>> {
  if (ctx.gruposIds.length === 0) return [];
  const matriculas = await Enrollment.find({ academic_year_id: ctx.anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS }, group_id: { $in: ctx.gruposIds } }).select('student_id group_id').lean();
  return matriculas.map((m) => ({ student_id: String(m.student_id), group_id: String(m.group_id) }));
}

/**
 * Cómo va cada clase del periodo en curso (una fila por docente, asignatura y grupo), con lo que necesitan el avance global y la lista de docentes
 * pendientes. Reusa `seguimiento` de M12: el dashboard no calcula por su cuenta qué es una planilla cerrada. Las clases sin estudiantes por calificar no cuentan.
 */
export async function clasesDeSeguimiento(ctx: ContextoDashboard): Promise<ClaseParaAvance[]> {
  if (ctx.gruposIds.length === 0) return [];
  const filas = await seguimiento({ academic_year_id: String(ctx.anio._id), periodo_numero: ctx.periodo_en_curso, group_ids: ctx.grupos.map((g) => g.id) });
  return filas
    .filter((f) => f.estudiantes > 0)
    .map((f): ClaseParaAvance => {
      const docente = f.asignacion?.docente;
      const grado = f.asignacion?.grado;
      return {
        docente_id: docente?._id ?? 'sin-docente',
        docente: docente ? `${docente.apellido} ${docente.nombre}` : 'Sin docente',
        asignatura: f.asignacion?.asignatura?.nombre ?? '',
        grupo: etiquetaDeGrupo(grado?.numero ?? 0, grado?.nombre ?? '', f.asignacion?.grupo?.nomenclatura ?? ''),
        estudiantes: f.estudiantes,
        cerradas: f.cerradas + f.definitivas,
        estado: f.estado,
      };
    });
}

/** El bloque de contexto que cada respuesta repite, para que la pantalla diga qué año y qué periodos está mostrando y con qué escala se miden las notas. */
export const resumenDeContexto = (ctx: ContextoDashboard) => ({
  academic_year_id: String(ctx.anio._id),
  anio: ctx.anio.year,
  periodo_en_curso: ctx.periodo_en_curso,
  periodo_notas: ctx.periodo_notas,
  grupos: ctx.grupos.length,
  nota_minima: ctx.escala.nota_minima,
  nota_maxima: ctx.escala.nota_maxima,
  nota_aprobatoria: ctx.nota_aprobatoria,
});

/** La clave de caché de un bloque: el año, la sede y el periodo pedidos, porque de ellos depende todo lo que se calcula. */
export const claveDeBloque = (bloque: string, f: FiltrosDashboard): string => `dashboard:${bloque}:${f.academic_year_id}:${f.sede_id ?? '*'}:${f.periodo_numero ?? '*'}`;
