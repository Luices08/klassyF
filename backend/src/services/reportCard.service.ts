import { TipoFraseBoletin } from '../constants/boletin';
import { ESTADOS_MATRICULA_ACTIVOS, MetodoCalculoEvaluacion, NivelDesempeno } from '../constants/enums';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument, IEscalaEvaluacion } from '../models/academicYear.model';
import Area, { AreaDocument } from '../models/area.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import { CampusDocument } from '../models/campus.model';
import Enrollment from '../models/enrollment.model';
import FraseDesempeno from '../models/fraseDesempeno.model';
import Group, { GroupDocument } from '../models/group.model';
import Institution from '../models/institution.model';
import { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import Guardian from '../models/guardian.model';
import ObservacionBoletin from '../models/observacionBoletin.model';
import Recuperacion from '../models/recuperacion.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudyPlan from '../models/studyPlan.model';
import Subject, { SubjectDocument } from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularNotaArea, calcularPromedioGeneral } from '../utils/calculoNotas';
import { escalaEfectiva, type ResultadoDesempeno } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { integracionDe } from '../utils/integracionRecuperacion';
import { obtenerGradoPlanEfectivo } from '../utils/horasPlanEstudios';
import { resumenAsistenciaParaBoletin } from './attendanceStats.service';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { exigirBoletinDisponible } from './publicacionBoletin.service';
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
  /** Descripción cualitativa del nivel (banco del colegio, Doc. 11 MEN). Vacía si el colegio no definió texto para ese nivel o la asignatura no está cerrada. */
  descripcion: string;
  /** Apoyo o mejora sugerida para ese nivel (banco del colegio). Vacía cuando el colegio no la definió. */
  recomendacion: string;
  /** Lo que el docente titular escribió de este estudiante en esta asignatura y periodo. */
  observacion_docente: string | null;
  /** La recuperación del periodo (M18), si la hubo: `nota_asignatura` ya la incluye cuando `cuenta` es cierto; si no, solo se anota. */
  recuperacion: { nota_original: number; nota_resultante: number; estado: string; cuenta: boolean; detalle: string } | null;
}

export interface ReportCardArea {
  area_id: string;
  nombre: string;
  /** null si alguna asignatura del área aún no está cerrada. */
  nota_area: number | null;
  desempeno_area: ResultadoDesempeno | null;
  asignaturas: ReportCardAsignatura[];
}

/** Un nivel de la escala institucional con su equivalencia nacional (`nivel`: Superior/Alto/Básico/Bajo; Decreto 1075, art. 2.3.3.3.3.5). */
export interface ReportCardNivelEscala {
  nivel: NivelDesempeno;
  etiqueta: string;
  valor_minimo: number;
  valor_maximo: number;
  es_aprobatorio: boolean;
}

