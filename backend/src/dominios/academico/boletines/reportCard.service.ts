import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, MetodoCalculoEvaluacion } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import AcademicYear from '../../institucional/calendario/academicYear.model';
import Activity, { ActivityDocument } from '../actividades-notas/activity.model';
import ActivitySubmission from '../actividades-notas/activitySubmission.model';
import Area, { AreaDocument } from '../../curricular/plan-estudios/area.model';
import { CampusDocument } from '../../institucional/estructura/campus.model';
import Enrollment from '../../registro/matriculas/enrollment.model';
import Group from '../../institucional/estructura/group.model';
import { JornadaOperativaDocument } from '../../institucional/estructura/jornadaOperativa.model';
import Guardian from '../../registro/estudiantes/guardian.model';
import StudentGuardian from '../../registro/estudiantes/studentGuardian.model';
import StudyPlan from '../../curricular/plan-estudios/studyPlan.model';
import Subject, { SubjectDocument } from '../../curricular/plan-estudios/subject.model';
import TeacherAssignment from '../../curricular/carga-docente/teacherAssignment.model';
import User, { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import type { ResultadoDesempeno } from '../../institucional';
import { resumenAsistenciaParaBoletin } from '../asistencia/attendanceStats.service';
import { desempenoCualitativo, ponderacionEfectiva, round2 } from '../../institucional';

export interface ReportCardParams {
  student_id: string;
  academic_year_id: string;
  periodo_numero: number;
}

export interface ReportCardComponentes {
  saber: number;
  hacer: number;
  ser: number;
}

export interface ReportCardAsignatura {
  subject_id: string;
  nombre: string;
  porcentaje_en_area: number;
  nota_asignatura: number;
  desempeno: ResultadoDesempeno;
  fallas_asignatura: number;
  componentes: ReportCardComponentes;
}

export interface ReportCardArea {
  area_id: string;
  nombre: string;
  nota_area: number;
  desempeno_area: ResultadoDesempeno;
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
  puesto_grupo: number;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number;
  desempeno_general: ResultadoDesempeno;
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
  promedio: number;
}

/**
 * Genera el boletin (JSON estructurado) de un estudiante para un periodo y año
 * lectivo, aplicando las reglas del Decreto 1290:
 *  - Nota de componente = promedio ponderado (peso_en_componente) de las
 *    actividades calificadas de ese componente. Sin actividades calificadas -> 0.
 *  - Nota de asignatura = Saber*peso + Hacer*peso + Ser*peso, según
 *    AcademicYear.ponderacion_componentes (o el respaldo 40/40/20 — CU-ADM-04).
 *  - Nota de area = segun el metodo_calculo configurado en M06 para el area
 *    dentro del grado del estudiante (StudyPlan.grades[].evaluaciones_area):
 *    PONDERADO usa el porcentaje de cada asignatura, ARITMETICO promedia las
 *    asignaturas de esa area con el mismo peso. Si el area del grupo tiene su
 *    propia evaluacion personalizada (Distribucion por Grupos, RN-EVAL-02) se
 *    usa esa en vez de la del grado.
 *  - Promedio general = promedio aritmetico simple de las notas de area.
 *  - Puesto de grupo = ranking por promedio general entre los MATRICULADOS del
 *    grupo (ranking de competencia estandar: los empatados comparten puesto y
 *    el siguiente puesto salta la cantidad de empatados).
 *
 * Para evitar N+1 queries al calcular el ranking (que requiere el promedio de
 * TODOS los estudiantes del grupo, no solo el consultado), esta funcion trae
 * una sola vez todos los datos crudos (actividades, calificaciones, asistencia)
 * del grupo+periodo y hace el resto del calculo en memoria.
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

  // Configuracion institucional del SIEE para este año (CU-ADM-04): ponderacion de componentes
  // y escala de evaluacion, con sus respaldos mientras la institucion no las personalice. Se
  // capturan en variables propias (no "academicYear.x") porque TS no reduce el tipo del objeto
  // a traves de las funciones anidadas de mas abajo (computeStudent/subjectGrade).
  const ponderacionComponentes = ponderacionEfectiva(academicYear.ponderacion_componentes);
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

  const subjectIds = subjects.map((s) => s._id);
  const assignments = await TeacherAssignment.find({
    subject_id: { $in: subjectIds },
    group_id: group._id,
    academic_year_id: academicYear._id,
  });
  const assignmentBySubject = new Map(assignments.map((a) => [String(a.subject_id), a]));
  const assignmentIds = assignments.map((a) => a._id);

  const activities = await Activity.find({
    teacher_assignment_id: { $in: assignmentIds },
    periodo_numero: params.periodo_numero,
  });
  const activitiesByAssignment = new Map<string, ActivityDocument[]>();
  for (const act of activities) {
    const key = String(act.teacher_assignment_id);
    const bucket = activitiesByAssignment.get(key) ?? [];
    bucket.push(act);
    activitiesByAssignment.set(key, bucket);
  }

  const activityIds = activities.map((a) => a._id);
  const submissions = await ActivitySubmission.find({
    activity_id: { $in: activityIds },
    student_id: { $in: studentIds.map((id) => new Types.ObjectId(id)) },
    calificacion_numerica: { $ne: null },
  });
  const submissionMap = new Map<string, number>();
  for (const sub of submissions) {
    submissionMap.set(`${String(sub.activity_id)}_${String(sub.student_id)}`, sub.calificacion_numerica as number);
  }

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

  function componentScore(assignmentId: string, componente: string, studentId: string): number {
    const acts = (activitiesByAssignment.get(assignmentId) ?? []).filter((a) => a.componente_siee === componente);
    if (acts.length === 0) return 0;

    let sumaPonderada = 0;
    let sumaPesos = 0;
    for (const act of acts) {
      const grade = submissionMap.get(`${String(act._id)}_${studentId}`);
      if (grade === undefined) continue;
      sumaPonderada += grade * act.peso_en_componente;
      sumaPesos += act.peso_en_componente;
    }
    if (sumaPesos === 0) return 0;
    return sumaPonderada / sumaPesos;
  }

  function subjectGrade(subject: SubjectDocument, studentId: string): { nota: number; componentes: ReportCardComponentes } {
    const assignment = assignmentBySubject.get(String(subject._id));
    if (!assignment) return { nota: 0, componentes: { saber: 0, hacer: 0, ser: 0 } };

    const aid = String(assignment._id);
    const saber = componentScore(aid, 'COGNITIVO_SABER', studentId);
    const hacer = componentScore(aid, 'PROCEDIMENTAL_HACER', studentId);
    const ser = componentScore(aid, 'ACTITUDINAL_SER', studentId);

    const nota =
      saber * ponderacionComponentes.COGNITIVO_SABER +
      hacer * ponderacionComponentes.PROCEDIMENTAL_HACER +
      ser * ponderacionComponentes.ACTITUDINAL_SER;

    return {
      nota: round2(nota),
      componentes: { saber: round2(saber), hacer: round2(hacer), ser: round2(ser) },
    };
  }

  function computeStudent(studentId: string): StudentComputed {
    const areasResult: ReportCardArea[] = [];

    for (const { area, metodo, entries } of areaGroups.values()) {
      // Con ARITMETICO no hay ponderacion configurada: se muestra el peso
      // equivalente (100/n) solo a modo informativo, el calculo usa promedio simple.
      const pesoEquivalente = entries.length > 0 ? round2(100 / entries.length) : 0;

      const asignaturas: ReportCardAsignatura[] = entries.map(({ subject, porcentaje }) => {
        const { nota, componentes } = subjectGrade(subject, studentId);
        const fallas = fallasPorAsignatura.get(`${String(subject._id)}_${studentId}`) ?? 0;
        return {
          subject_id: String(subject._id),
          nombre: subject.nombre,
          porcentaje_en_area: metodo === 'PONDERADO' ? porcentaje ?? 0 : pesoEquivalente,
          nota_asignatura: nota,
          desempeno: desempenoCualitativo(nota, escalaEvaluacion),
          fallas_asignatura: fallas,
          componentes,
        };
      });

      const notaArea =
        metodo === 'PONDERADO'
          ? round2(asignaturas.reduce((sum, a) => sum + a.nota_asignatura * (a.porcentaje_en_area / 100), 0))
          : asignaturas.length > 0
            ? round2(asignaturas.reduce((sum, a) => sum + a.nota_asignatura, 0) / asignaturas.length)
            : 0;

      areasResult.push({
        area_id: String(area._id),
        nombre: area.nombre,
        nota_area: notaArea,
        desempeno_area: desempenoCualitativo(notaArea, escalaEvaluacion),
        asignaturas,
      });
    }

    const promedio = areasResult.length > 0 ? round2(areasResult.reduce((s, a) => s + a.nota_area, 0) / areasResult.length) : 0;

    return { studentId, areas: areasResult, promedio };
  }

  const allComputed = studentIds.map((sid) => computeStudent(sid));
  const targetComputed = allComputed.find((r) => r.studentId === String(student._id));
  if (!targetComputed) throw new ApiError(500, 'No se pudo calcular el boletín del estudiante.');

  // ---- 3. Ranking (competition ranking: empatados comparten puesto) ----

  const sorted = [...allComputed].sort((a, b) => b.promedio - a.promedio);
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
    puesto_grupo: rankByStudent.get(String(student._id)) ?? sorted.length,
    total_estudiantes_grupo: sorted.length,
    promedio_general_periodo: targetComputed.promedio,
    desempeno_general: desempenoCualitativo(targetComputed.promedio, escalaEvaluacion),
    asistencia_periodo: {
      total_fallas_justificadas: asistenciaTarget.justificadas,
      total_fallas_injustificadas: asistenciaTarget.injustificadas,
      total_retardos: asistenciaTarget.retardos,
    },
    areas: targetComputed.areas,
  };
}
