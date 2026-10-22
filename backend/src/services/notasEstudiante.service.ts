import { EstadoActividadEstudiante, TipoActividad } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { PERIODO_DE_RECUPERACION_ANUAL } from '../constants/recuperaciones';
import { EstadoNota } from '../constants/notas';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import Recuperacion from '../models/recuperacion.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { notaEfectivaDePeriodo, notaFinalDelAnio, ResumenRecuperacion, resumenDeRecuperacion } from '../utils/notaEfectiva';
import { desempenoCualitativo } from '../utils/siee';
import { ContextoAsignacion, contextosDeAsignaciones } from './actividadContexto.service';
import { armarBloques, armarFila, cargarContextoPlanilla } from './notas.service';
import { cargarContextoNotas, claveRecuperacion, definitivaAnual } from './recuperacion.service';

export interface CasillaDeMisNotas {
  id: string;
  titulo: string;
  tipo: 'ACTIVIDAD' | 'MANUAL';
  tipo_actividad: TipoActividad | null;
  fecha_entrega: Date | null;
  /** Lo que realmente pesa dentro de su bloque. */
  peso_efectivo: number;
  nota: number | null;
  /** Solo actividades con entrega digital: cómo va su entrega. */
  entrega: EstadoActividadEstudiante | null;
  /** La actividad se entrega en línea (abre su página); false = se trabaja en clase o es una nota suelta. */
  requiere_entrega: boolean;
}

export interface BloqueDeMisNotas {
  clave: string;
  nombre: string;
  porcentaje: number;
  nota: number | null;
  casillas: CasillaDeMisNotas[];
}

export interface AsignaturaDeMisNotas {
  teacher_assignment_id: string;
  asignacion: ContextoAsignacion | null;
  estado: EstadoNota;
  /** La nota que vale hoy: la que cerró el docente o, si recuperó y el colegio la cuenta, la de la recuperación (M18). */
  nota_asignatura: number | null;
  /** La recuperación del periodo con su nota anterior y la nueva; null si no recuperó (o aún no hay resultado). */
  recuperacion: ResumenRecuperacion | null;
  /** La nota se calculó con lo que hay: todavía faltan notas. */
  parcial: boolean;
  desempeno: ReturnType<typeof armarFila>['desempeno'];
  bloques: BloqueDeMisNotas[];
}

export interface MisNotas {
  periodo: { numero: number; nombre: string; estado: string };
  nota_aprobatoria: number;
  asignaturas: AsignaturaDeMisNotas[];
}

/**
 * Las notas del estudiante por asignatura en un periodo: cada bloque del molde con sus casillas y la nota de cada una. Es la misma
 * cuenta de la planilla del docente (`armarFila`), así que lo que el estudiante ve mientras el periodo está abierto es provisional
 * (`parcial`) y coincide con lo que quedará en el boletín cuando el docente cierre la planilla. Solo lee lo propio: del resto del
 * grupo, que la planilla también carga, no sale nada. De las actividades solo se listan las ya publicadas (o que ya tienen nota).
 */
