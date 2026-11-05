import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { MomentoPromocion } from '../constants/promocion';
import { PERIODO_DE_RECUPERACION_ANUAL } from '../constants/recuperaciones';
import { AcademicYearDocument } from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Grade from '../models/grade.model';
import { GroupDocument } from '../models/group.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { calcularNotaArea, calcularPromedioGeneral } from '../utils/calculoNotas';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { obtenerGradoPlanEfectivo } from '../utils/horasPlanEstudios';
import { AreaEntrada, AsignaturaEntrada, EntradaPromocion, EstadoRecuperacionEntrada } from '../utils/promocion';
import { asistenciaDeGrupos, AsistenciaDeGrupos, calcularEstadisticas, TotalesAsistencia } from './attendanceStats.service';
import { obtenerPolitica as obtenerPoliticaRecuperaciones } from './configuracionRecuperaciones.service';
import { contarPorEstudiante, faltasContadas } from './faltasConvivencia.service';
import { cargarContextoNotas, cargarDatosDelAnio, claveRecuperacion, definitivaAnual } from './recuperacion.service';

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

type GrupoParaEntradas = Pick<GroupDocument, '_id' | 'grade_id' | 'sede_id' | 'jornada_id'>;

export interface OpcionesEntradas {
  /** La asistencia de TODO el año de estos grupos, si quien llama ya la tiene (la sábana la necesita también para sus fallas). */
  asistencia?: AsistenciaDeGrupos;
}

/** Cuántos grupos se resuelven juntos: lo bastante para amortizar las consultas y lo bastante pocos para no cargar toda la institución en memoria. */
const GRUPOS_POR_LOTE = 25;

/**
 * Arma, para cada estudiante con matrícula activa de cada grupo, lo que el motor necesita (utils/promocion.ts). Solo LEE: notas cerradas de M12
 * con la recuperación de periodo de M18 ya aplicada, recuperación final de M18, asistencia de M13, faltas de M14/M15 y la existencia de un PIAR
 * activo de M16 (nunca su modalidad ni su categoría). Los pesos de cada área son los de M06; si el área no tiene ponderación se promedia.
 *
 * Los reportes de cierre piden decenas de grupos a la vez. Hacerlo grupo por grupo repetía las mismas consultas (y una agregación de asistencia por
 * cada asignatura de cada grupo); aquí los datos del año se leen una vez y los del resto, una vez por lote de grupos, y se reparten con mapas por
 * id. El resultado es el mismo que grupo por grupo.
 */
