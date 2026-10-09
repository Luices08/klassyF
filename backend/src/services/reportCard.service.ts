import { ESTADOS_MATRICULA_ACTIVOS, MetodoCalculoEvaluacion } from '../constants/enums';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Area, { AreaDocument } from '../models/area.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import { CampusDocument } from '../models/campus.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudyPlan from '../models/studyPlan.model';
import Subject, { SubjectDocument } from '../models/subject.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularNotaArea, calcularPromedioGeneral } from '../utils/calculoNotas';
import type { ResultadoDesempeno } from '../utils/escalaEvaluacion';
import { resumenAsistenciaParaBoletin } from './attendanceStats.service';
import { desempenoCualitativo, round2 } from '../utils/siee';

export interface ReportCardParams {
  student_id: string;
  academic_year_id: string;
  periodo_numero: number;
}

export interface ReportCardComponente {
  clave: string;
  nombre: string;
  porcentaje: number;
  nota: number;
}

export interface ReportCardAsignatura {
  subject_id: string;
  nombre: string;
  porcentaje_en_area: number;
  /** null mientras el docente no cierre la planilla de la asignatura: el boletín solo muestra resultados cerrados. */
  nota_asignatura: number | null;
  estado: 'SIN_CERRAR' | 'CERRADO' | 'DEFINITIVO';
  desempeno: ResultadoDesempeno | null;
  fallas_asignatura: number;
  componentes: ReportCardComponente[];
}

export interface ReportCardArea {
  area_id: string;
  nombre: string;
  /** null si alguna asignatura del área aún no está cerrada. */
  nota_area: number | null;
  desempeno_area: ResultadoDesempeno | null;
  asignaturas: ReportCardAsignatura[];
}

export interface ReportCardResult {
  estudiante: {
    id: string;
    nombre_completo: string;
    documento: string;
    grupo: string;
    jornada: string;
    sede: string;
  };
  periodo: number;
  academic_year: number;
  /** El boletín es oficial cuando todas sus asignaturas están cerradas. */
  completo: boolean;
  /** Asignaturas que todavía no tienen su planilla cerrada. */
  pendientes: string[];
  /** Solo entre los estudiantes del grupo con boletín completo; null si el de este estudiante no lo está. */
  puesto_grupo: number | null;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number | null;
  desempeno_general: ResultadoDesempeno | null;
  asistencia_periodo: {
    total_fallas_justificadas: number;
    total_fallas_injustificadas: number;
    total_retardos: number;
  };
  areas: ReportCardArea[];
}

async function assertCanViewReportCard(student: UserDocument, requestingUser: UserDocument): Promise<void> {
  const STAFF_ROLES = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE];
  if (STAFF_ROLES.includes(requestingUser.rol)) return;

  if (requestingUser.rol === ROLES.ESTUDIANTE) {
    if (String(student._id) !== String(requestingUser._id)) {
      throw new ApiError(403, 'Un estudiante solo puede consultar su propio boletín.');
    }
    return;
  }

  if (requestingUser.rol === ROLES.ACUDIENTE) {
    // El acudiente (M03) es una entidad propia (Guardian), no un User: se
    // ubica por el user_id que se le habilito para el portal y se verifica el
    // vinculo N:M con el estudiante en StudentGuardian.
    const guardian = await Guardian.findOne({ user_id: requestingUser._id });
    const vinculo =
      guardian && (await StudentGuardian.findOne({ student_id: student._id, guardian_id: guardian._id }));
    if (!vinculo) {
      throw new ApiError(403, 'Solo puede consultar el boletín de estudiantes a su cargo.');
    }
    return;
  }

  throw new ApiError(403, 'No tiene permisos para consultar este boletín.');
}

interface AreaGroup {
  area: AreaDocument;
  metodo: MetodoCalculoEvaluacion;
  entries: Array<{ subject: SubjectDocument; porcentaje: number | null }>;
}

interface StudentComputed {
  studentId: string;
  areas: ReportCardArea[];
  promedio: number | null;
  pendientes: string[];
}

/**
 * Genera el boletin (JSON estructurado) de un estudiante para un periodo y año lectivo. La fuente son los resultados
 * CERRADOS o DEFINITIVOS de M12 (lo que el docente cerró, congelado con el cálculo de sus componentes): una nota en
 * borrador nunca llega a un boletín. Lo que M17 calcula aquí es solo lo que M12 no guarda:
 *  - Nota de area = segun el metodo_calculo configurado en M06 para el area
 *    dentro del grado del estudiante (StudyPlan.grades[].evaluaciones_area):
 *    PONDERADO usa el porcentaje de cada asignatura, ARITMETICO promedia las
 *    asignaturas de esa area con el mismo peso. Si el area del grupo tiene su
 *    propia evaluacion personalizada (Distribucion por Grupos, RN-EVAL-02) se
 *    usa esa en vez de la del grado. Sin todas sus asignaturas cerradas, el área no se calcula.
 *  - Promedio general = promedio aritmetico simple de las notas de area (solo con todas calculadas).
 *  - Puesto de grupo = ranking por promedio general entre los estudiantes del grupo con boletín completo
 *    (ranking de competencia estandar: los empatados comparten puesto y el siguiente puesto salta la cantidad de empatados).
 *
 * Para evitar N+1 queries al calcular el ranking (que requiere el promedio de
 * TODOS los estudiantes del grupo, no solo el consultado), esta funcion trae
 * una sola vez todos los datos crudos (resultados cerrados, asistencia) del
 * grupo+periodo y hace el resto del calculo en memoria.
 */
