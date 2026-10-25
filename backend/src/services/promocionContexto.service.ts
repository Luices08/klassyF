import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { MomentoPromocion } from '../constants/promocion';
import { PERIODO_DE_RECUPERACION_ANUAL } from '../constants/recuperaciones';
import { AcademicYearDocument } from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Grade from '../models/grade.model';
import { GroupDocument } from '../models/group.model';
import Recuperacion from '../models/recuperacion.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { calcularNotaArea, calcularPromedioGeneral } from '../utils/calculoNotas';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { obtenerGradoPlanEfectivo } from '../utils/horasPlanEstudios';
import { AreaEntrada, AsignaturaEntrada, EntradaPromocion, EstadoRecuperacionEntrada } from '../utils/promocion';
import { calcularEstadisticas, TotalesAsistencia } from './attendanceStats.service';
import { obtenerPolitica as obtenerPoliticaRecuperaciones } from './configuracionRecuperaciones.service';
import { contarPorEstudiante, faltasContadas } from './faltasConvivencia.service';
import { cargarContextoNotas, claveRecuperacion, definitivaAnual } from './recuperacion.service';

export interface EntradaDeEstudiante {
  enrollment_id: string;
  student_id: string;
  entrada: EntradaPromocion;
}

export const porcentajeDe = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

/** Totales de asistencia por estudiante (clave = id), del grupo y, si se indica, de una sola asignatura. */
export async function asistenciaPorEstudiante(anioId: string, grupoId: string, subjectId?: string): Promise<Map<string, TotalesAsistencia>> {
  const { filas } = await calcularEstadisticas({ academic_year_id: anioId, agrupar_por: 'estudiante', group_id: grupoId, subject_id: subjectId }, null);
  return new Map(filas.map((f) => [f.clave, f]));
}

/**
 * Arma, para cada estudiante con matrícula activa del grupo, lo que el motor necesita (utils/promocion.ts). Solo LEE: notas cerradas de M12
 * con la recuperación de periodo de M18 ya aplicada, recuperación final de M18, asistencia de M13, faltas de M14/M15 y la existencia de un PIAR
 * activo de M16 (nunca su modalidad ni su categoría). Los pesos de cada área son los de M06; si el área no tiene ponderación se promedia.
 */
