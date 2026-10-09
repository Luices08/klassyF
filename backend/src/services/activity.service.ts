import { Types } from 'mongoose';
import { FormatoEvidencia, TipoActividad } from '../constants/actividades';
import { ComponenteSiee, ESTADOS_MATRICULA_ACTIVOS, EstadoDesarrolloCurricular } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Activity, { ActivityDocument, IActivity } from '../models/activity.model';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ActivitySubmission, { ActivitySubmissionDocument } from '../models/activitySubmission.model';
import CurricularDevelopment, { CurricularDevelopmentDocument } from '../models/curricularDevelopment.model';
import Enrollment from '../models/enrollment.model';
import { Dba } from '../models/referenteCurricular.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { estadoDeEntrega, evaluarVentanaEntrega, normalizarTexto } from '../utils/actividades';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
import { validarNotaDentroDeEscala } from '../utils/escalaEvaluacion';
import { runTransaction } from '../utils/runTransaction';
import { ContextoAsignacion, contextosDeAsignaciones } from './actividadContexto.service';
import { exigirAlertasResueltas, revisarCalendario } from './actividadCalendario.service';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { fechaDeClase } from './attendance.service';
import { assertPeriodNotLocked } from './periodLock.service';

export type ActividadPlana = IActivity & { _id: Types.ObjectId };

export interface VistaActividad {
  _id: string;
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: ComponenteSiee;
  peso_en_componente: number;
  fecha_apertura: Date;
  fecha_entrega: Date;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  desarrollo_curricular_id: string | null;
  dba_id: string | null;
  dba: { _id: string; numero_dba: number; enunciado: string } | null;
  competencia_evaluada: string | null;
  publicada: boolean;
  vencida: boolean;
  asignacion: ContextoAsignacion | null;
}

/**
 * La actividad tal como viaja por la API. Las anteriores a M11 no guardan los campos nuevos: se leen con los valores
 * que ya tenían en la práctica (tarea con entrega, sin entrega tardía).
 */
export async function armarVistas(actividades: ActividadPlana[], ahora = new Date()): Promise<VistaActividad[]> {
  if (actividades.length === 0) return [];

  const dbaIds = actividades.map((a) => a.dba_id).filter((id): id is Types.ObjectId => Boolean(id));
  const [contextos, dbas] = await Promise.all([
    contextosDeAsignaciones([...new Set(actividades.map((a) => String(a.teacher_assignment_id)))]),
    dbaIds.length > 0 ? Dba.find({ _id: { $in: dbaIds } }).select('numero_dba enunciado').lean() : Promise.resolve([]),
  ]);
  const dbaPorId = new Map(dbas.map((d) => [String(d._id), { _id: String(d._id), numero_dba: d.numero_dba, enunciado: d.enunciado }]));

  return actividades.map((a) => {
    const ventana = evaluarVentanaEntrega(
      { fecha_apertura: a.fecha_apertura, fecha_entrega: a.fecha_entrega, permite_entrega_tardia: a.permite_entrega_tardia ?? false },
      ahora
    );
    return {
      _id: String(a._id),
      teacher_assignment_id: String(a.teacher_assignment_id),
      periodo_numero: a.periodo_numero,
      titulo: a.titulo,
      descripcion: a.descripcion,
      tipo: a.tipo ?? 'TAREA',
      componente_siee: a.componente_siee,
      peso_en_componente: a.peso_en_componente,
      fecha_apertura: a.fecha_apertura,
      fecha_entrega: a.fecha_entrega,
      requiere_entrega: a.requiere_entrega ?? true,
      formatos_permitidos: a.formatos_permitidos ?? [],
      permite_entrega_tardia: a.permite_entrega_tardia ?? false,
      desarrollo_curricular_id: a.desarrollo_curricular_id ? String(a.desarrollo_curricular_id) : null,
      dba_id: a.dba_id ? String(a.dba_id) : null,
      dba: a.dba_id ? (dbaPorId.get(String(a.dba_id)) ?? null) : null,
      competencia_evaluada: a.competencia_evaluada ?? null,
      publicada: ventana.publicada,
      vencida: ventana.vencida,
      asignacion: contextos.get(String(a.teacher_assignment_id)) ?? null,
    };
  });
}

