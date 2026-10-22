/**
 * Lee de la base lo que el modelo necesita de un año: por estudiante y asignatura, la nota efectiva de cada periodo cerrado (M12 con la
 * recuperación de periodo de M18 y lo homologado, vía `cargarContextoNotas`), las actividades con entrega que no entregó (M11), las fallas
 * sin justificar (M13) y sus faltas de convivencia (M14/M15). Solo lee; no guarda nada. Lo usan igual el entrenamiento (años cerrados) y
 * la predicción en vivo (un estudiante).
 */
import { PipelineStage, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../../../constants/enums';
import { NIVELES_SIN_REPROBACION } from '../../../constants/promocion';
import AcademicYear, { AcademicYearDocument, IEscalaEvaluacion } from '../../../models/academicYear.model';
import Activity from '../../../models/activity.model';
import ActivitySubmission from '../../../models/activitySubmission.model';
import Attendance from '../../../models/attendance.model';
import AttendanceJustification from '../../../models/attendanceJustification.model';
import AttendanceState from '../../../models/attendanceState.model';
import Enrollment from '../../../models/enrollment.model';
import EvaluacionPromocionEstudiante from '../../../models/evaluacionPromocionEstudiante.model';
import Grade from '../../../models/grade.model';
import Group from '../../../models/group.model';
import Observacion from '../../../models/observacion.model';
import Subject from '../../../models/subject.model';
import TeacherAssignment from '../../../models/teacherAssignment.model';
import { cargarContextoNotas, clave } from '../../../services/recuperacion.service';
import { escalaEfectiva } from '../../../utils/escalaEvaluacion';
import { EntradaPromocion } from '../../../utils/promocion';
import { AnioAnterior, DatosDeAsignatura, EscalaNotas, FaltaRegistrada, PeriodoDeAsignatura } from '../utils/caracteristicas';

export interface AsignaturaDelAnio extends DatosDeAsignatura {
  asignacion_id: string;
  nombre: string;
}

export interface EstudianteDelAnio {
  student_id: string;
  enrollment_id: string;
  group_id: string;
  grupo: string;
  grado_id: string;
  grado_numero: number;
  nivel: string;
  es_repitente: boolean;
  asignaturas: AsignaturaDelAnio[];
  faltas: FaltaRegistrada[];
}

export interface PeriodoDelAnio {
  numero: number;
  porcentaje: number;
  estado: string;
}

export interface DatosDelAnio {
  anio: AcademicYearDocument;
  escala: IEscalaEvaluacion;
  periodos: PeriodoDelAnio[];
  cerrados: number[];
  estudiantes: Map<string, EstudianteDelAnio>;
  /** M18: ¿hay recuperación final? y con cuántas pendientes como máximo (0 = sin tope). Las lee el motor de promoción. */
  admite_recuperacion_final: boolean;
  max_recuperables: number;
}

const id = (v: unknown): string => String(v);

export const escalaDeNotas = (e: IEscalaEvaluacion): EscalaNotas => ({ minima: e.nota_minima, maxima: e.nota_maxima, aprobatoria: e.nota_aprobatoria });

export async function cargarDatosDelAnio(anio: AcademicYearDocument, studentIds?: string[]): Promise<DatosDelAnio> {
  const escala = escalaEfectiva(anio.escala_evaluacion ?? null);
  const periodos: PeriodoDelAnio[] = anio.periodos.map((p) => ({ numero: p.numero, porcentaje: p.porcentaje, estado: p.estado })).sort((a, b) => a.numero - b.numero);
  const cerrados = periodos.filter((p) => p.estado === 'CERRADO').map((p) => p.numero);
  const filtroEstudiante = studentIds ? { student_id: { $in: studentIds.map((s) => new Types.ObjectId(s)) } } : {};

  const matriculas = await Enrollment.find({ academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS }, ...filtroEstudiante })
    .select('student_id group_id tipo_ingreso')
    .lean();
  const grupos = await Group.find({ _id: { $in: [...new Set(matriculas.map((m) => id(m.group_id)))] } }).select('grade_id nomenclatura').lean();
  const grados = await Grade.find({ _id: { $in: [...new Set(grupos.map((g) => id(g.grade_id)))] } }).select('nivel numero').lean();
  const grupoPorId = new Map(grupos.map((g) => [id(g._id), g]));
  const gradoPorId = new Map(grados.map((g) => [id(g._id), g]));
  // Preescolar no reprueba (Decreto 2247/1997): no tiene asignaturas que perder ni nada que predecir.
  const gruposConNotas = grupos.filter((g) => !NIVELES_SIN_REPROBACION.includes(String(gradoPorId.get(id(g.grade_id))?.nivel)));

  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: 'activo', group_id: { $in: gruposConNotas.map((g) => g._id) } })
    .select('group_id subject_id')
    .lean();
  const asignacionIds = asignaciones.map((a) => a._id);
  const [subjects, contexto, actividades, estados, faltas] = await Promise.all([
    Subject.find({ _id: { $in: [...new Set(asignaciones.map((a) => id(a.subject_id)))] } }).select('nombre area_id').lean(),
    cargarContextoNotas(anio, asignacionIds),
    Activity.find({ teacher_assignment_id: { $in: asignacionIds }, requiere_entrega: true }).select('teacher_assignment_id periodo_numero').lean(),
    AttendanceState.find({}).select('cuenta_como_falla es_justificada').lean(),
    Observacion.find({ academic_year_id: anio._id, clase: 'FALTA', estado: { $ne: 'ANULADA' }, ...filtroEstudiante }).select('student_id periodo_numero fecha_hecho falta.gravedad').lean(),
  ]);
  const subjectPorId = new Map(subjects.map((s) => [id(s._id), s]));

  // Actividades por asignación y periodo, y las que cada estudiante sí entregó.
  const actividadesPor = new Map<string, number>();
  for (const a of actividades) actividadesPor.set(`${id(a.teacher_assignment_id)}|${a.periodo_numero}`, (actividadesPor.get(`${id(a.teacher_assignment_id)}|${a.periodo_numero}`) ?? 0) + 1);
  const actividadPorId = new Map(actividades.map((a) => [id(a._id), a]));
  const entregadas = new Map<string, number>();
  const entregas = await ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) }, fecha_entrega: { $ne: null }, ...filtroEstudiante })
    .select('activity_id student_id')
    .lean();
  for (const e of entregas) {
    const a = actividadPorId.get(id(e.activity_id));
    if (!a) continue;
    const k = `${id(a.teacher_assignment_id)}|${id(e.student_id)}|${a.periodo_numero}`;
    entregadas.set(k, (entregadas.get(k) ?? 0) + 1);
  }

  // Asistencia por clase (grupo + asignatura), estudiante y periodo. El estado decide por sus banderas; una falla con justificación
  // aprobada (M13) no cuenta como falla sin excusa.
  const esFalla = new Set(estados.filter((e) => e.cuenta_como_falla && !e.es_justificada).map((e) => id(e._id)));
  const justificados = new Set((await AttendanceJustification.find({ estado: 'APROBADA' }).select('registro_id').lean()).map((j) => id(j.registro_id)));
  const asignacionDeClase = new Map(asignaciones.map((a) => [`${id(a.group_id)}|${id(a.subject_id)}`, id(a._id)]));
  const asistencia = new Map<string, { registros: number; fallas: number }>();
  const pipeline: PipelineStage[] = [{ $match: { academic_year_id: anio._id, group_id: { $in: gruposConNotas.map((g) => g._id) } } }, { $unwind: '$registros' }];
  if (studentIds) pipeline.push({ $match: { 'registros.student_id': { $in: studentIds.map((s) => new Types.ObjectId(s)) } } });
  pipeline.push({ $project: { group_id: 1, subject_id: 1, periodo: '$periodo_numero', r: '$registros' } });
  for await (const fila of Attendance.aggregate(pipeline)) {
    const asignacion = asignacionDeClase.get(`${id(fila.group_id)}|${id(fila.subject_id)}`);
    if (!asignacion) continue;
    const k = `${asignacion}|${id(fila.r.student_id)}|${Number(fila.periodo)}`;
    const actual = asistencia.get(k) ?? { registros: 0, fallas: 0 };
    actual.registros += 1;
    if (esFalla.has(id(fila.r.state_id)) && !justificados.has(id(fila.r._id))) actual.fallas += 1;
    asistencia.set(k, actual);
  }

  const periodoDeFecha = (fecha: Date): number | null => {
    const p = anio.periodos.find((x) => fecha >= new Date(x.fecha_inicio) && fecha <= new Date(x.fecha_fin));
    return p ? p.numero : null;
  };
  const faltasPorEstudiante = new Map<string, FaltaRegistrada[]>();
  for (const f of faltas) {
    const periodo = f.periodo_numero ?? periodoDeFecha(new Date(f.fecha_hecho));
    const gravedad = f.falta?.gravedad;
    if (periodo === null || !gravedad) continue;
    faltasPorEstudiante.set(id(f.student_id), [...(faltasPorEstudiante.get(id(f.student_id)) ?? []), { periodo, gravedad }]);
  }

  const asignacionesPorGrupo = new Map<string, typeof asignaciones>();
  for (const a of asignaciones) asignacionesPorGrupo.set(id(a.group_id), [...(asignacionesPorGrupo.get(id(a.group_id)) ?? []), a]);

  const estudiantes = new Map<string, EstudianteDelAnio>();
  for (const m of matriculas) {
    const grupo = grupoPorId.get(id(m.group_id));
    const grado = grupo ? gradoPorId.get(id(grupo.grade_id)) : undefined;
    if (!grupo || !grado || NIVELES_SIN_REPROBACION.includes(String(grado.nivel))) continue;
    const estudiante = id(m.student_id);
    const asignaturas: AsignaturaDelAnio[] = [];
    for (const a of asignacionesPorGrupo.get(id(grupo._id)) ?? []) {
      const subject = subjectPorId.get(id(a.subject_id));
      if (!subject) continue;
      const notas = contexto.notas.get(clave(a._id, estudiante));
      const lista: PeriodoDeAsignatura[] = periodos.map((p) => {
        const asist = asistencia.get(`${id(a._id)}|${estudiante}|${p.numero}`);
        const total = actividadesPor.get(`${id(a._id)}|${p.numero}`) ?? 0;
        return {
          periodo: p.numero,
          nota: notas?.efectivas.get(p.numero) ?? null,
          exento: notas?.exentos.has(p.numero) ?? false,
          actividades: total,
          no_entregadas: Math.max(0, total - (entregadas.get(`${id(a._id)}|${estudiante}|${p.numero}`) ?? 0)),
          registros: asist?.registros ?? 0,
          fallas: asist?.fallas ?? 0,
        };
      });
      asignaturas.push({ asignacion_id: id(a._id), subject_id: id(subject._id), area_id: id(subject.area_id), nombre: subject.nombre, periodos: lista });
    }
    estudiantes.set(estudiante, {
      student_id: estudiante,
      enrollment_id: id(m._id),
      group_id: id(grupo._id),
      grupo: grupo.nomenclatura,
      grado_id: id(grado._id),
      grado_numero: grado.numero,
      nivel: String(grado.nivel),
      es_repitente: m.tipo_ingreso === 'REPITENTE',
      asignaturas: asignaturas.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      faltas: faltasPorEstudiante.get(estudiante) ?? [],
    });
  }

  return {
    anio,
    escala,
    periodos,
    cerrados,
    estudiantes,
    admite_recuperacion_final: !!contexto.politica.anual?.aplica,
    max_recuperables: contexto.politica.anual?.max_asignaturas_pendientes ?? 0,
  };
}