export async function construirEntradasDelGrupo(anio: AcademicYearDocument, grupo: Pick<GroupDocument, '_id' | 'grade_id' | 'sede_id' | 'jornada_id'>, momento: MomentoPromocion): Promise<EntradaDeEstudiante[]> {
  const matriculas = await Enrollment.find({ group_id: grupo._id, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  if (matriculas.length === 0) return [];
  const estudiantesIds = matriculas.map((m) => m.student_id);

  const [grado, planDelAnio, asignaciones, politicaRecuperaciones] = await Promise.all([
    Grade.findById(grupo.grade_id).select('nivel'),
    StudyPlan.findOne({ academic_year_id: anio._id }),
    TeacherAssignment.find({ academic_year_id: anio._id, group_id: grupo._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id'),
    obtenerPoliticaRecuperaciones(anio),
  ]);
  const gradoPlan =
    obtenerGradoPlanEfectivo(planDelAnio, String(grupo.grade_id), grupo.sede_id ? String(grupo.sede_id) : null, grupo.jornada_id ? String(grupo.jornada_id) : null) ??
    planDelAnio?.grades.find((g) => String(g.grade_id) === String(grupo.grade_id));
  const personalizacion = gradoPlan?.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));

  const asignaturas = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre area_id');
  const asignaturaPorId = new Map(asignaturas.map((s) => [String(s._id), s]));
  const areas = await Area.find({ _id: { $in: [...new Set(asignaturas.map((s) => String(s.area_id)))] } }).select('nombre');
  const nombreArea = new Map(areas.map((a) => [String(a._id), a.nombre]));

  // Cómo se calcula la nota de cada área (M06): la personalizada del grupo si existe, si no la del grado; sin ninguna, aritmético.
  const evaluacionDeArea = (areaId: string) => {
    const e = personalizacion?.evaluaciones_area_personalizadas.find((x) => String(x.area_id) === areaId) ?? gradoPlan?.evaluaciones_area.find((x) => String(x.area_id) === areaId);
    return e ? { metodo: e.metodo_calculo, porcentajes: new Map(e.asignaturas.map((a) => [String(a.subject_id), a.porcentaje])) } : { metodo: 'ARITMETICO' as const, porcentajes: new Map<string, number>() };
  };

  const escala = escalaEfectiva(anio.escala_evaluacion);
  const ctx = await cargarContextoNotas(anio, asignaciones.map((a) => a._id));
  const recuperacionFinal = await Recuperacion.find({ academic_year_id: anio._id, tipo: 'ANUAL', teacher_assignment_id: { $in: asignaciones.map((a) => a._id) } });
  const recuperacionPorClave = new Map(recuperacionFinal.map((r) => [claveRecuperacion(r.teacher_assignment_id, r.student_id, 'ANUAL', PERIODO_DE_RECUPERACION_ANUAL), r]));

  const [asistenciaGlobal, faltas, expedientes] = await Promise.all([
    asistenciaPorEstudiante(String(anio._id), String(grupo._id)),
    // Tipo I del Observador y tipo II/III solo con decisión en firme del caso (ver `faltasContadas`).
    faltasContadas({ academic_year_id: anio._id, estudiantes_ids: estudiantesIds }),
    // Solo se pregunta si existe un PIAR vigente: la comisión no necesita (ni debe ver) su categoría ni su modalidad.
    ExpedienteInclusion.find({ academic_year_id: anio._id, student_id: { $in: estudiantesIds }, tipo: 'PIAR', estado: 'ACTIVO' }).select('student_id').lean(),
  ]);
  const asistenciaPorAsignatura = new Map<string, Map<string, TotalesAsistencia>>();
  for (const subjectId of new Set(asignaciones.map((a) => String(a.subject_id)))) {
    asistenciaPorAsignatura.set(subjectId, await asistenciaPorEstudiante(String(anio._id), String(grupo._id), subjectId));
  }
  const conPiar = new Set(expedientes.map((e) => String(e.student_id)));
  const faltasPorEstudiante = contarPorEstudiante(faltas);

  const resultado: EntradaDeEstudiante[] = [];
  for (const matricula of matriculas) {
    const estudianteId = String(matricula.student_id);
    const filas: AsignaturaEntrada[] = [];
    for (const asignacion of asignaciones) {
      const subject = asignaturaPorId.get(String(asignacion.subject_id));
      if (!subject) continue;
      const notaAntes = definitivaAnual(ctx, asignacion._id, estudianteId);
      const perdida = notaAntes !== null && notaAntes < escala.nota_aprobatoria;
      const recuperacion = recuperacionPorClave.get(claveRecuperacion(asignacion._id, estudianteId, 'ANUAL', PERIODO_DE_RECUPERACION_ANUAL));
      let estado: EstadoRecuperacionEntrada = null;
      if (perdida) estado = recuperacion ? recuperacion.estado : momento === 'TRAS_RECUPERACION' ? 'NO_PRESENTO' : 'PENDIENTE';
      const totales = asistenciaPorAsignatura.get(String(asignacion.subject_id))?.get(estudianteId);
      filas.push({
        subject_id: String(subject._id),
        area_id: String(subject.area_id),
        nombre: subject.nombre,
        nota_antes: notaAntes,
        nota_final: perdida && recuperacion && recuperacion.nota_resultante !== null ? recuperacion.nota_resultante : notaAntes,
        recuperacion: estado,
        inasistencia_total_pct: totales?.porcentaje_ausentismo ?? 0,
        inasistencia_injustificada_pct: porcentajeDe(totales?.fallas_injustificadas ?? 0, totales?.total_registros ?? 0),
      });
    }

    const filasDeArea = new Map<string, AsignaturaEntrada[]>();
    for (const f of filas) filasDeArea.set(f.area_id, [...(filasDeArea.get(f.area_id) ?? []), f]);
    const areasEntrada: AreaEntrada[] = [...filasDeArea.entries()].map(([areaId, lista]) => {
      const { metodo, porcentajes } = evaluacionDeArea(areaId);
      const pesos = (campo: 'nota_antes' | 'nota_final') => lista.map((f) => ({ nota: f[campo], porcentaje: porcentajes.get(f.subject_id) ?? null }));
      return {
        area_id: areaId,
        nombre: nombreArea.get(areaId) ?? '',
        nota_antes: calcularNotaArea(pesos('nota_antes'), metodo),
        nota_final: calcularNotaArea(pesos('nota_final'), metodo),
        recuperacion: lista.some((f) => f.recuperacion === 'NO_SUPERADA') ? 'NO_SUPERADA' : null,
      };
    });

    const global = asistenciaGlobal.get(estudianteId);
    resultado.push({
      enrollment_id: String(matricula._id),
      student_id: estudianteId,
      entrada: {
        grado_id: String(grupo.grade_id),
        nivel: grado?.nivel ?? '',
        nota_aprobatoria: escala.nota_aprobatoria,
        asignaturas: filas,
        areas: areasEntrada,
        promedio_general: calcularPromedioGeneral(areasEntrada.map((a) => (momento === 'CIERRE' ? a.nota_antes : a.nota_final))),
        inasistencia_global_total_pct: global?.porcentaje_ausentismo ?? 0,
        inasistencia_global_injustificada_pct: porcentajeDe(global?.fallas_injustificadas ?? 0, global?.total_registros ?? 0),
        faltas_por_gravedad: faltasPorEstudiante.get(estudianteId) ?? {},
        tiene_piar: conPiar.has(estudianteId),
        admite_recuperacion_final: politicaRecuperaciones.anual.aplica,
        max_recuperables: politicaRecuperaciones.anual.max_asignaturas_pendientes,
      },
    });
  }
  return resultado;
}