export async function generateReportCard(
  params: ReportCardParams,
  requestingUser: UserDocument
): Promise<ReportCardResult> {
  const student = await User.findOne({ _id: params.student_id, rol: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'Estudiante no encontrado.');

  await assertCanViewReportCard(student, requestingUser);

  const academicYear = await AcademicYear.findById(params.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  // La escala del año (CU-ADM-04) se captura en una variable propia (no "academicYear.x") porque TS no reduce el tipo del
  // objeto a traves de las funciones anidadas de mas abajo.
  const escalaEvaluacion = academicYear.escala_evaluacion;

  const enrollment = await Enrollment.findOne({
    student_id: student._id,
    academic_year_id: academicYear._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  if (!enrollment) throw new ApiError(404, 'El estudiante no tiene una matricula activa en ese año lectivo.');

  const group = await Group.findById(enrollment.group_id).populate<{
    sede_id: CampusDocument;
    jornada_id: JornadaOperativaDocument;
  }>([
    { path: 'sede_id', select: 'nombre' },
    { path: 'jornada_id', select: 'nombre' },
  ]);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');

  // ---- 1. Carga cruda (una sola vez para todo el grupo) ----

  const groupEnrollments = await Enrollment.find({
    group_id: group._id,
    academic_year_id: academicYear._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  const studentIds = groupEnrollments.map((e) => String(e.student_id));
  if (!studentIds.includes(String(student._id))) studentIds.push(String(student._id));

  const studyPlan = await StudyPlan.findOne({ academic_year_id: academicYear._id });
  const gradoPlan = studyPlan?.grades.find((g) => String(g.grade_id) === String(group.grade_id));
  const personalizacion = gradoPlan?.personalizaciones_grupo.find((p) => String(p.group_id) === String(group._id));

  // Malla efectiva del grupo (M06): asignaturas de la Configuracion General
  // del grado mas las asignaturas especificas agregadas para este grupo en
  // Distribucion por Grupos. La intensidad horaria no participa del calculo
  // de notas, solo la ponderacion de Configuracion de Evaluacion.
  const subjectIdsMalla = [
    ...(gradoPlan?.asignaturas.map((a) => String(a.subject_id)) ?? []),
    ...(personalizacion?.asignaturas_agregadas.map((a) => String(a.subject_id)) ?? []),
  ];

  const subjects = await Subject.find({ _id: { $in: subjectIdsMalla } });
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));

  const areaIds = [...new Set(subjects.map((s) => String(s.area_id)))];
  const areas = await Area.find({ _id: { $in: areaIds } });
  const areaById = new Map(areas.map((a) => [String(a._id), a]));

  // Evaluacion efectiva de un area: la personalizada del grupo si existe
  // (RN-EVAL-02), si no la del grado; sin ninguna configurada aun, se asume
  // ARITMETICO (mismo peso) para no bloquear la generacion del boletin.
  const evaluacionCache = new Map<string, { metodo: MetodoCalculoEvaluacion; porcentajes: Map<string, number> }>();
  function evaluacionParaArea(areaId: string): { metodo: MetodoCalculoEvaluacion; porcentajes: Map<string, number> } {
    if (!evaluacionCache.has(areaId)) {
      const personalizada = personalizacion?.evaluaciones_area_personalizadas.find(
        (e) => String(e.area_id) === areaId
      );
      const evaluacion = personalizada ?? gradoPlan?.evaluaciones_area.find((e) => String(e.area_id) === areaId);
      evaluacionCache.set(
        areaId,
        evaluacion
          ? {
              metodo: evaluacion.metodo_calculo,
              porcentajes: new Map(evaluacion.asignaturas.map((a) => [String(a.subject_id), a.porcentaje])),
            }
          : { metodo: 'ARITMETICO', porcentajes: new Map() }
      );
    }
    return evaluacionCache.get(areaId) as { metodo: MetodoCalculoEvaluacion; porcentajes: Map<string, number> };
  }

  // Solo lo cerrado: es la fuente oficial. Una asignatura por estudiante (una clase por asignatura y grupo en el año).
  const cerrados = await CalificacionAsignatura.find({
    group_id: group._id,
    academic_year_id: academicYear._id,
    periodo_numero: params.periodo_numero,
    estado: { $in: ESTADOS_NOTA_CERRADOS },
  }).lean();
  const cerradoPor = new Map(cerrados.map((c) => [`${String(c.subject_id)}|${String(c.student_id)}`, c]));

  const { porEstudiante: asistenciaTotales, fallasPorAsignatura } = await resumenAsistenciaParaBoletin(
    group._id,
    params.periodo_numero
  );

  const areaGroups = new Map<string, AreaGroup>();
  for (const subjectId of subjectIdsMalla) {
    const subject = subjectById.get(subjectId);
    if (!subject) continue;
    const areaId = String(subject.area_id);
    const area = areaById.get(areaId);
    if (!area) continue;

    const { metodo, porcentajes } = evaluacionParaArea(areaId);
    const bucket = areaGroups.get(areaId) ?? { area, metodo, entries: [] };
    bucket.entries.push({ subject, porcentaje: porcentajes.get(subjectId) ?? null });
    areaGroups.set(areaId, bucket);
  }

  // ---- 2. Calculo puro en memoria (sin queries adicionales) ----

  function computeStudent(studentId: string): StudentComputed {
    const areasResult: ReportCardArea[] = [];
    const pendientes: string[] = [];

    for (const { area, metodo, entries } of areaGroups.values()) {
      // Con ARITMETICO no hay ponderacion configurada: se muestra el peso
      // equivalente (100/n) solo a modo informativo, el calculo usa promedio simple.
      const pesoEquivalente = entries.length > 0 ? round2(100 / entries.length) : 0;

      const asignaturas: ReportCardAsignatura[] = entries.map(({ subject, porcentaje }) => {
        const registro = cerradoPor.get(`${String(subject._id)}|${studentId}`);
        const nota = registro?.resultado?.nota_asignatura ?? null;
        if (nota === null) pendientes.push(subject.nombre);
        const fallas = fallasPorAsignatura.get(`${String(subject._id)}_${studentId}`) ?? 0;
        return {
          subject_id: String(subject._id),
          nombre: subject.nombre,
          porcentaje_en_area: metodo === 'PONDERADO' ? porcentaje ?? 0 : pesoEquivalente,
          nota_asignatura: nota,
          estado: registro ? (registro.estado as 'CERRADO' | 'DEFINITIVO') : 'SIN_CERRAR',
          desempeno: nota === null ? null : desempenoCualitativo(nota, escalaEvaluacion),
          fallas_asignatura: fallas,
          componentes: registro?.resultado?.componentes ?? [],
        };
      });

      const notaArea = calcularNotaArea(
        asignaturas.map((a) => ({ nota: a.nota_asignatura, porcentaje: a.porcentaje_en_area })),
        metodo
      );

      areasResult.push({
        area_id: String(area._id),
        nombre: area.nombre,
        nota_area: notaArea,
        desempeno_area: notaArea === null ? null : desempenoCualitativo(notaArea, escalaEvaluacion),
        asignaturas,
      });
    }

    return { studentId, areas: areasResult, promedio: calcularPromedioGeneral(areasResult.map((a) => a.nota_area)), pendientes };
  }

  const allComputed = studentIds.map((sid) => computeStudent(sid));
  const targetComputed = allComputed.find((r) => r.studentId === String(student._id));
  if (!targetComputed) throw new ApiError(500, 'No se pudo calcular el boletín del estudiante.');

  // ---- 3. Ranking (competition ranking: empatados comparten puesto) ----

  const sorted = allComputed
    .filter((r): r is StudentComputed & { promedio: number } => r.promedio !== null)
    .sort((a, b) => b.promedio - a.promedio);
  const rankByStudent = new Map<string, number>();
  let puestoActual = 0;
  let notaAnterior: number | null = null;
  sorted.forEach((entry, idx) => {
    if (notaAnterior === null || entry.promedio !== notaAnterior) {
      puestoActual = idx + 1;
      notaAnterior = entry.promedio;
    }
    rankByStudent.set(entry.studentId, puestoActual);
  });

  const asistenciaTarget = asistenciaTotales.get(String(student._id)) ?? {
    justificadas: 0,
    injustificadas: 0,
    retardos: 0,
  };

  return {
    estudiante: {
      id: String(student._id),
      nombre_completo: `${student.nombre} ${student.apellido}`,
      documento: student.numero_documento,
      grupo: group.nomenclatura,
      jornada: group.jornada_id.nombre,
      sede: group.sede_id.nombre,
    },
    periodo: params.periodo_numero,
    academic_year: academicYear.year,
    completo: targetComputed.promedio !== null,
    pendientes: [...new Set(targetComputed.pendientes)],
    puesto_grupo: rankByStudent.get(String(student._id)) ?? null,
    total_estudiantes_grupo: allComputed.length,
    promedio_general_periodo: targetComputed.promedio,
    desempeno_general: targetComputed.promedio === null ? null : desempenoCualitativo(targetComputed.promedio, escalaEvaluacion),
    asistencia_periodo: {
      total_fallas_justificadas: asistenciaTarget.justificadas,
      total_fallas_injustificadas: asistenciaTarget.injustificadas,
      total_retardos: asistenciaTarget.retardos,
    },
    areas: targetComputed.areas,
  };
}
