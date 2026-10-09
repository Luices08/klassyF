import { EstadoActividadEstudiante, TipoActividad } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { EstadoNota } from '../constants/notas';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { ContextoAsignacion, contextosDeAsignaciones } from './actividadContexto.service';
import { armarBloques, armarFila, cargarContextoPlanilla } from './notas.service';

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
  nota_asignatura: number | null;
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

  const asignaturas: AsignaturaDeMisNotas[] = [];
  for (const asignacion of asignaciones) {
    const ctx = await cargarContextoPlanilla(asignacion, periodoNumero);
    const yo = ctx.estudiantes.find((e) => e._id === propio);
    if (!yo) continue;
    const fila = armarFila(ctx, yo);
    const bloques = armarBloques(ctx);
    const publicadas = new Set(ctx.actividades.filter((a) => a.fecha_apertura <= ahora).map((a) => String(a._id)));

    asignaturas.push({
      teacher_assignment_id: String(asignacion._id),
      asignacion: contextos.get(String(asignacion._id)) ?? null,
      estado: fila.estado,
      nota_asignatura: fila.nota_asignatura,
      parcial: fila.parcial,
      desempeno: fila.desempeno,
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
          })),
      })),
    });
  }

  asignaturas.sort((x, y) => (x.asignacion?.asignatura?.nombre ?? '').localeCompare(y.asignacion?.asignatura?.nombre ?? '', 'es'));
  return { ...vacio, nota_aprobatoria, asignaturas };
}