/** El año lectivo inmediatamente anterior (por número y, a igual número, por creación). */
export async function anioAnteriorA(anio: AcademicYearDocument): Promise<AcademicYearDocument | null> {
  const anteriores = await AcademicYear.find({ _id: { $ne: anio._id }, year: { $lte: anio.year } }).sort({ year: -1, createdAt: -1 });
  return anteriores.find((a) => a.year < anio.year || a.createdAt < anio.createdAt) ?? null;
}

/** Las entradas de promoción congeladas en el cierre vigente de cada estudiante (M19), por estudiante. */
export async function cierresDelAnio(anioId: Types.ObjectId | string, studentIds?: string[]): Promise<Map<string, EntradaPromocion>> {
  const evaluaciones = await EvaluacionPromocionEstudiante.find({
    academic_year_id: anioId,
    vigente: true,
    ...(studentIds ? { student_id: { $in: studentIds.map((s) => new Types.ObjectId(s)) } } : {}),
  })
    .select('student_id entrada')
    .lean();
  return new Map(evaluaciones.map((e) => [id(e.student_id), e.entrada as EntradaPromocion]));
}

/** Lo que dejó el año anterior de cada estudiante (su cierre de M19), para predecir aun antes de cerrar el primer periodo. */
export async function anioAnteriorDe(anio: AcademicYearDocument, studentIds?: string[]): Promise<Map<string, AnioAnterior>> {
  const previo = await anioAnteriorA(anio);
  if (!previo) return new Map();
  const escala = escalaDeNotas(escalaEfectiva(previo.escala_evaluacion ?? null));
  const cierres = await cierresDelAnio(previo._id, studentIds);
  const salida = new Map<string, AnioAnterior>();
  for (const [estudiante, entrada] of cierres) {
    if (!entrada?.asignaturas) continue;
    salida.set(estudiante, {
      escala,
      asignaturas: entrada.asignaturas.map((a) => ({ subject_id: String(a.subject_id), area_id: String(a.area_id), nota: a.nota_antes })),
      promedio_general: entrada.promedio_general,
    });
  }
  return salida;
}