export async function construirEntradasDeGrupos(
  anio: AcademicYearDocument,
  grupos: readonly GrupoParaEntradas[],
  momento: MomentoPromocion,
  opciones: OpcionesEntradas = {}
): Promise<Map<string, EntradaDeEstudiante[]>> {
  const resultado = new Map<string, EntradaDeEstudiante[]>(grupos.map((g) => [String(g._id), []]));
  if (grupos.length === 0) return resultado;

  // Lo del año se lee solo si algún lote tiene matriculados (un grupo vacío no debe costar nada).
  const cargarDelAnio = async () => {
    const [planDelAnio, politicaRecuperaciones, datosDelAnio, grados] = await Promise.all([
      StudyPlan.findOne({ academic_year_id: anio._id }),
      obtenerPoliticaRecuperaciones(anio),
      cargarDatosDelAnio(anio),
      Grade.find({ _id: { $in: [...new Set(grupos.map((g) => String(g.grade_id)))] } }).select('nivel').lean(),
    ]);
    return { planDelAnio, politicaRecuperaciones, datosDelAnio, nivelDeGrado: new Map(grados.map((g) => [String(g._id), g.nivel ?? ''])) };
  };
  let delAnio: ReturnType<typeof cargarDelAnio> | null = null;

  for (let desde = 0; desde < grupos.length; desde += GRUPOS_POR_LOTE) {
    const lote = grupos.slice(desde, desde + GRUPOS_POR_LOTE);
    const idsDelLote = lote.map((g) => g._id);

    const matriculas = await Enrollment.find({ group_id: { $in: idsDelLote }, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
      .select('student_id group_id')
      .lean();
    if (matriculas.length === 0) continue;
    delAnio ??= cargarDelAnio();
    const { planDelAnio, politicaRecuperaciones, datosDelAnio, nivelDeGrado } = await delAnio;

    const matriculasPorGrupo = new Map<string, typeof matriculas>();
    for (const m of matriculas) {
      const g = String(m.group_id);
      const lista = matriculasPorGrupo.get(g);
      if (lista) lista.push(m);
      else matriculasPorGrupo.set(g, [m]);
    }
    const estudiantesIds = matriculas.map((m) => m.student_id);

    const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, group_id: { $in: idsDelLote }, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO })
      .select('_id subject_id group_id')
      .lean();
    const asignacionesPorGrupo = new Map<string, typeof asignaciones>();
    for (const a of asignaciones) {
      const g = String(a.group_id);
      const lista = asignacionesPorGrupo.get(g);
      if (lista) lista.push(a);
      else asignacionesPorGrupo.set(g, [a]);
    }

    const [{ asignaturaPorId, nombreArea }, ctx, asistencia, faltas, expedientes] = await Promise.all([
      (async () => {
        const asignaturas = await Subject.find({ _id: { $in: [...new Set(asignaciones.map((a) => String(a.subject_id)))] } }).select('nombre area_id').lean();
        const areas = await Area.find({ _id: { $in: [...new Set(asignaturas.map((s) => String(s.area_id)))] } }).select('nombre').lean();
        return { asignaturaPorId: new Map(asignaturas.map((s) => [String(s._id), s])), nombreArea: new Map(areas.map((a) => [String(a._id), a.nombre])) };
      })(),
      cargarContextoNotas(anio, asignaciones.map((a) => a._id), datosDelAnio),
      opciones.asistencia ?? asistenciaDeGrupos(String(anio._id), idsDelLote.map(String)),
      // Tipo I del Observador y tipo II/III solo con decisión en firme del caso (ver `faltasContadas`).
      faltasContadas({ academic_year_id: anio._id, estudiantes_ids: estudiantesIds }),
      // Solo se pregunta si existe un PIAR vigente: la comisión no necesita (ni debe ver) su categoría ni su modalidad.
      ExpedienteInclusion.find({ academic_year_id: anio._id, student_id: { $in: estudiantesIds }, tipo: 'PIAR', estado: 'ACTIVO' }).select('student_id').lean(),
    ]);
    const escala = escalaEfectiva(anio.escala_evaluacion);
    const conPiar = new Set(expedientes.map((e) => String(e.student_id)));
    const faltasPorEstudiante = contarPorEstudiante(faltas);

    for (const grupo of lote) {
      const grupoId = String(grupo._id);
      const matriculasDelGrupo = matriculasPorGrupo.get(grupoId) ?? [];
      if (matriculasDelGrupo.length === 0) continue;
      const asignacionesDelGrupo = asignacionesPorGrupo.get(grupoId) ?? [];
      const asistenciaDelGrupo = asistencia.get(grupoId);

      const gradoPlan =
        obtenerGradoPlanEfectivo(planDelAnio, String(grupo.grade_id), grupo.sede_id ? String(grupo.sede_id) : null, grupo.jornada_id ? String(grupo.jornada_id) : null) ??
        planDelAnio?.grades.find((g) => String(g.grade_id) === String(grupo.grade_id));
      const personalizacion = gradoPlan?.personalizaciones_grupo.find((p) => String(p.group_id) === grupoId);

      // Cómo se calcula la nota de cada área (M06): la personalizada del grupo si existe, si no la del grado; sin ninguna, aritmético.
      const evaluacionDeArea = (areaId: string) => {
        const e = personalizacion?.evaluaciones_area_personalizadas.find((x) => String(x.area_id) === areaId) ?? gradoPlan?.evaluaciones_area.find((x) => String(x.area_id) === areaId);
        return e ? { metodo: e.metodo_calculo, porcentajes: new Map(e.asignaturas.map((a) => [String(a.subject_id), a.porcentaje])) } : { metodo: 'ARITMETICO' as const, porcentajes: new Map<string, number>() };
      };

      const entradasDelGrupo: EntradaDeEstudiante[] = [];
      for (const matricula of matriculasDelGrupo) {
        const estudianteId = String(matricula.student_id);
        const asistenciaDelEstudiante = asistenciaDelGrupo?.get(estudianteId);
        const filas: AsignaturaEntrada[] = [];
        for (const asignacion of asignacionesDelGrupo) {
          const subject = asignaturaPorId.get(String(asignacion.subject_id));
          if (!subject) continue;
          const notaAntes = definitivaAnual(ctx, asignacion._id, estudianteId);
          const perdida = notaAntes !== null && notaAntes < escala.nota_aprobatoria;
          // Las recuperaciones del año ya vienen en el contexto de notas (de cualquier tipo): no hace falta otra consulta.
          const recuperacion = ctx.recuperaciones.get(claveRecuperacion(asignacion._id, estudianteId, 'ANUAL', PERIODO_DE_RECUPERACION_ANUAL));
          let estado: EstadoRecuperacionEntrada = null;
          if (perdida) estado = recuperacion ? recuperacion.estado : momento === 'TRAS_RECUPERACION' ? 'NO_PRESENTO' : 'PENDIENTE';
          const totales = asistenciaDelEstudiante?.porAsignatura.get(String(asignacion.subject_id));
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
        for (const f of filas) {
          const lista = filasDeArea.get(f.area_id);
          if (lista) lista.push(f);
          else filasDeArea.set(f.area_id, [f]);
        }
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

        const global = asistenciaDelEstudiante?.global;
        entradasDelGrupo.push({
          enrollment_id: String(matricula._id),
          student_id: estudianteId,
          entrada: {
            grado_id: String(grupo.grade_id),
            nivel: nivelDeGrado.get(String(grupo.grade_id)) ?? '',
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
      resultado.set(grupoId, entradasDelGrupo);
    }
  }
  return resultado;
}

/** Lo mismo para un solo grupo (cierre de promoción, informe final, comisión). */
export async function construirEntradasDelGrupo(anio: AcademicYearDocument, grupo: GrupoParaEntradas, momento: MomentoPromocion): Promise<EntradaDeEstudiante[]> {
  return (await construirEntradasDeGrupos(anio, [grupo], momento)).get(String(grupo._id)) ?? [];
}