// --- Contexto del docente (M08) y planeación aprobada (M07) ---

/** Filtro de identidad: un docente solo programa actividades de las clases que tiene asignadas (M08). */
export async function asignacionDelDocente(id: string | Types.ObjectId, docente: UserDocument): Promise<TeacherAssignmentDocument> {
  const asignacion = await TeacherAssignment.findById(id);
  if (!asignacion) throw new ApiError(404, 'Asignacion academica (TeacherAssignment) no encontrada.');
  if (String(asignacion.docente_id) !== String(docente._id)) {
    throw new ApiError(403, 'Solo el docente titular de esta asignacion puede gestionar actividades sobre ella.');
  }
  if (asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) {
    throw new ApiError(400, 'Las actividades solo se programan sobre asignaciones de tipo CLASE (un grupo y una asignatura).');
  }
  if (asignacion.estado === 'inactivo') throw new ApiError(400, 'Esta asignación académica ya no está activa.');
  return asignacion;
}

const NOMBRE_ESTADO_PLANEACION: Record<EstadoDesarrolloCurricular, string> = {
  BORRADOR: 'en borrador',
  ENVIADO_REVISION: 'en revisión de coordinación',
  DEVUELTO_OBSERVACIONES: 'devuelta con observaciones',
  APROBADO: 'aprobada',
};

/** Prerrequisito de M11: no se programa una actividad sin la planeación del periodo APROBADA por coordinación. */
async function planeacionAprobada(asignacion: TeacherAssignmentDocument, periodo: number): Promise<CurricularDevelopmentDocument> {
  const planeacion = await CurricularDevelopment.findOne({ teacher_assignment_id: asignacion._id, periodo_numero: periodo });
  if (!planeacion) {
    throw new ApiError(
      409,
      `Aún no has formulado la planeación curricular del periodo ${periodo}. Constrúyela en «Planeación curricular» y espera la aprobación de coordinación para programar actividades.`
    );
  }
  if (planeacion.estado !== 'APROBADO') {
    throw new ApiError(
      409,
      `La planeación curricular del periodo ${periodo} está ${NOMBRE_ESTADO_PLANEACION[planeacion.estado]}: coordinación debe aprobarla antes de programar actividades.`
    );
  }
  return planeacion;
}

/** Toda actividad mide algo de la planeación aprobada: un DBA suyo o una de sus competencias. */
function validarReferente(planeacion: CurricularDevelopmentDocument, dbaId: string | null | undefined, competencia: string | null | undefined): void {
  const competenciaLimpia = competencia?.trim();
  if (!dbaId && !competenciaLimpia) {
    throw new ApiError(400, 'Indica qué DBA o competencia de tu planeación aprobada evalúa esta actividad.');
  }
  if (dbaId && !planeacion.dba_seleccionados.some((d) => String(d) === String(dbaId))) {
    throw new ApiError(400, 'El DBA elegido no hace parte de tu planeación aprobada de este periodo.');
  }
  if (competenciaLimpia && !normalizarTexto(planeacion.competencias).includes(normalizarTexto(competenciaLimpia))) {
    throw new ApiError(400, 'La competencia elegida no hace parte de tu planeación aprobada de este periodo.');
  }
}