export async function misNotas(estudiante: UserDocument, periodoNumero: number, academicYearId?: string): Promise<MisNotas> {
  const anio = academicYearId ? await AcademicYear.findById(academicYearId) : await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) {
    if (academicYearId) throw new ApiError(404, 'Año lectivo no encontrado.');
    throw new ApiError(409, 'No hay un año lectivo en curso.');
  }
  const periodo = anio.periodos.find((p) => p.numero === periodoNumero);
  if (!periodo) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodoNumero}.`);
  const vacio = { periodo: { numero: periodo.numero, nombre: periodo.nombre, estado: periodo.estado } };

  const matriculas = await Enrollment.find({ student_id: estudiante._id, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
    .select('group_id')
    .lean();
  const nota_aprobatoria = escalaEfectiva(anio.escala_evaluacion).nota_aprobatoria;
  if (matriculas.length === 0) return { ...vacio, nota_aprobatoria, asignaturas: [] };

  const asignaciones = await TeacherAssignment.find({
    group_id: { $in: matriculas.map((m) => m.group_id) },
    academic_year_id: anio._id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  });
  const contextos = await contextosDeAsignaciones(asignaciones.map((a) => a._id));
  const ahora = new Date();
  const propio = String(estudiante._id);
  // La planilla cerrada no se toca: la recuperación (M18) se superpone con la regla única de nota efectiva.
  const recuperaciones = await Recuperacion.find({
    academic_year_id: anio._id,
    student_id: estudiante._id,
    tipo: 'PERIODO',
    periodo_numero: periodoNumero,
    teacher_assignment_id: { $in: asignaciones.map((a) => a._id) },
  });
  const recuperacionDe = new Map(recuperaciones.map((r) => [String(r.teacher_assignment_id), r]));

  const asignaturas: AsignaturaDeMisNotas[] = [];
  for (const asignacion of asignaciones) {
    const ctx = await cargarContextoPlanilla(asignacion, periodoNumero);
    const yo = ctx.estudiantes.find((e) => e._id === propio);
    if (!yo) continue;
    const fila = armarFila(ctx, yo);
    const bloques = armarBloques(ctx);
    const publicadas = new Set(ctx.actividades.filter((a) => a.fecha_apertura <= ahora).map((a) => String(a._id)));
    // Solo una nota ya cerrada se recupera; mientras la planilla está abierta, la nota provisional es la de siempre.
    const cerrada = fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO';
    const recuperada = cerrada ? recuperacionDe.get(String(asignacion._id)) : undefined;
    const efectiva = cerrada ? notaEfectivaDePeriodo(fila.nota_asignatura, recuperada) : fila.nota_asignatura;

    asignaturas.push({
      teacher_assignment_id: String(asignacion._id),
      asignacion: contextos.get(String(asignacion._id)) ?? null,
      estado: fila.estado,
      nota_asignatura: efectiva,
      recuperacion: cerrada ? resumenDeRecuperacion(fila.nota_asignatura, recuperada) : null,
      parcial: fila.parcial,
      desempeno: efectiva === null ? null : desempenoCualitativo(efectiva, anio.escala_evaluacion),
      bloques: bloques.map((b) => ({
        clave: b.clave,
        nombre: b.nombre,
        porcentaje: b.porcentaje,
        nota: fila.bloques[b.clave] ?? null,
        casillas: b.casillas
          .filter((c) => c.tipo === 'MANUAL' || publicadas.has(c.id) || fila.notas[c.id] !== null)
          .map((c) => ({
            id: c.id,
            titulo: c.titulo,
            tipo: c.tipo,
            tipo_actividad: c.tipo_actividad,
            fecha_entrega: c.fecha_entrega,
            peso_efectivo: c.peso_efectivo,
            nota: fila.notas[c.id] ?? null,
            entrega: fila.entregas[c.id]?.estado ?? null,
            requiere_entrega: c.tipo === 'ACTIVIDAD' && c.requiere_entrega,
          })),
      })),
    });
  }

  asignaturas.sort((x, y) => (x.asignacion?.asignatura?.nombre ?? '').localeCompare(y.asignacion?.asignatura?.nombre ?? '', 'es'));
  return { ...vacio, nota_aprobatoria, asignaturas };
}


// --- Resumen del año (con la recuperación de fin de año) ---

export interface PeriodoDelAnio {
  numero: number;
  nombre: string;
  porcentaje: number;
  estado: string;
}

export interface AsignaturaDelAnio {
  teacher_assignment_id: string;
  asignacion: ContextoAsignacion | null;
  /** Una entrada por periodo del año, en orden. `nota` es la efectiva (con la recuperación del periodo si la hubo); null = aún sin nota cerrada. */
  periodos: Array<{ numero: number; nota_original: number | null; nota: number | null; recuperacion: ResumenRecuperacion | null }>;
  /** La definitiva ponderada de los periodos (ya con las recuperaciones de periodo); null mientras falte alguno por cerrar. */
  definitiva: number | null;
  recuperacion_anual: ResumenRecuperacion | null;
  /** La nota con la que queda el año: la definitiva o, si la perdió y recuperó al final, la de la recuperación. */
  nota_final: number | null;
  desempeno: ReturnType<typeof desempenoCualitativo> | null;
}

export interface MisNotasDelAnio {
  anio: { _id: string; year: number; nombre: string };
  nota_aprobatoria: number;
  periodos: PeriodoDelAnio[];
  asignaturas: AsignaturaDelAnio[];
}

/**
 * Cómo va el año de cada asignatura del estudiante: la nota de cada periodo (con su recuperación), la definitiva ponderada y, si perdió la
 * asignatura y recuperó al final del año, la nota con la que quedó. Solo lee: usa el mismo contexto de M18 que la promoción y las sábanas,
 * así que las tres dicen lo mismo. Solo lo propio.
 */
export async function misNotasDelAnio(estudiante: UserDocument, academicYearId?: string): Promise<MisNotasDelAnio> {
  const anio = academicYearId ? await AcademicYear.findById(academicYearId) : await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) {
    if (academicYearId) throw new ApiError(404, 'Año lectivo no encontrado.');
    throw new ApiError(409, 'No hay un año lectivo en curso.');
  }
  const escala = escalaEfectiva(anio.escala_evaluacion);
  const base = {
    anio: { _id: String(anio._id), year: anio.year, nombre: anio.nombre },
    nota_aprobatoria: escala.nota_aprobatoria,
    periodos: anio.periodos.map((p) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje, estado: p.estado })),
  };

  const matriculas = await Enrollment.find({ student_id: estudiante._id, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
    .select('group_id')
    .lean();
  if (matriculas.length === 0) return { ...base, asignaturas: [] };

  const asignaciones = await TeacherAssignment.find({
    group_id: { $in: matriculas.map((m) => m.group_id) },
    academic_year_id: anio._id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  });
  const ids = asignaciones.map((a) => a._id);
  const [contextos, ctx] = await Promise.all([contextosDeAsignaciones(ids), cargarContextoNotas(anio, ids)]);
  const propio = String(estudiante._id);

  const asignaturas: AsignaturaDelAnio[] = [];
  for (const asignacion of asignaciones) {
    const notas = ctx.notas.get(`${String(asignacion._id)}|${propio}`);
    const periodos = anio.periodos.map((p) => {
      const original = notas?.cerradas.get(p.numero) ?? null;
      const recuperada = ctx.recuperaciones.get(claveRecuperacion(asignacion._id, propio, 'PERIODO', p.numero));
      return { numero: p.numero, nota_original: original, nota: notas?.efectivas.get(p.numero) ?? null, recuperacion: resumenDeRecuperacion(original, recuperada) };
    });
    // Sin una sola nota cerrada no hay nada que mostrar de esa asignatura todavía.
    if (!periodos.some((p) => p.nota !== null)) continue;

    const definitiva = definitivaAnual(ctx, asignacion._id, propio);
    const anual = ctx.recuperaciones.get(claveRecuperacion(asignacion._id, propio, 'ANUAL', PERIODO_DE_RECUPERACION_ANUAL));
    const notaFinal = notaFinalDelAnio(definitiva, escala.nota_aprobatoria, anual);
    asignaturas.push({
      teacher_assignment_id: String(asignacion._id),
      asignacion: contextos.get(String(asignacion._id)) ?? null,
      periodos,
      definitiva,
      recuperacion_anual: resumenDeRecuperacion(definitiva, anual),
      nota_final: notaFinal,
      desempeno: notaFinal === null ? null : desempenoCualitativo(notaFinal, anio.escala_evaluacion),
    });
  }
  asignaturas.sort((x, y) => (x.asignacion?.asignatura?.nombre ?? '').localeCompare(y.asignacion?.asignatura?.nombre ?? '', 'es'));
  return { ...base, asignaturas };
}