export interface ReportCardResult {
  estudiante: {
    id: string;
    nombre_completo: string;
    documento: string;
    /** Nombre del grado (ej. «Sexto»): la guía de boletines lo pide junto al grupo. */
    grado: string;
    grupo: string;
    jornada: string;
    sede: string;
  };
  periodo: number;
  nombre_periodo: string;
  academic_year: number;
  institucion: { nombre: string; codigo_dane: string; nit: string; resolucion_aprobacion: string };
  /** El boletín es oficial cuando todas sus asignaturas están cerradas. */
  completo: boolean;
  /** Asignaturas que todavía no tienen su planilla cerrada. */
  pendientes: string[];
  /** Solo entre los estudiantes del grupo con boletín completo; null si el de este estudiante no lo está o el colegio no lo muestra. */
  puesto_grupo: number | null;
  mostrar_puesto: boolean;
  total_estudiantes_grupo: number;
  promedio_general_periodo: number | null;
  desempeno_general: ResultadoDesempeno | null;
  asistencia_periodo: {
    total_fallas_justificadas: number;
    total_fallas_injustificadas: number;
    total_retardos: number;
  };
  areas: ReportCardArea[];
  escala: ReportCardNivelEscala[];
  /** Fecha de entrega del informe a las familias, si el colegio la fijó para este periodo. */
  fecha_entrega: Date | null;
  canal_reclamaciones: string;
  /** Fecha de entrega de cada periodo del año (periodicidad de los informes, art. 2.3.3.3.3.4 num. 8); null = el colegio aún no la fijó. */
  calendario_entregas: Array<{ periodo: string; fecha: Date | null }>;
  /** Nombre del director del grupo del estudiante, para la firma del boletín. */
  director_grupo: string | null;
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

/** El boletín de todo un grupo (lo que se imprime en lote): coordinación y secretaría, o el docente que dirige ese grupo. */
async function assertCanViewGroupReportCards(group: GroupDocument, requestingUser: UserDocument): Promise<void> {
  if ([ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA].includes(requestingUser.rol)) return;
  if (requestingUser.rol === ROLES.DOCENTE) {
    const dirige =
      String(group.director_grupo_id ?? '') === String(requestingUser._id) ||
      (await TeacherAssignment.exists({
        docente_id: requestingUser._id,
        group_id: group._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }));
    if (dirige) return;
  }
  throw new ApiError(403, 'Solo coordinación, secretaría o el director del grupo imprimen los boletines de un grupo.');
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

type GrupoPoblado = GroupDocument & { sede_id: CampusDocument; jornada_id: JornadaOperativaDocument; grade_id: { nombre: string } };

/**
 * Todo lo que se carga una sola vez por grupo y periodo (resultados cerrados, asistencia, banco de textos, observaciones,
 * ranking) para que armar el boletín de un estudiante, o de los 40 del grupo, no repita consultas.
 */
interface ContextoGrupo {
  anio: AcademicYearDocument;
  grupo: GrupoPoblado;
  periodoNumero: number;
  nombrePeriodo: string;
  escala: IEscalaEvaluacion;
  institucion: ReportCardResult['institucion'];
  studentIds: string[];
  calcular: (studentId: string) => StudentComputed;
  puestoPor: Map<string, number>;
  asistenciaTotales: Awaited<ReturnType<typeof resumenAsistenciaParaBoletin>>['porEstudiante'];
  fraseDe: (nivel: NivelDesempeno, tipo: TipoFraseBoletin) => string;
  observacionDe: (subjectId: string, studentId: string) => string | null;
  fechaEntrega: Date | null;
  canalReclamaciones: string;
  calendarioEntregas: ReportCardResult['calendario_entregas'];
  directorGrupo: string | null;
  mostrarPuesto: boolean;
  totalEstudiantes: number;
}

async function cargarContextoGrupo(
  anio: AcademicYearDocument,
  grupo: GrupoPoblado,
  periodoNumero: number,
  estudianteExtraId?: string
): Promise<ContextoGrupo> {
  // La escala del año (CU-ADM-04) se captura en una variable propia (no "anio.x") porque TS no reduce el tipo del
  // objeto a traves de las funciones anidadas de mas abajo.
  const escalaEvaluacion = anio.escala_evaluacion;
  const periodo = anio.periodos.find((p) => p.numero === periodoNumero);
  if (!periodo) throw new ApiError(400, `El año ${anio.year} no tiene un periodo ${periodoNumero}.`);

  // ---- 1. Carga cruda (una sola vez para todo el grupo) ----

  const groupEnrollments = await Enrollment.find({
    group_id: grupo._id,
    academic_year_id: anio._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  const studentIds = groupEnrollments.map((e) => String(e.student_id));
  if (estudianteExtraId && !studentIds.includes(estudianteExtraId)) studentIds.push(estudianteExtraId);

  const studyPlan = await StudyPlan.findOne({ academic_year_id: anio._id });
  const gradoPlan =
    obtenerGradoPlanEfectivo(
      studyPlan,
      String(grupo.grade_id),
      grupo.sede_id ? String(grupo.sede_id) : null,
      grupo.jornada_id ? String(grupo.jornada_id) : null
    ) ?? studyPlan?.grades.find((g) => String(g.grade_id) === String(grupo.grade_id));
  const personalizacion = gradoPlan?.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));

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
    group_id: grupo._id,
    academic_year_id: anio._id,
    periodo_numero: periodoNumero,
    estado: { $in: ESTADOS_NOTA_CERRADOS },
  }).lean();
  const cerradoPor = new Map(cerrados.map((c) => [`${String(c.subject_id)}|${String(c.student_id)}`, c]));

