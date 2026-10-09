import { ClientSession, Types } from 'mongoose';
import { TipoActividad } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS, NivelDesempeno } from '../constants/enums';
import { ESTADOS_NOTA_CERRADOS, EstadoNota, OrigenComponente } from '../constants/notas';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ActivitySubmission, { ActivitySubmissionDocument } from '../models/activitySubmission.model';
import CalificacionAsignatura, { ICalificacionAsignatura } from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularNotaAsignatura, estadoAbiertoDe, ResultadoAsignatura } from '../utils/calculoNotas';
import { escalaEfectiva, validarNotaDentroDeEscala } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { runTransaction } from '../utils/runTransaction';
import { ComponenteEvaluativo, componentesEfectivos, desempenoCualitativo } from '../utils/siee';
import { ActividadPlana, asignacionDelDocente } from './activity.service';
import { ContextoAsignacion, contextosDeAsignaciones } from './actividadContexto.service';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { matriculasActivas } from './attendance.service';
import { assertPeriodNotLocked } from './periodLock.service';

// --- Contexto de una planilla: una clase (asignación docente) en un periodo ---

type RegistroPlano = ICalificacionAsignatura & { _id: Types.ObjectId };

export interface EstudianteDePlanilla {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface ContextoPlanilla {
  asignacion: TeacherAssignmentDocument;
  anio: AcademicYearDocument;
  periodo: { numero: number; nombre: string; estado: string };
  componentes: ComponenteEvaluativo[];
  actividades: ActividadPlana[];
  estudiantes: EstudianteDePlanilla[];
  /** Notas de actividad ya calificadas: `${actividad}|${estudiante}` -> nota. */
  notasActividad: Map<string, number>;
  /** Una por estudiante que ya tiene algo guardado (nota directa, cierre...). */
  registros: Map<string, RegistroPlano>;
}

export async function cargarContextoPlanilla(asignacion: TeacherAssignmentDocument, periodoNumero: number): Promise<ContextoPlanilla> {
  if (asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) {
    throw new ApiError(400, 'Las notas se registran sobre asignaciones de tipo CLASE (un grupo y una asignatura).');
  }
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  const periodo = anio.periodos.find((p) => p.numero === periodoNumero);
  if (!periodo) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodoNumero}.`);

  const [actividades, matriculas, registros] = await Promise.all([
    Activity.find({ teacher_assignment_id: asignacion._id, periodo_numero: periodoNumero }).sort({ fecha_entrega: 1 }).lean(),
    matriculasActivas(asignacion.group_id),
    CalificacionAsignatura.find({ teacher_assignment_id: asignacion._id, periodo_numero: periodoNumero }).lean(),
  ]);
  const calificadas =
    actividades.length === 0
      ? []
      : await ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) }, calificacion_numerica: { $ne: null } })
          .select('activity_id student_id calificacion_numerica')
          .lean();

  return {
    asignacion,
    anio,
    periodo: { numero: periodo.numero, nombre: periodo.nombre, estado: periodo.estado },
    componentes: componentesEfectivos(anio),
    actividades: actividades as unknown as ActividadPlana[],
    estudiantes: matriculas.map((m) => ({
      _id: String(m.student_id._id),
      nombre: m.student_id.nombre,
      apellido: m.student_id.apellido,
      numero_documento: m.student_id.numero_documento,
    })),
    notasActividad: new Map(calificadas.map((c) => [`${String(c.activity_id)}|${String(c.student_id)}`, c.calificacion_numerica as number])),
    registros: new Map((registros as unknown as RegistroPlano[]).map((r) => [String(r.student_id), r])),
  };
}

const esCerrado = (registro: RegistroPlano | undefined): boolean => Boolean(registro && ESTADOS_NOTA_CERRADOS.includes(registro.estado));

function resultadoDe(ctx: ContextoPlanilla, estudianteId: string): ResultadoAsignatura {
  const registro = ctx.registros.get(estudianteId);
  const notasActividad = new Map<string, number>();
  for (const a of ctx.actividades) {
    const nota = ctx.notasActividad.get(`${String(a._id)}|${estudianteId}`);
    if (nota !== undefined) notasActividad.set(String(a._id), nota);
  }
  return calcularNotaAsignatura({
    componentes: ctx.componentes,
    actividades: ctx.actividades.map((a) => ({ id: String(a._id), componente: a.componente_siee, peso: a.peso_en_componente })),
    notasActividad,
    notasDirectas: new Map((registro?.notas_directas ?? []).map((n) => [n.componente_clave, n.valor])),
  });
}

// --- La planilla que ve el docente ---

export interface FilaPlanilla {
  estudiante: EstudianteDePlanilla;
  estado: EstadoNota;
  notas_actividad: Record<string, number | null>;
  notas_directas: Record<string, number | null>;
  /** Nota de cada componente (calculada, o la digitada si es directa). */
  componentes: Record<string, number | null>;
  nota_asignatura: number | null;
  /** Calculada con las notas que hay: todavía le faltan notas. */
  parcial: boolean;
  desempeno: ReturnType<typeof desempenoCualitativo> | null;
  faltantes: string[];
}

export interface Planilla {
  asignacion: ContextoAsignacion | null;
  periodo: ContextoPlanilla['periodo'];
  escala: { nota_minima: number; nota_maxima: number; precision_decimales: number; rangos: Array<{ nivel: NivelDesempeno; etiqueta: string; valor_minimo: number; valor_maximo: number; es_aprobatorio: boolean }> };
  componentes: Array<{
    clave: string;
    nombre: string;
    porcentaje: number;
    origen: OrigenComponente;
    actividades: Array<{ _id: string; titulo: string; tipo: TipoActividad; peso: number; fecha_entrega: Date }>;
  }>;
  estudiantes: FilaPlanilla[];
  resumen: Record<EstadoNota, number>;
  edicion: {
    puede_editar: boolean;
    motivo: string | null;
    puede_cerrar: boolean;
    puede_reabrir: boolean;
    puede_definitiva: boolean;
  };
}

function armarFila(ctx: ContextoPlanilla, estudiante: EstudianteDePlanilla): FilaPlanilla {
  const registro = ctx.registros.get(estudiante._id);
  const resultado = resultadoDe(ctx, estudiante._id);
  const cerrado = esCerrado(registro) && registro?.resultado;

  // Una nota cerrada se muestra tal como se congeló, no recalculada: es lo que lee el boletín.
  const notaPorComponente = new Map(
    cerrado && registro?.resultado
      ? registro.resultado.componentes.map((c) => [c.clave, c.nota])
      : resultado.componentes.map((c) => [c.clave, c.nota])
  );
  const nota = cerrado && registro?.resultado ? registro.resultado.nota_asignatura : resultado.nota;

  return {
    estudiante,
    estado: cerrado && registro ? registro.estado : estadoAbiertoDe(resultado),
    notas_actividad: Object.fromEntries(ctx.actividades.map((a) => [String(a._id), ctx.notasActividad.get(`${String(a._id)}|${estudiante._id}`) ?? null])),
    notas_directas: Object.fromEntries(
      ctx.componentes.filter((c) => c.origen === 'NOTA_DIRECTA').map((c) => [c.clave, registro?.notas_directas.find((n) => n.componente_clave === c.clave)?.valor ?? null])
    ),
    componentes: Object.fromEntries(ctx.componentes.map((c) => [c.clave, notaPorComponente.get(c.clave) ?? null])),
    nota_asignatura: nota,
    parcial: !cerrado && nota !== null && !resultado.completa,
    desempeno: nota === null ? null : desempenoCualitativo(nota, ctx.anio.escala_evaluacion),
    faltantes: cerrado ? [] : resultado.faltantes,
  };
}

/** Docente titular edita; coordinación y administración consultan y cierran el ciclo. Otro docente, nada. */
async function resolverAcceso(asignacionId: string, usuario: UserDocument): Promise<TeacherAssignmentDocument> {
  if (usuario.rol === ROLES.DOCENTE) return asignacionDelDocente(asignacionId, usuario);
  const asignacion = await TeacherAssignment.findById(asignacionId);
  if (!asignacion) throw new ApiError(404, 'Asignacion academica (TeacherAssignment) no encontrada.');
  return asignacion;
}

async function motivoDeBloqueo(ctx: ContextoPlanilla, docente: UserDocument): Promise<string | null> {
  try {
    await assertPeriodNotLocked(ctx.asignacion.academic_year_id, ctx.asignacion.group_id as Types.ObjectId, ctx.periodo.numero, docente._id);
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.message;
    throw err;
  }
}

export async function obtenerPlanilla(asignacionId: string, periodoNumero: number, usuario: UserDocument): Promise<Planilla> {
  const asignacion = await resolverAcceso(asignacionId, usuario);
  const ctx = await cargarContextoPlanilla(asignacion, periodoNumero);

  const filas = ctx.estudiantes.map((e) => armarFila(ctx, e));
  const resumen: Record<EstadoNota, number> = { PENDIENTE: 0, BORRADOR: 0, CERRADO: 0, DEFINITIVO: 0 };
  for (const f of filas) resumen[f.estado] += 1;

  const hayCerradas = resumen.CERRADO + resumen.DEFINITIVO > 0;
  const titular = usuario.rol === ROLES.DOCENTE;
  const gestion = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  const bloqueo = titular ? await motivoDeBloqueo(ctx, usuario) : null;
  const motivo = !titular ? 'Solo el docente titular digita las notas.' : hayCerradas ? 'La planilla está cerrada: reábrela para modificar notas.' : bloqueo;
  const puedeEditar = titular && !hayCerradas && bloqueo === null;

  const contexto = await contextosDeAsignaciones([asignacion._id]);
  const escala = escalaEfectiva(ctx.anio.escala_evaluacion);
  return {
    asignacion: contexto.get(String(asignacion._id)) ?? null,
    periodo: ctx.periodo,
    escala: {
      nota_minima: escala.nota_minima,
      nota_maxima: escala.nota_maxima,
      precision_decimales: escala.precision_decimales,
      rangos: escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.valor_minimo, valor_maximo: r.valor_maximo, es_aprobatorio: r.es_aprobatorio })),
    },
    componentes: ctx.componentes.map((c) => ({
      ...c,
      actividades: ctx.actividades
        .filter((a) => c.origen === 'ACTIVIDADES' && a.componente_siee === c.clave)
        .map((a) => ({ _id: String(a._id), titulo: a.titulo, tipo: a.tipo ?? 'TAREA', peso: a.peso_en_componente, fecha_entrega: a.fecha_entrega })),
    })),
    estudiantes: filas,
    resumen,
    edicion: {
      puede_editar: puedeEditar,
      motivo,
      puede_cerrar: puedeEditar && filas.length > 0 && filas.every((f) => f.estado === 'BORRADOR'),
      puede_reabrir: hayCerradas && (titular ? resumen.DEFINITIVO === 0 : usuario.rol === ROLES.ADMIN || (gestion && resumen.DEFINITIVO === 0)),
      puede_definitiva: gestion && filas.length > 0 && filas.every((f) => f.estado === 'CERRADO'),
    },
  };
}

// --- Registro de notas (el núcleo transaccional) ---

export interface CeldaActividad {
  actividadId: string;
  estudianteId: string;
  nota: number;
  retroalimentacion?: string;
}

export interface CeldaDirecta {
  estudianteId: string;
  clave: string;
  nota: number;
}

/**
 * Valida TODAS las notas y solo entonces las escribe, en una transacción, con el historial de cada cambio y el estado
 * (PENDIENTE/BORRADOR) de cada estudiante tocado. Comparte reglas con la planilla y con la calificación desde M11:
 * clase del docente, periodo que admita notas (M05), escala del año, estudiante matriculado y planilla no cerrada.
 */
async function registrarNotas(
  ctx: ContextoPlanilla,
  docente: UserDocument,
  actividadesCeldas: CeldaActividad[],
  directas: CeldaDirecta[],
  ip?: string | null
): Promise<{ guardadas: number; sin_cambios: number }> {
  const { asignacion } = ctx;
  await assertPeriodNotLocked(asignacion.academic_year_id, asignacion.group_id as Types.ObjectId, ctx.periodo.numero, docente._id);

  const estudiantes = new Set(ctx.estudiantes.map((e) => e._id));
  const actividadPorId = new Map(ctx.actividades.map((a) => [String(a._id), a]));
  const directaPorClave = new Map(ctx.componentes.filter((c) => c.origen === 'NOTA_DIRECTA').map((c) => [c.clave, c]));
  const vistas = new Set<string>();

  for (const celda of [...actividadesCeldas.map((c) => ({ ...c, id: c.actividadId })), ...directas.map((c) => ({ ...c, id: c.clave }))]) {
    if (!estudiantes.has(celda.estudianteId)) {
      throw new ApiError(400, `El estudiante ${celda.estudianteId} no está matriculado en el grupo de esta clase.`);
    }
    const llave = `${celda.estudianteId}|${celda.id}`;
    if (vistas.has(llave)) throw new ApiError(400, 'No se puede calificar dos veces al mismo estudiante en la misma solicitud.');
    vistas.add(llave);
    validarNotaDentroDeEscala(celda.nota, ctx.anio.escala_evaluacion);
  }
  for (const celda of actividadesCeldas) {
    if (!actividadPorId.has(celda.actividadId)) throw new ApiError(400, 'Una de las actividades no pertenece a esta clase y periodo.');
  }
  for (const celda of directas) {
    if (!directaPorClave.has(celda.clave)) throw new ApiError(400, `El componente «${celda.clave}» no se digita como nota directa en este año.`);
  }

  const afectados = [...new Set([...actividadesCeldas.map((c) => c.estudianteId), ...directas.map((c) => c.estudianteId)])];
  const cerrados = afectados.filter((id) => esCerrado(ctx.registros.get(id)));
  if (cerrados.length > 0) {
    throw new ApiError(409, `La planilla de notas del periodo ${ctx.periodo.numero} está cerrada para ${cerrados.length} estudiante(s): reábrela (con motivo) para modificar sus notas.`);
  }

  const ahora = new Date();
  const cambiosActividad = actividadesCeldas.filter(
    (c) => ctx.notasActividad.get(`${c.actividadId}|${c.estudianteId}`) !== c.nota || c.retroalimentacion !== undefined
  );
  const cambiosDirectas = directas.filter((c) => ctx.registros.get(c.estudianteId)?.notas_directas.find((n) => n.componente_clave === c.clave)?.valor !== c.nota);
  const sinCambios = actividadesCeldas.length + directas.length - cambiosActividad.length - cambiosDirectas.length;
  if (cambiosActividad.length + cambiosDirectas.length === 0) return { guardadas: 0, sin_cambios: sinCambios };

  await runTransaction(async (session: ClientSession) => {
    for (const celda of cambiosActividad) {
      const anterior = ctx.notasActividad.get(`${celda.actividadId}|${celda.estudianteId}`) ?? null;
      const cambia = anterior !== celda.nota;
      await ActivitySubmission.findOneAndUpdate(
        { activity_id: celda.actividadId, student_id: celda.estudianteId },
        {
          $set: {
            estado: 'CALIFICADA',
            calificacion_numerica: celda.nota,
            fecha_calificacion: ahora,
            docente_id: docente._id,
            ...(celda.retroalimentacion !== undefined ? { retroalimentacion: celda.retroalimentacion } : {}),
          },
          ...(cambia ? { $push: { historial_notas: { valor_anterior: anterior, valor_nuevo: celda.nota, por: docente._id, fecha: ahora } } } : {}),
        },
        { upsert: true, runValidators: true, session }
      );
      ctx.notasActividad.set(`${celda.actividadId}|${celda.estudianteId}`, celda.nota);
    }

    // Las notas directas se reescriben completas por estudiante: el arreglo es pequeño y así el historial viaja con cada nota.
    const directasPorEstudiante = new Map<string, CeldaDirecta[]>();
    for (const c of cambiosDirectas) directasPorEstudiante.set(c.estudianteId, [...(directasPorEstudiante.get(c.estudianteId) ?? []), c]);
    const nuevasDirectas = new Map<string, RegistroPlano['notas_directas']>();
    for (const [estudianteId, celdas] of directasPorEstudiante) {
      const actuales = [...(ctx.registros.get(estudianteId)?.notas_directas ?? [])] as RegistroPlano['notas_directas'];
      for (const celda of celdas) {
        const existente = actuales.find((n) => n.componente_clave === celda.clave);
        const entrada = { valor_anterior: existente?.valor ?? null, valor_nuevo: celda.nota, por: docente._id, fecha: ahora };
        if (existente) {
          existente.valor = celda.nota;
          existente.registrado_por = docente._id;
          existente.fecha = ahora;
          existente.historial.push(entrada);
        } else {
          actuales.push({ componente_clave: celda.clave, valor: celda.nota, registrado_por: docente._id, fecha: ahora, historial: [entrada] } as RegistroPlano['notas_directas'][number]);
        }
      }
      nuevasDirectas.set(estudianteId, actuales);
      const base = ctx.registros.get(estudianteId);
      ctx.registros.set(estudianteId, { ...(base ?? ({} as RegistroPlano)), student_id: new Types.ObjectId(estudianteId), notas_directas: actuales } as RegistroPlano);
    }

    for (const estudianteId of afectados) {
      const estado = estadoAbiertoDe(resultadoDe(ctx, estudianteId));
      await CalificacionAsignatura.updateOne(
        { teacher_assignment_id: asignacion._id, periodo_numero: ctx.periodo.numero, student_id: estudianteId },
        {
          $set: { estado, ...(nuevasDirectas.has(estudianteId) ? { notas_directas: nuevasDirectas.get(estudianteId) } : {}) },
          $setOnInsert: { academic_year_id: asignacion.academic_year_id, group_id: asignacion.group_id, subject_id: asignacion.subject_id },
        },
        { upsert: true, session }
      );
    }
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'NOTAS_REGISTRADAS',
    entidad: 'TeacherAssignment',
    entidad_id: asignacion._id,
    detalle: `Periodo ${ctx.periodo.numero}: ${cambiosActividad.length} nota(s) de actividades y ${cambiosDirectas.length} directa(s) de ${afectados.length} estudiante(s).`,
    ip,
  });
  return { guardadas: cambiosActividad.length + cambiosDirectas.length, sin_cambios: sinCambios };
}

export interface CeldaPlanilla {
  student_id: string;
  actividad_id?: string;
  componente_clave?: string;
  nota: number;
}

export interface GuardarCeldasInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  celdas: CeldaPlanilla[];
}

/** Guarda las celdas que el docente modificó en la planilla (de actividades o notas directas) y devuelve la planilla al día. */
export async function guardarCeldas(input: GuardarCeldasInput, docente: UserDocument, ip?: string | null) {
  const asignacion = await asignacionDelDocente(input.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const ctx = await cargarContextoPlanilla(asignacion, input.periodo_numero);

  const resultado = await registrarNotas(
    ctx,
    docente,
    input.celdas.filter((c) => c.actividad_id).map((c) => ({ actividadId: c.actividad_id as string, estudianteId: c.student_id, nota: c.nota })),
    input.celdas.filter((c) => c.componente_clave).map((c) => ({ estudianteId: c.student_id, clave: c.componente_clave as string, nota: c.nota })),
    ip
  );
  return { ...resultado, planilla: await obtenerPlanilla(input.teacher_assignment_id, input.periodo_numero, docente) };
}

// --- Puente desde M11: calificar una actividad ---

export interface GradeEntryInput {
  student_id: string;
  calificacion_numerica: number;
  retroalimentacion?: string;
}

/**
 * Califica a uno o varios estudiantes de una actividad ("por lote"), con las mismas reglas de la planilla. Es un upsert por
 * (actividad, estudiante): no exige que el estudiante haya entregado (actividades actitudinales de aula). La entrega pasa
 * a CALIFICADA y el cambio queda en su historial de notas.
 */
export async function gradeActivity(
  activityId: string,
  entries: GradeEntryInput[],
  requestingUser: UserDocument,
  ip?: string | null
): Promise<ActivitySubmissionDocument[]> {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new ApiError(404, 'Actividad no encontrada.');

  const assignment = await TeacherAssignment.findById(activity.teacher_assignment_id);
  if (!assignment) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');
  if (String(assignment.docente_id) !== String(requestingUser._id)) {
    throw new ApiError(403, 'Solo el docente titular puede calificar esta actividad.');
  }
  if (!assignment.group_id) throw new ApiError(400, 'La asignación académica no tiene un grupo asociado.');

  const ctx = await cargarContextoPlanilla(assignment, activity.periodo_numero);
  await registrarNotas(
    ctx,
    requestingUser,
    entries.map((e) => ({
      actividadId: activityId,
      estudianteId: e.student_id,
      nota: e.calificacion_numerica,
      retroalimentacion: e.retroalimentacion ?? undefined,
    })),
    [],
    ip
  );
  return ActivitySubmission.find({ activity_id: activityId, student_id: { $in: entries.map((e) => e.student_id) } });
}

// --- Cierre y definitivas ---

const MOTIVO_MINIMO = 5;

export interface PlanillaRef {
  teacher_assignment_id: string;
  periodo_numero: number;
}

/** El docente titular cierra la planilla de su clase: exige todas las notas y congela el resultado que leerá el boletín. */
export async function cerrarPlanilla(input: PlanillaRef, docente: UserDocument, ip?: string | null) {
  const asignacion = await asignacionDelDocente(input.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const ctx = await cargarContextoPlanilla(asignacion, input.periodo_numero);
  await assertPeriodNotLocked(asignacion.academic_year_id, asignacion.group_id as Types.ObjectId, ctx.periodo.numero, docente._id);

  if (ctx.estudiantes.length === 0) throw new ApiError(409, 'El grupo no tiene estudiantes con matrícula activa.');
  if (ctx.estudiantes.every((e) => esCerrado(ctx.registros.get(e._id)))) throw new ApiError(409, 'La planilla ya está cerrada.');
  if (ctx.actividades.length === 0) throw new ApiError(409, 'No hay actividades en este periodo: no hay nada que cerrar.');

  const incompletos = ctx.estudiantes
    .map((e) => ({ estudiante: e, resultado: resultadoDe(ctx, e._id) }))
    .filter((x) => !x.resultado.completa);
  if (incompletos.length > 0) {
    const nombreDe = new Map(ctx.componentes.map((c) => [c.clave, c.nombre]));
    throw new ApiError(
      409,
      `No se puede cerrar: ${incompletos.length} estudiante(s) tienen notas pendientes.`,
      incompletos.map((x) => ({
        estudiante: `${x.estudiante.apellido} ${x.estudiante.nombre}`,
        faltan: x.resultado.faltantes.map((k) => nombreDe.get(k) ?? k),
      }))
    );
  }

  const ahora = new Date();
  await runTransaction(async (session) => {
    for (const e of ctx.estudiantes) {
      const resultado = resultadoDe(ctx, e._id);
      await CalificacionAsignatura.updateOne(
        { teacher_assignment_id: asignacion._id, periodo_numero: ctx.periodo.numero, student_id: e._id },
        {
          $set: {
            estado: 'CERRADO',
            resultado: {
              componentes: ctx.componentes.map((c) => ({
                clave: c.clave,
                nombre: c.nombre,
                porcentaje: c.porcentaje,
                nota: resultado.componentes.find((x) => x.clave === c.clave)?.nota as number,
              })),
              nota_asignatura: resultado.nota as number,
            },
            cerrado_por: docente._id,
            cerrado_at: ahora,
          },
          $setOnInsert: { academic_year_id: asignacion.academic_year_id, group_id: asignacion.group_id, subject_id: asignacion.subject_id },
        },
        { upsert: true, session }
      );
    }
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'PLANILLA_NOTAS_CERRADA',
    entidad: 'TeacherAssignment',
    entidad_id: asignacion._id,
    detalle: `Periodo ${ctx.periodo.numero}: ${ctx.estudiantes.length} estudiante(s).`,
    ip,
  });
  return obtenerPlanilla(input.teacher_assignment_id, input.periodo_numero, docente);
}

/**
 * Devuelve una planilla cerrada a edición, siempre con motivo (queda en cada nota y en la auditoría). El docente titular y
 * coordinación reabren lo CERRADO mientras el periodo admita notas; lo DEFINITIVO solo lo reabre el administrador.
 */
export async function reabrirPlanilla(input: PlanillaRef & { motivo: string }, usuario: UserDocument, ip?: string | null) {
  if (input.motivo.trim().length < MOTIVO_MINIMO) throw new ApiError(400, `Explica el motivo de la reapertura (mínimo ${MOTIVO_MINIMO} caracteres).`);
  const asignacion = await resolverAcceso(input.teacher_assignment_id, usuario);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const ctx = await cargarContextoPlanilla(asignacion, input.periodo_numero);

  const cerrados = ctx.estudiantes.filter((e) => esCerrado(ctx.registros.get(e._id)));
  if (cerrados.length === 0) throw new ApiError(409, 'La planilla no está cerrada.');
  const hayDefinitivas = cerrados.some((e) => ctx.registros.get(e._id)?.estado === 'DEFINITIVO');
  if (hayDefinitivas && usuario.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Las notas ya son DEFINITIVAS: solo el administrador puede reabrirlas.');
  }
  if (usuario.rol !== ROLES.ADMIN) {
    await assertPeriodNotLocked(asignacion.academic_year_id, asignacion.group_id as Types.ObjectId, ctx.periodo.numero, asignacion.docente_id);
  }

  const ahora = new Date();
  await runTransaction(async (session) => {
    for (const e of cerrados) {
      const registro = ctx.registros.get(e._id) as RegistroPlano;
      // Con el resultado ya descartado, el estado abierto sale de las notas vivas.
      const estado = estadoAbiertoDe(resultadoDe({ ...ctx, registros: new Map([[e._id, { ...registro, estado: 'PENDIENTE' } as RegistroPlano]]) }, e._id));
      await CalificacionAsignatura.updateOne(
        { _id: registro._id },
        {
          $set: { estado, resultado: null, cerrado_por: null, cerrado_at: null, definitivo_por: null, definitivo_at: null },
          $push: { reaperturas: { por: usuario._id, fecha: ahora, motivo: input.motivo, desde: registro.estado } },
        },
        { session }
      );
    }
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PLANILLA_NOTAS_REABIERTA',
    entidad: 'TeacherAssignment',
    entidad_id: asignacion._id,
    detalle: `Periodo ${ctx.periodo.numero}, ${cerrados.length} estudiante(s)${hayDefinitivas ? ' (incluye definitivas)' : ''}. Motivo: ${input.motivo}`,
    ip,
  });
  return obtenerPlanilla(input.teacher_assignment_id, input.periodo_numero, usuario);
}

export interface DefinitivasInput {
  academic_year_id: string;
  periodo_numero: number;
  group_id?: string;
  teacher_assignment_id?: string;
}

/**
 * Coordinación (o administración) declara DEFINITIVAS las planillas ya cerradas por sus docentes: desde ahí no se tocan sin
 * reabrirlas el administrador. Una planilla que aún no está toda cerrada se omite, diciendo por qué.
 */
export async function declararDefinitivas(input: DefinitivasInput, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) {
    throw new ApiError(403, 'Solo coordinación o administración declaran las notas definitivas.');
  }
  await asegurarAnioNoCerrado(input.academic_year_id);
  const anio = await AcademicYear.findById(input.academic_year_id);
  if (!anio?.periodos.some((p) => p.numero === input.periodo_numero)) throw new ApiError(400, `El año lectivo no tiene periodo ${input.periodo_numero}.`);

  const asignaciones = await TeacherAssignment.find({
    academic_year_id: input.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    group_id: { $ne: null },
    ...(input.group_id ? { group_id: input.group_id } : {}),
    ...(input.teacher_assignment_id ? { _id: input.teacher_assignment_id } : {}),
  }).lean();
  const contextos = await contextosDeAsignaciones(asignaciones.map((a) => a._id));

  const [registros, matriculas] = await Promise.all([
    CalificacionAsignatura.find({ teacher_assignment_id: { $in: asignaciones.map((a) => a._id) }, periodo_numero: input.periodo_numero }).select('teacher_assignment_id estado').lean(),
    Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { group_id: { $in: asignaciones.map((a) => a.group_id) }, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } } },
      { $group: { _id: '$group_id', n: { $sum: 1 } } },
    ]),
  ]);
  const estudiantesDe = new Map(matriculas.map((m) => [String(m._id), m.n]));

  const omitidas: Array<{ teacher_assignment_id: string; asignatura: string; grupo: string; motivo: string }> = [];
  const aDefinitivas: Types.ObjectId[] = [];
  for (const a of asignaciones) {
    const propios = registros.filter((r) => String(r.teacher_assignment_id) === String(a._id));
    const total = estudiantesDe.get(String(a.group_id)) ?? 0;
    const contexto = contextos.get(String(a._id));
    const porEstado = (e: EstadoNota) => propios.filter((r) => r.estado === e).length;
    let motivo: string | null = null;
    if (total === 0) motivo = 'El grupo no tiene estudiantes.';
    else if (porEstado('DEFINITIVO') === propios.length && propios.length >= total) motivo = 'Ya es definitiva.';
    else if (porEstado('CERRADO') + porEstado('DEFINITIVO') < total) motivo = 'El docente aún no la ha cerrado.';
    if (motivo) {
      omitidas.push({ teacher_assignment_id: String(a._id), asignatura: contexto?.asignatura?.nombre ?? '—', grupo: contexto?.grupo?.nomenclatura ?? '—', motivo });
    } else {
      aDefinitivas.push(a._id);
    }
  }

  const ahora = new Date();
  if (aDefinitivas.length > 0) {
    await CalificacionAsignatura.updateMany(
      { teacher_assignment_id: { $in: aDefinitivas }, periodo_numero: input.periodo_numero, estado: 'CERRADO' },
      { $set: { estado: 'DEFINITIVO', definitivo_por: usuario._id, definitivo_at: ahora } }
    );
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'NOTAS_DEFINITIVAS',
      entidad: 'AcademicYear',
      entidad_id: anio._id,
      detalle: `Periodo ${input.periodo_numero}: ${aDefinitivas.length} planilla(s) declaradas definitivas.`,
      ip,
    });
  }
  return { definitivas: aDefinitivas.length, omitidas };
}

// --- Seguimiento de coordinación ---

export interface SeguimientoQuery {
  academic_year_id: string;
  periodo_numero: number;
  group_id?: string;
}

export interface FilaSeguimiento {
  teacher_assignment_id: string;
  asignacion: ContextoAsignacion | null;
  estudiantes: number;
  actividades: number;
  cerradas: number;
  definitivas: number;
  estado: 'ABIERTA' | 'CERRADA' | 'DEFINITIVA';
}

/** Cómo va cada clase del año en un periodo: qué está abierto, qué cerró su docente y qué ya es definitivo. */
export async function seguimiento(query: SeguimientoQuery): Promise<FilaSeguimiento[]> {
  const asignaciones = await TeacherAssignment.find({
    academic_year_id: query.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    group_id: { $ne: null },
    ...(query.group_id ? { group_id: query.group_id } : {}),
  }).lean();
  if (asignaciones.length === 0) return [];
  const ids = asignaciones.map((a) => a._id);

  const [contextos, registros, matriculas, actividades] = await Promise.all([
    contextosDeAsignaciones(ids),
    CalificacionAsignatura.aggregate<{ _id: { a: Types.ObjectId; e: EstadoNota }; n: number }>([
      { $match: { teacher_assignment_id: { $in: ids }, periodo_numero: query.periodo_numero } },
      { $group: { _id: { a: '$teacher_assignment_id', e: '$estado' }, n: { $sum: 1 } } },
    ]),
    Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { group_id: { $in: asignaciones.map((a) => a.group_id) }, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } } },
      { $group: { _id: '$group_id', n: { $sum: 1 } } },
    ]),
    Activity.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { teacher_assignment_id: { $in: ids }, periodo_numero: query.periodo_numero } },
      { $group: { _id: '$teacher_assignment_id', n: { $sum: 1 } } },
    ]),
  ]);
  const estudiantesDe = new Map(matriculas.map((m) => [String(m._id), m.n]));
  const actividadesDe = new Map(actividades.map((a) => [String(a._id), a.n]));
  const cuenta = (id: Types.ObjectId, estado: EstadoNota) => registros.find((r) => String(r._id.a) === String(id) && r._id.e === estado)?.n ?? 0;

  return asignaciones
    .map((a) => {
      const estudiantes = estudiantesDe.get(String(a.group_id)) ?? 0;
      const cerradas = cuenta(a._id, 'CERRADO');
      const definitivas = cuenta(a._id, 'DEFINITIVO');
      const completa = estudiantes > 0 && cerradas + definitivas >= estudiantes;
      return {
        teacher_assignment_id: String(a._id),
        asignacion: contextos.get(String(a._id)) ?? null,
        estudiantes,
        actividades: actividadesDe.get(String(a._id)) ?? 0,
        cerradas,
        definitivas,
        estado: completa ? (definitivas >= estudiantes ? ('DEFINITIVA' as const) : ('CERRADA' as const)) : ('ABIERTA' as const),
      };
    })
    .sort((x, y) => `${x.asignacion?.grupo?.nomenclatura ?? ''}${x.asignacion?.asignatura?.nombre ?? ''}`.localeCompare(`${y.asignacion?.grupo?.nomenclatura ?? ''}${y.asignacion?.asignatura?.nombre ?? ''}`, 'es'));
}