function exigirPeriodoAbierto(anio: AcademicYearDocument, periodo: number): void {
  const encontrado = anio.periodos.find((p) => p.numero === periodo);
  if (!encontrado) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodo}.`);
  if (encontrado.estado === 'CERRADO') {
    throw new ApiError(409, `El periodo ${periodo} está CERRADO: ya no se programan ni se modifican actividades.`);
  }
}

// --- Gestión (CU-DOC-02) ---

export interface CreateActivityInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: ComponenteSiee;
  peso_en_componente: number;
  fecha_apertura: string | Date;
  fecha_entrega: string | Date;
  requiere_entrega?: boolean;
  formatos_permitidos?: FormatoEvidencia[];
  permite_entrega_tardia?: boolean;
  dba_id?: string | null;
  competencia_evaluada?: string | null;
  confirmar_alertas?: boolean;
}

export async function createActivity(input: CreateActivityInput, docente: UserDocument, ip?: string | null): Promise<ActivityDocument> {
  const asignacion = await asignacionDelDocente(input.teacher_assignment_id, docente);
  // Un año CERRADO es historico de solo lectura, igual que en el resto de modulos.
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  exigirPeriodoAbierto(anio, input.periodo_numero);

  const planeacion = await planeacionAprobada(asignacion, input.periodo_numero);
  validarReferente(planeacion, input.dba_id, input.competencia_evaluada);

  const requiereEntrega = input.requiere_entrega ?? true;
  const fechaEntrega = new Date(input.fecha_entrega);
  const revision = await revisarCalendario(asignacion, {
    periodo_numero: input.periodo_numero,
    fecha_entrega: fechaEntrega,
    tipo: input.tipo,
    exigir_futuro: requiereEntrega,
  });
  exigirAlertasResueltas(revision.alertas, input.confirmar_alertas ?? false);

  const actividad = await Activity.create({
    teacher_assignment_id: asignacion._id,
    periodo_numero: input.periodo_numero,
    titulo: input.titulo,
    descripcion: input.descripcion,
    tipo: input.tipo,
    componente_siee: input.componente_siee,
    peso_en_componente: input.peso_en_componente,
    fecha_apertura: input.fecha_apertura,
    fecha_entrega: fechaEntrega,
    requiere_entrega: requiereEntrega,
    formatos_permitidos: requiereEntrega ? (input.formatos_permitidos ?? []) : [],
    permite_entrega_tardia: input.permite_entrega_tardia ?? false,
    desarrollo_curricular_id: planeacion._id,
    dba_id: input.dba_id ?? null,
    competencia_evaluada: input.competencia_evaluada?.trim() || null,
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_CREADA',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: `${input.tipo} «${input.titulo}», periodo ${input.periodo_numero}.`,
    ip,
  });
  return actividad;
}

export interface UpdateActivityInput {
  titulo?: string;
  descripcion?: string;
  tipo?: TipoActividad;
  componente_siee?: ComponenteSiee;
  peso_en_componente?: number;
  fecha_apertura?: string | Date;
  fecha_entrega?: string | Date;
  requiere_entrega?: boolean;
  formatos_permitidos?: FormatoEvidencia[];
  permite_entrega_tardia?: boolean;
  dba_id?: string | null;
  competencia_evaluada?: string | null;
  confirmar_alertas?: boolean;
}

/**
 * El periodo y la asignación no se cambian (una actividad de otro periodo exige otra planeación aprobada: se elimina
 * y se programa de nuevo). Lo que ya tiene notas no cambia de componente ni de peso: eso es de M12.
 */
export async function updateActivity(
  id: string,
  cambios: UpdateActivityInput,
  docente: UserDocument,
  ip?: string | null
): Promise<ActivityDocument> {
  const actividad = await Activity.findById(id);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await asignacionDelDocente(actividad.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  exigirPeriodoAbierto(anio, actividad.periodo_numero);

  const entregas = await ActivitySubmission.find({ activity_id: actividad._id }).select('calificacion_numerica fecha_entrega').lean();
  const hayNotas = entregas.some((e) => typeof e.calificacion_numerica === 'number');
  const hayEntregas = entregas.some((e) => e.fecha_entrega);

  const cambiaPeso =
    (cambios.componente_siee !== undefined && cambios.componente_siee !== actividad.componente_siee) ||
    (cambios.peso_en_componente !== undefined && cambios.peso_en_componente !== actividad.peso_en_componente);
  if (hayNotas && cambiaPeso) {
    throw new ApiError(409, 'La actividad ya tiene notas: no se puede cambiar su componente ni su peso.');
  }
  if (cambios.requiere_entrega === false && (actividad.requiere_entrega ?? true) && hayEntregas) {
    throw new ApiError(409, 'Ya hay estudiantes que entregaron: la actividad no puede pasar a no recibir entregas.');
  }

  const dbaCambia = cambios.dba_id !== undefined;
  const competenciaCambia = cambios.competencia_evaluada !== undefined;
  if (dbaCambia || competenciaCambia) {
    const planeacion = await planeacionAprobada(asignacion, actividad.periodo_numero);
    validarReferente(
      planeacion,
      dbaCambia ? cambios.dba_id : (actividad.dba_id && String(actividad.dba_id)),
      competenciaCambia ? cambios.competencia_evaluada : actividad.competencia_evaluada
    );
    actividad.desarrollo_curricular_id = planeacion._id;
  }

  const fechaCambia = cambios.fecha_entrega !== undefined;
  const tipoCambia = cambios.tipo !== undefined && cambios.tipo !== (actividad.tipo ?? 'TAREA');
  const requiereEntrega = cambios.requiere_entrega ?? actividad.requiere_entrega ?? true;
  if (fechaCambia || tipoCambia) {
    const revision = await revisarCalendario(asignacion, {
      periodo_numero: actividad.periodo_numero,
      fecha_entrega: new Date(cambios.fecha_entrega ?? actividad.fecha_entrega),
      tipo: cambios.tipo ?? actividad.tipo ?? 'TAREA',
      excluir_id: actividad._id,
      exigir_futuro: fechaCambia && requiereEntrega,
    });
    exigirAlertasResueltas(revision.alertas, cambios.confirmar_alertas ?? false);
  }

  const { confirmar_alertas: _confirmar, dba_id, competencia_evaluada, ...resto } = cambios;
  actividad.set(resto);
  if (dbaCambia) actividad.dba_id = dba_id ? new Types.ObjectId(dba_id) : null;
  if (competenciaCambia) actividad.competencia_evaluada = competencia_evaluada?.trim() || null;
  if (!requiereEntrega) actividad.formatos_permitidos = [];
  await actividad.save();

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ACTUALIZADA',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: Object.keys(resto).concat(dbaCambia ? ['dba_id'] : [], competenciaCambia ? ['competencia_evaluada'] : []).join(', '),
    ip,
  });
  return actividad;
}

/** Solo se elimina lo que ningún estudiante ha tocado; con entregas o notas queda como registro del periodo. */
export async function deleteActivity(id: string, docente: UserDocument, ip?: string | null): Promise<void> {
  const actividad = await Activity.findById(id);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await asignacionDelDocente(actividad.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));

  if (await ActivitySubmission.exists({ activity_id: actividad._id })) {
    throw new ApiError(409, 'La actividad ya tiene entregas o notas de estudiantes: no se puede eliminar.');
  }
  await actividad.deleteOne();

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ELIMINADA',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: `«${actividad.titulo}», periodo ${actividad.periodo_numero}.`,
    ip,
  });
}

export interface RevisionCalendarioQuery {
  teacher_assignment_id: string;
  periodo_numero: number;
  fecha_entrega: Date;
  tipo: TipoActividad;
  excluir_id?: string;
  exigir_futuro?: boolean;
}

/** Alerta temprana mientras el docente elige la fecha: la misma revisión que repetirá el servidor al guardar. */
export async function revisionDeCalendario(query: RevisionCalendarioQuery, docente: UserDocument) {
  const asignacion = await asignacionDelDocente(query.teacher_assignment_id, docente);
  return revisarCalendario(asignacion, {
    periodo_numero: query.periodo_numero,
    fecha_entrega: query.fecha_entrega,
    tipo: query.tipo,
    excluir_id: query.excluir_id,
    exigir_futuro: query.exigir_futuro ?? true,
  });
}

// --- Consulta ---

export interface ListActivitiesQuery {
  academic_year_id?: string;
  teacher_assignment_id?: string;
  group_id?: string;
  periodo?: number;
  tipo?: TipoActividad;
  /** YYYY-MM-DD, sobre la fecha de entrega. */
  desde?: string;
  hasta?: string;
}

export interface ResumenEntregas {
  estudiantes: number;
  entregadas: number;
  con_retraso: number;
  calificadas: number;
}

async function anioEnCursoId(): Promise<string | null> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('_id');
  return anio ? String(anio._id) : null;
}

async function resumenesDeEntrega(actividades: ActividadPlana[]): Promise<Map<string, ResumenEntregas>> {
  const asignaciones = await TeacherAssignment.find({ _id: { $in: actividades.map((a) => a.teacher_assignment_id) } })
    .select('group_id')
    .lean();
  const grupoDe = new Map(asignaciones.map((a) => [String(a._id), a.group_id ? String(a.group_id) : null]));
  const grupos = [...new Set([...grupoDe.values()].filter((g): g is string => g !== null))];

  const [matriculas, entregas] = await Promise.all([
    Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { group_id: { $in: grupos.map((g) => new Types.ObjectId(g)) }, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } } },
      { $group: { _id: '$group_id', n: { $sum: 1 } } },
    ]),
    ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) } })
      .select('activity_id estado calificacion_numerica fecha_entrega con_retraso')
      .lean(),
  ]);
  const estudiantesPorGrupo = new Map(matriculas.map((m) => [String(m._id), m.n]));

  const resumenes = new Map<string, ResumenEntregas>();
  for (const a of actividades) {
    const grupo = grupoDe.get(String(a.teacher_assignment_id));
    resumenes.set(String(a._id), {
      estudiantes: grupo ? (estudiantesPorGrupo.get(grupo) ?? 0) : 0,
      entregadas: 0,
      con_retraso: 0,
      calificadas: 0,
    });
  }
  for (const e of entregas) {
    const resumen = resumenes.get(String(e.activity_id));
    if (!resumen) continue;
    const estado = estadoDeEntrega(e);
    if (estado !== 'PROGRAMADA') resumen.entregadas += 1;
    if (e.con_retraso || estado === 'ENTREGADA_TARDE') resumen.con_retraso += 1;
    if (estado === 'CALIFICADA') resumen.calificadas += 1;
  }
  return resumenes;
}

/**
 * El docente ve las suyas; coordinación y administración, las de cualquier docente (del año vigente si no piden otro).
 * Los estudiantes no entran por aquí: su bandeja es `listarMisActividades`.
 */
export async function listActivities(query: ListActivitiesQuery, usuario: UserDocument) {
  const anioId = query.academic_year_id ?? (await anioEnCursoId());
  if (!anioId) return [];

  const filtroAsignaciones: Record<string, unknown> = { academic_year_id: anioId, tipo_asignacion: 'CLASE' };
  if (usuario.rol === ROLES.DOCENTE) filtroAsignaciones.docente_id = usuario._id;
  if (query.group_id) filtroAsignaciones.group_id = query.group_id;
  if (query.teacher_assignment_id) filtroAsignaciones._id = query.teacher_assignment_id;
  const asignaciones = await TeacherAssignment.find(filtroAsignaciones).select('_id').lean();

  const filtro: Record<string, unknown> = { teacher_assignment_id: { $in: asignaciones.map((a) => a._id) } };
  if (query.periodo) filtro.periodo_numero = query.periodo;
  if (query.tipo) filtro.tipo = query.tipo;
  if (query.desde || query.hasta) {
    filtro.fecha_entrega = {
      ...(query.desde ? { $gte: inicioDelDia(fechaDeClase(query.desde)) } : {}),
      ...(query.hasta ? { $lte: finDelDia(fechaDeClase(query.hasta)) } : {}),
    };
  }

  const actividades = (await Activity.find(filtro).sort({ fecha_entrega: 1 }).lean()) as unknown as ActividadPlana[];
  const [vistas, resumenes] = await Promise.all([armarVistas(actividades), resumenesDeEntrega(actividades)]);
  return vistas.map((v) => ({ ...v, resumen: resumenes.get(v._id) as ResumenEntregas }));
}

/** Detalle para quien gestiona (docente titular, coordinación, administración). */
export async function detalleParaGestion(id: string, usuario: UserDocument) {
  const actividad = (await Activity.findById(id).lean()) as unknown as ActividadPlana | null;
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  if (usuario.rol === ROLES.DOCENTE) await asignacionDelDocente(actividad.teacher_assignment_id, usuario);

  const [[vista], resumenes] = await Promise.all([armarVistas([actividad]), resumenesDeEntrega([actividad])]);
  return { ...(vista as VistaActividad), resumen: resumenes.get(String(actividad._id)) as ResumenEntregas };
}

// --- Puente hacia M12 ---

export interface GradeEntryInput {
  student_id: string;
  calificacion_numerica: number;
  retroalimentacion?: string;
}

/**
 * Califica a uno o varios estudiantes de una actividad ("por lote"). Solo el
 * docente titular puede calificar, siempre que el periodo no este CERRADO
 * (bloqueo extemporaneo) y todos los estudiantes esten matriculados en el grupo.
 * Es un upsert por (activity_id, student_id): no requiere que el estudiante
 * haya enviado una entrega previa (ej. actividades actitudinales de aula).
 * Es el punto en que la nota viaja de M11 a M12: la entrega pasa a CALIFICADA.
 */
export async function gradeActivity(
  activityId: string,
  entries: GradeEntryInput[],
  requestingUser: UserDocument
): Promise<ActivitySubmissionDocument[]> {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new ApiError(404, 'Actividad no encontrada.');

  const assignment = await TeacherAssignment.findById(activity.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular puede calificar esta actividad.');
  }
  if (!assignment.group_id) {
    throw new ApiError(400, 'La asignación académica no tiene un grupo asociado.');
  }

  await assertPeriodNotLocked(
    assignment.academic_year_id,
    assignment.group_id,
    activity.periodo_numero,
    requestingUser._id
  );

  // Validacion cruzada con la escala de evaluacion del año (CU-ADM-04): no es forma propia de
  // ActivitySubmission, por eso vive aqui y no en el schema (ver modelo y validador).
  const anio = await AcademicYear.findById(assignment.academic_year_id).select('escala_evaluacion');
  for (const entry of entries) {
    validarNotaDentroDeEscala(entry.calificacion_numerica, anio?.escala_evaluacion ?? null);
  }

  const studentIds = entries.map((e) => e.student_id);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new ApiError(400, 'No se puede calificar dos veces al mismo estudiante en la misma solicitud.');
  }

  const enrollments = await Enrollment.find({
    student_id: { $in: studentIds },
    group_id: assignment.group_id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  const enrolledSet = new Set(enrollments.map((e) => String(e.student_id)));
  const noMatriculados = studentIds.filter((id) => !enrolledSet.has(id));
  if (noMatriculados.length > 0) {
    throw new ApiError(400, `Los siguientes estudiantes no estan matriculados en el grupo: ${noMatriculados.join(', ')}.`);
  }

  return runTransaction(async (session) => {
    const results = await Promise.all(
      entries.map((entry) =>
        ActivitySubmission.findOneAndUpdate(
          { activity_id: activityId, student_id: entry.student_id },
          {
            $set: {
              estado: 'CALIFICADA',
              calificacion_numerica: entry.calificacion_numerica,
              retroalimentacion: entry.retroalimentacion ?? '',
              fecha_calificacion: new Date(),
              docente_id: requestingUser._id,
            },
          },
          { new: true, upsert: true, runValidators: true, session }
        )
      )
    );

    return results.filter((r): r is ActivitySubmissionDocument => r !== null);
  });
}