  // Recuperaciones de periodo con resultado (M18): la nota cerrada de M12 no se toca, el boletín la reemplaza al armarse.
  const recuperadas = await Recuperacion.find({
    group_id: grupo._id,
    academic_year_id: anio._id,
    tipo: 'PERIODO',
    periodo_numero: periodoNumero,
    nota_resultante: { $ne: null },
  });
  const recuperacionDe = new Map(recuperadas.map((r) => [`${String(r.subject_id)}|${String(r.student_id)}`, r]));

  const { porEstudiante: asistenciaTotales, fallasPorAsignatura } = await resumenAsistenciaParaBoletin(grupo._id, periodoNumero);

  const [frases, observaciones, configuracion, directorGrupo, institucion] = await Promise.all([
    FraseDesempeno.find().lean(),
    ObservacionBoletin.find({ group_id: grupo._id, academic_year_id: anio._id, periodo_numero: periodoNumero }).lean(),
    leerConfiguracionBoletin(),
    directorDelGrupo(grupo),
    Institution.findOne().select('nombre codigo_dane nit resolucion_aprobacion').lean(),
  ]);
  const fraseGuardada = new Map(frases.map((f) => [`${f.nivel}|${f.tipo}`, f.texto]));
  const observacionGuardada = new Map(observaciones.map((o) => [`${String(o.subject_id)}|${String(o.student_id)}`, o.texto]));
  const entrega = configuracion.entregas.find(
    (e) => String(e.academic_year_id) === String(anio._id) && e.periodo_numero === periodoNumero
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
        const recuperada = registro?.resultado ? recuperacionDe.get(`${String(subject._id)}|${studentId}`) : undefined;
        const cuentaRecuperacion = recuperada ? integracionDe(recuperada.integracion).cuenta_en_boletin : false;
        const nota = (cuentaRecuperacion ? recuperada?.nota_resultante : null) ?? registro?.resultado?.nota_asignatura ?? null;
        if (nota === null) pendientes.push(subject.nombre);
        const fallas = fallasPorAsignatura.get(`${String(subject._id)}_${studentId}`) ?? 0;
        const desempeno = nota === null ? null : desempenoCualitativo(nota, escalaEvaluacion);
        return {
          subject_id: String(subject._id),
          nombre: subject.nombre,
          porcentaje_en_area: metodo === 'PONDERADO' ? porcentaje ?? 0 : pesoEquivalente,
          nota_asignatura: nota,
          estado: registro ? (registro.estado as 'CERRADO' | 'DEFINITIVO') : 'SIN_CERRAR',
          desempeno,
          fallas_asignatura: fallas,
          componentes:
            cuentaRecuperacion && recuperada && recuperada.componentes.length > 0
              ? recuperada.componentes.map((c) => ({ clave: c.clave, nombre: c.nombre, porcentaje: c.porcentaje, nota: c.nota }))
              : (registro?.resultado?.componentes ?? []),
          // La descripción y la recomendación dependen del nivel de una nota cerrada; la observación es del docente y no del cálculo.
          descripcion: desempeno ? fraseGuardada.get(`${desempeno.nivel}|DESCRIPCION`) ?? '' : '',
          recomendacion: desempeno ? fraseGuardada.get(`${desempeno.nivel}|RECOMENDACION`) ?? '' : '',
          observacion_docente: observacionGuardada.get(`${String(subject._id)}|${studentId}`) ?? null,
          recuperacion:
            recuperada && registro?.resultado && recuperada.nota_resultante !== null
              ? {
                  nota_original: registro.resultado.nota_asignatura,
                  nota_resultante: recuperada.nota_resultante,
                  estado: recuperada.estado,
                  cuenta: cuentaRecuperacion,
                  detalle: recuperada.detalle,
                }
              : null,
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

  // ---- 3. Ranking (competition ranking: empatados comparten puesto) ----

  const allComputed = studentIds.map((sid) => computeStudent(sid));
  const sorted = allComputed
    .filter((r): r is StudentComputed & { promedio: number } => r.promedio !== null)
    .sort((a, b) => b.promedio - a.promedio);
  const puestoPor = new Map<string, number>();
  let puestoActual = 0;
  let notaAnterior: number | null = null;
  sorted.forEach((entry, idx) => {
    if (notaAnterior === null || entry.promedio !== notaAnterior) {
      puestoActual = idx + 1;
      notaAnterior = entry.promedio;
    }
    puestoPor.set(entry.studentId, puestoActual);
  });

  return {
    anio,
    grupo,
    periodoNumero,
    nombrePeriodo: periodo.nombre,
    escala: escalaEfectiva(escalaEvaluacion),
    institucion: {
      nombre: institucion?.nombre ?? '',
      codigo_dane: institucion?.codigo_dane ?? '',
      nit: institucion?.nit ?? '',
      resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
    },
    studentIds,
    calcular: (id) => allComputed.find((r) => r.studentId === id) ?? computeStudent(id),
    puestoPor,
    asistenciaTotales,
    fraseDe: (nivel, tipo) => fraseGuardada.get(`${nivel}|${tipo}`) ?? '',
    observacionDe: (subjectId, studentId) => observacionGuardada.get(`${subjectId}|${studentId}`) ?? null,
    fechaEntrega: entrega?.fecha_entrega ?? null,
    canalReclamaciones: configuracion.canal_reclamaciones,
    calendarioEntregas: anio.periodos.map((p) => ({
      periodo: p.nombre || `Periodo ${p.numero}`,
      fecha: configuracion.entregas.find((e) => e.academic_year_id === String(anio._id) && e.periodo_numero === p.numero)?.fecha_entrega ?? null,
    })),
    directorGrupo,
    mostrarPuesto: configuracion.mostrar_puesto,
    totalEstudiantes: allComputed.length,
  };
}

function armarBoletin(ctx: ContextoGrupo, student: UserDocument): ReportCardResult {
  const calculado = ctx.calcular(String(student._id));
  const asistencia = ctx.asistenciaTotales.get(String(student._id)) ?? { justificadas: 0, injustificadas: 0, retardos: 0 };

  return {
    estudiante: {
      id: String(student._id),
      nombre_completo: `${student.nombre} ${student.apellido}`,
      documento: student.numero_documento,
      grado: ctx.grupo.grade_id?.nombre ?? '',
      grupo: ctx.grupo.nomenclatura,
      jornada: ctx.grupo.jornada_id.nombre,
      sede: ctx.grupo.sede_id.nombre,
    },
    periodo: ctx.periodoNumero,
    nombre_periodo: ctx.nombrePeriodo,
    academic_year: ctx.anio.year,
    institucion: ctx.institucion,
    completo: calculado.promedio !== null,
    pendientes: [...new Set(calculado.pendientes)],
    puesto_grupo: ctx.mostrarPuesto ? ctx.puestoPor.get(String(student._id)) ?? null : null,
    mostrar_puesto: ctx.mostrarPuesto,
    total_estudiantes_grupo: ctx.totalEstudiantes,
    promedio_general_periodo: calculado.promedio,
    desempeno_general:
      calculado.promedio === null ? null : desempenoCualitativo(calculado.promedio, ctx.anio.escala_evaluacion),
    asistencia_periodo: {
      total_fallas_justificadas: asistencia.justificadas,
      total_fallas_injustificadas: asistencia.injustificadas,
      total_retardos: asistencia.retardos,
    },
    areas: calculado.areas,
    escala: ctx.escala.rangos.map((r) => ({
      nivel: r.nivel,
      etiqueta: r.etiqueta,
      valor_minimo: r.valor_minimo,
      valor_maximo: r.valor_maximo,
      es_aprobatorio: r.es_aprobatorio,
    })),
    fecha_entrega: ctx.fechaEntrega,
    canal_reclamaciones: ctx.canalReclamaciones,
    calendario_entregas: ctx.calendarioEntregas,
    director_grupo: ctx.directorGrupo,
  };
}

/**
 * El director sale de su asignación de dirección de grupo (M08), que es la fuente; el campo del grupo es solo respaldo (ver la ficha 360 del grupo).
 */
async function directorDelGrupo(grupo: GroupDocument): Promise<string | null> {
  const asignacion = await TeacherAssignment.findOne({ group_id: grupo._id, tipo_asignacion: 'DIRECCION_GRUPO', estado: ESTADO_ACTIVO }).populate<{ docente_id: UserDocument | null }>('docente_id', 'nombre apellido');
  const docente = asignacion?.docente_id ?? (grupo.director_grupo_id ? await User.findById(grupo.director_grupo_id).select('nombre apellido') : null);
  return docente ? `${docente.nombre} ${docente.apellido}` : null;
}

async function cargarGrupoPoblado(groupId: unknown): Promise<GrupoPoblado> {
  const group = await Group.findById(groupId).populate<{
    sede_id: CampusDocument;
    jornada_id: JornadaOperativaDocument;
  }>([
    { path: 'sede_id', select: 'nombre' },
    { path: 'jornada_id', select: 'nombre' },
    { path: 'grade_id', select: 'nombre' },
  ]);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  return group as unknown as GrupoPoblado;
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
 *  - Descripción cualitativa y recomendación (banco del colegio por nivel de desempeño) y la observación del docente.
 *
 * Para evitar N+1 queries al calcular el ranking (que requiere el promedio de
 * TODOS los estudiantes del grupo, no solo el consultado), `cargarContextoGrupo` trae
 * una sola vez todos los datos crudos del grupo+periodo y el resto se calcula en memoria.
 */
export async function generateReportCard(
  params: ReportCardParams,
  requestingUser: UserDocument
): Promise<ReportCardResult> {
  const student = await User.findOne({ _id: params.student_id, roles: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'Estudiante no encontrado.');

  await assertCanViewReportCard(student, requestingUser);

  const academicYear = await AcademicYear.findById(params.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  const enrollment = await Enrollment.findOne({
    student_id: student._id,
    academic_year_id: academicYear._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  if (!enrollment) throw new ApiError(404, 'El estudiante no tiene una matricula activa en ese año lectivo.');

  const group = await cargarGrupoPoblado(enrollment.group_id);

  // El personal ve siempre el boletín; la familia solo cuando el administrador lo publicó (o la dejó pasar como excepción).
  if (requestingUser.rol === ROLES.ESTUDIANTE || requestingUser.rol === ROLES.ACUDIENTE) {
    await exigirBoletinDisponible(
      { group_id: String(group._id), academic_year_id: String(academicYear._id), periodo_numero: params.periodo_numero },
      String(student._id)
    );
  }

  const contexto = await cargarContextoGrupo(academicYear, group, params.periodo_numero, String(student._id));
  return armarBoletin(contexto, student);
}

export interface BoletinesDeGrupoParams {
  group_id: string;
  academic_year_id: string;
  periodo_numero: number;
}

/** Los boletines de todos los estudiantes con matrícula activa del grupo, en orden alfabético por apellido. */
export async function generarBoletinesDeGrupo(
  params: BoletinesDeGrupoParams,
  requestingUser: UserDocument
): Promise<ReportCardResult[]> {
  const group = await cargarGrupoPoblado(params.group_id);
  await assertCanViewGroupReportCards(group, requestingUser);

  const academicYear = await AcademicYear.findById(params.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (String(group.academic_year_id) !== String(academicYear._id)) {
    throw new ApiError(400, 'El grupo no pertenece a ese año lectivo.');
  }

  const contexto = await cargarContextoGrupo(academicYear, group, params.periodo_numero);
  const estudiantes = await User.find({ _id: { $in: contexto.studentIds }, roles: ROLES.ESTUDIANTE }).sort({ apellido: 1, nombre: 1 });
  return estudiantes.map((e) => armarBoletin(contexto, e));
}
