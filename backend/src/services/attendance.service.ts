import { HydratedDocument, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, EstadoJustificacion } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Attendance, { AttendanceDocument } from '../models/attendance.model';
import AttendanceJustification from '../models/attendanceJustification.model';
import { AttendanceStateDocument } from '../models/attendanceState.model';
import Enrollment from '../models/enrollment.model';
import Group, { IGroup } from '../dominios/institucional/estructura/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { hayEventoNoLectivo, periodosEfectivos } from '../dominios/institucional';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { diaIso, fechaDeClase, hoyColombia } from '../utils/tiempo';
import { registrarEvento } from './audit.service';
import { listarEstados, mapaDeEstados } from './attendanceState.service';
import { cargarContextoFechas, ContextoFechas } from '../dominios/institucional';

const formatoFecha = (fecha: Date): string => fecha.toISOString().slice(0, 10);

export interface EvaluacionFecha {
  periodo_numero: number | null;
  /** Por qué no se puede tomar asistencia ese día; null si se puede. */
  bloqueo: string | null;
}

/**
 * Lee de M05 si la fecha admite asistencia: año vigente, dentro de un periodo (con las fechas de la sede si tiene
 * calendario propio) que no esté cerrado, no futura, día hábil de la jornada del grupo (no hay días fijos en el
 * código: un grupo SABATINA trabaja sábado) y fuera de recesos/vacaciones/desarrollo institucional.
 */
export function evaluarFechaEnContexto({ grupo, anio, jornada, periodosCerradosDelGrupo }: ContextoFechas, fecha: Date): EvaluacionFecha {
  if (anio.estado !== 'EN_CURSO') {
    return { periodo_numero: null, bloqueo: `El año lectivo ${anio.year} no está vigente; no se puede registrar asistencia.` };
  }

  const calendarioSede = anio.calendarios_sede.find((c) => String(c.sede_id) === String(grupo.sede_id));
  const periodo = periodosEfectivos(anio.periodos, calendarioSede).find(
    (p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin
  );
  if (!periodo) {
    return { periodo_numero: null, bloqueo: `El ${formatoFecha(fecha)} no pertenece a ningún periodo del año lectivo.` };
  }

  const resultado = (bloqueo: string | null): EvaluacionFecha => ({ periodo_numero: periodo.numero, bloqueo });

  if (fecha > hoyColombia()) return resultado('No se puede registrar asistencia de una fecha futura.');
  if (anio.periodos.find((p) => p.numero === periodo.numero)?.estado === 'CERRADO') {
    return resultado(`El periodo ${periodo.numero} está cerrado; la asistencia ya no se puede modificar.`);
  }
  if (!jornada.dias_habiles.includes(diaIso(fecha))) {
    return resultado(`El ${formatoFecha(fecha)} no es un día hábil de la jornada de este grupo.`);
  }
  const evento = anio.eventos.find((e) => hayEventoNoLectivo(fecha, [e]));
  if (evento) return resultado(`El ${formatoFecha(fecha)} no es lectivo (${evento.nombre}).`);
  if (periodosCerradosDelGrupo.has(periodo.numero)) return resultado(`El periodo ${periodo.numero} está cerrado para este grupo.`);

  return resultado(null);
}

async function evaluarFecha(grupo: HydratedDocument<IGroup>, fecha: Date): Promise<EvaluacionFecha> {
  return evaluarFechaEnContexto(await cargarContextoFechas(grupo), fecha);
}

export async function obtenerGrupoYAsignatura(groupId: string, subjectId: string) {
  const [grupo, asignatura] = await Promise.all([Group.findById(groupId), Subject.findById(subjectId)]);
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
  if (!asignatura) throw new ApiError(404, 'Asignatura no encontrada.');
  return { grupo, asignatura };
}

/** M08: solo se toma lista en las clases oficialmente asignadas al docente en el año del grupo. */
export async function exigirAsignacionDocente(docenteId: Types.ObjectId, grupo: HydratedDocument<IGroup>, subjectId: string) {
  const asignacion = await TeacherAssignment.exists({
    docente_id: docenteId,
    group_id: grupo._id,
    subject_id: subjectId,
    academic_year_id: grupo.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  });
  if (!asignacion) throw new ApiError(403, 'No tiene una asignación académica activa para esta asignatura y grupo.');
}

export async function matriculasActivas(groupId: Types.ObjectId | string) {
  const matriculas = await Enrollment.find({ group_id: groupId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).populate<{
    student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
  }>('student_id', 'nombre apellido numero_documento');
  return matriculas
    .filter((m) => m.student_id)
    .sort((a, b) => `${a.student_id.apellido} ${a.student_id.nombre}`.localeCompare(`${b.student_id.apellido} ${b.student_id.nombre}`, 'es'));
}

/**
 * Filtro sobre `Attendance` con lo que el usuario puede ver: staff todo; un docente solo las planillas de sus
 * clases del año. `null` = sin restricción.
 */
export async function filtroAlcanceAsistencia(
  usuario: UserDocument,
  academicYearId: string
): Promise<Record<string, unknown> | null> {
  if (usuario.rol !== ROLES.DOCENTE) return null;
  const clases = await TeacherAssignment.find({
    docente_id: usuario._id,
    academic_year_id: academicYearId,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  }).select('group_id subject_id');
  if (clases.length === 0) return { _id: { $in: [] } };
  return { $or: clases.map((c) => ({ group_id: c.group_id, subject_id: c.subject_id })) };
}

export interface ConsultaPlanilla {
  group_id: string;
  subject_id: string;
  fecha: string;
}

export interface FilaPlanilla {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  /** null = todavía sin registrar: la planilla ofrece el estado predeterminado. */
  state_id: string | null;
  novedad: string;
  registro_id: string | null;
  justificacion: EstadoJustificacion | null;
}

export interface Planilla {
  /** null hasta que se guarde la primera vez; con él se justifica una falla de la planilla. */
  attendance_id: string | null;
  grupo: { _id: string; nomenclatura: string };
  asignatura: { _id: string; nombre: string };
  fecha: string;
  periodo_numero: number | null;
  bloqueo: string | null;
  planilla_guardada: boolean;
  estados: AttendanceStateDocument[];
  estudiantes: FilaPlanilla[];
}

/** La lista oficial del grupo (M04) con lo que ya se haya registrado ese día, lista para pintar la planilla. */
export async function obtenerPlanilla(consulta: ConsultaPlanilla, docente: UserDocument): Promise<Planilla> {
  const { grupo, asignatura } = await obtenerGrupoYAsignatura(consulta.group_id, consulta.subject_id);
  await exigirAsignacionDocente(docente._id, grupo, consulta.subject_id);

  const fecha = fechaDeClase(consulta.fecha);
  const [evaluacion, matriculas, estados, existente] = await Promise.all([
    evaluarFecha(grupo, fecha),
    matriculasActivas(grupo._id),
    listarEstados(true),
    Attendance.findOne({ group_id: grupo._id, subject_id: asignatura._id, fecha }),
  ]);

  const justificaciones = existente
    ? await AttendanceJustification.find({ attendance_id: existente._id, estado: { $in: ['PENDIENTE', 'APROBADA'] } })
    : [];
  const estadoDeJustificacion = new Map(justificaciones.map((j) => [String(j.registro_id), j.estado]));
  const registroDe = new Map((existente?.registros ?? []).map((r) => [String(r.student_id), r]));

  return {
    attendance_id: existente ? String(existente._id) : null,
    grupo: { _id: String(grupo._id), nomenclatura: grupo.nomenclatura },
    asignatura: { _id: String(asignatura._id), nombre: asignatura.nombre },
    fecha: consulta.fecha,
    periodo_numero: evaluacion.periodo_numero,
    bloqueo: evaluacion.bloqueo,
    planilla_guardada: Boolean(existente),
    estados,
    estudiantes: matriculas.map((m) => {
      const registro = registroDe.get(String(m.student_id._id));
      return {
        student_id: String(m.student_id._id),
        nombre: m.student_id.nombre,
        apellido: m.student_id.apellido,
        numero_documento: m.student_id.numero_documento,
        state_id: registro ? String(registro.state_id) : null,
        novedad: registro?.novedad ?? '',
        registro_id: registro ? String(registro._id) : null,
        justificacion: registro ? (estadoDeJustificacion.get(String(registro._id)) ?? null) : null,
      };
    }),
  };
}

export interface RegistroAsistenciaInput {
  student_id: string;
  state_id: string;
  novedad?: string;
}

export interface RegistrarAsistenciaInput extends ConsultaPlanilla {
  registros: RegistroAsistenciaInput[];
}

interface ContextoAsistencia {
  grupo: HydratedDocument<IGroup>;
  subjectId: string;
  fechas: ContextoFechas;
  matriculados: Set<string>;
  estados: Map<string, AttendanceStateDocument>;
}

/** Carga una sola vez lo que comparten todos los días que se guarden de una clase (y verifica la clase asignada, M08). */
async function cargarContextoAsistencia(groupId: string, subjectId: string, docente: UserDocument): Promise<ContextoAsistencia> {
  const { grupo } = await obtenerGrupoYAsignatura(groupId, subjectId);
  await exigirAsignacionDocente(docente._id, grupo, subjectId);
  const [fechas, matriculas, estados] = await Promise.all([
    cargarContextoFechas(grupo),
    matriculasActivas(grupo._id),
    mapaDeEstados(),
  ]);
  return { grupo, subjectId, fechas, matriculados: new Set(matriculas.map((m) => String(m.student_id._id))), estados };
}

/** Valida un día completo y deja su planilla lista en memoria, sin escribir: un lote se valida entero antes de guardar. */
async function prepararDia(
  contexto: ContextoAsistencia,
  dia: { fecha: string; registros: RegistroAsistenciaInput[] },
  docente: UserDocument
): Promise<AttendanceDocument> {
  const { grupo, subjectId, fechas, matriculados, estados } = contexto;
  const fecha = fechaDeClase(dia.fecha);
  const evaluacion = evaluarFechaEnContexto(fechas, fecha);
  if (evaluacion.bloqueo || evaluacion.periodo_numero === null) {
    throw new ApiError(409, evaluacion.bloqueo ?? 'La fecha no admite asistencia.');
  }

  const idsEstudiantes = dia.registros.map((r) => r.student_id);
  if (new Set(idsEstudiantes).size !== idsEstudiantes.length) {
    throw new ApiError(400, 'No se puede registrar más de un estado de asistencia para el mismo estudiante.');
  }
  const noMatriculados = idsEstudiantes.filter((id) => !matriculados.has(id));
  if (noMatriculados.length > 0) {
    throw new ApiError(400, `Los siguientes estudiantes no están matriculados en el grupo: ${noMatriculados.join(', ')}.`);
  }

  const planilla =
    (await Attendance.findOne({ group_id: grupo._id, subject_id: subjectId, fecha })) ??
    new Attendance({
      group_id: grupo._id,
      subject_id: subjectId,
      academic_year_id: grupo.academic_year_id,
      fecha,
      periodo_numero: evaluacion.periodo_numero,
      registros: [],
      registrado_por: docente._id,
    });

  for (const entrada of dia.registros) {
    const estado = estados.get(entrada.state_id);
    if (!estado) throw new ApiError(400, 'Uno de los estados de asistencia no existe.');

    const registro = planilla.registros.find((r) => String(r.student_id) === entrada.student_id);
    // Un estado desactivado ya no se ofrece, pero un registro que ya lo tenía puede conservarlo.
    if (estado.estado === 'inactivo' && String(registro?.state_id) !== entrada.state_id) {
      throw new ApiError(400, `El estado "${estado.nombre}" está desactivado.`);
    }

    if (registro) {
      registro.state_id = estado._id;
      registro.novedad = entrada.novedad ?? '';
    } else {
      planilla.registros.push({ student_id: entrada.student_id, state_id: estado._id, novedad: entrada.novedad ?? '' });
    }
  }
  return planilla;
}

async function guardarDia(
  planilla: AttendanceDocument,
  contexto: ContextoAsistencia,
  fecha: string,
  docente: UserDocument,
  ip?: string | null
): Promise<void> {
  try {
    await planilla.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'Otra persona guardó esta planilla al mismo tiempo; recárgala e inténtalo de nuevo.');
    }
    throw err;
  }

  const fallas = planilla.registros.filter((r) => contexto.estados.get(String(r.state_id))?.cuenta_como_falla).length;
  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ASISTENCIA_REGISTRADA',
    entidad: 'Attendance',
    entidad_id: planilla._id,
    detalle: `Grupo ${contexto.grupo.nomenclatura}, ${fecha}: ${planilla.registros.length} registros, ${fallas} fallas.`,
    ip,
  });
}

/**
 * Guarda la planilla de un grupo+asignatura+día en un solo lote. Solo el docente con la clase asignada (M08), en un
 * día hábil de un periodo abierto (M05), y solo para estudiantes con matrícula activa en el grupo (M04). Volver a
 * guardar actualiza los registros existentes en vez de reemplazarlos: sus justificaciones quedan ancladas.
 */
export async function registrarAsistencia(
  input: RegistrarAsistenciaInput,
  docente: UserDocument,
  ip?: string | null
): Promise<AttendanceDocument> {
  const contexto = await cargarContextoAsistencia(input.group_id, input.subject_id, docente);
  const planilla = await prepararDia(contexto, input, docente);
  await guardarDia(planilla, contexto, input.fecha, docente, ip);
  return planilla;
}

export interface RegistrarAsistenciaLoteInput {
  group_id: string;
  subject_id: string;
  dias: Array<{ fecha: string; registros: RegistroAsistenciaInput[] }>;
}

/**
 * Cuadrícula mensual: guarda varios días de una clase a la vez. Se valida cada día completo (fecha, matrícula,
 * estados) antes de escribir el primero, así un error en un día no deja la cuadrícula a medio guardar.
 */
export async function registrarAsistenciaLote(
  input: RegistrarAsistenciaLoteInput,
  docente: UserDocument,
  ip?: string | null
): Promise<{ dias_guardados: number }> {
  const fechasPedidas = input.dias.map((d) => d.fecha);
  if (new Set(fechasPedidas).size !== fechasPedidas.length) {
    throw new ApiError(400, 'No se puede enviar el mismo día dos veces.');
  }

  const contexto = await cargarContextoAsistencia(input.group_id, input.subject_id, docente);
  const preparadas: Array<{ planilla: AttendanceDocument; fecha: string }> = [];
  for (const dia of input.dias) {
    try {
      preparadas.push({ planilla: await prepararDia(contexto, dia, docente), fecha: dia.fecha });
    } catch (err) {
      if (err instanceof ApiError) throw new ApiError(err.statusCode, `${dia.fecha}: ${err.message}`);
      throw err;
    }
  }

  for (const { planilla, fecha } of preparadas) await guardarDia(planilla, contexto, fecha, docente, ip);
  return { dias_guardados: preparadas.length };
}

export interface ConsultaInasistencias {
  student_id: string;
  academic_year_id: string;
  periodo_numero?: number;
}

export interface InasistenciaEstudiante {
  attendance_id: string;
  registro_id: string;
  fecha: Date;
  periodo_numero: number;
  asignatura: string;
  grupo: string;
  estado: { _id: string; nombre: string; tono: string; es_justificada: boolean };
  novedad: string;
  justificacion: { _id: string; estado: EstadoJustificacion; motivo: string } | null;
}

/** Las fallas de un estudiante (lo que se puede justificar), con el estado de su excusa si ya tiene una viva. */
export async function listarInasistencias(
  consulta: ConsultaInasistencias,
  usuario: UserDocument
): Promise<InasistenciaEstudiante[]> {
  const alcance = await filtroAlcanceAsistencia(usuario, consulta.academic_year_id);
  const planillas = await Attendance.find({
    academic_year_id: consulta.academic_year_id,
    'registros.student_id': consulta.student_id,
    ...(consulta.periodo_numero ? { periodo_numero: consulta.periodo_numero } : {}),
    ...alcance,
  })
    .populate<{ subject_id: { nombre: string } }>('subject_id', 'nombre')
    .populate<{ group_id: { nomenclatura: string } }>('group_id', 'nomenclatura')
    .sort({ fecha: -1 });

  const estados = await mapaDeEstados();
  const justificaciones = await AttendanceJustification.find({
    student_id: consulta.student_id,
    attendance_id: { $in: planillas.map((p) => p._id) },
    estado: { $in: ['PENDIENTE', 'APROBADA'] },
  });
  const justificacionDe = new Map(justificaciones.map((j) => [String(j.registro_id), j]));

  const filas: InasistenciaEstudiante[] = [];
  for (const planilla of planillas) {
    const registro = planilla.registros.find((r) => String(r.student_id) === consulta.student_id);
    const estado = registro && estados.get(String(registro.state_id));
    if (!registro || !estado?.cuenta_como_falla) continue;

    const justificacion = justificacionDe.get(String(registro._id));
    filas.push({
      attendance_id: String(planilla._id),
      registro_id: String(registro._id),
      fecha: planilla.fecha,
      periodo_numero: planilla.periodo_numero,
      asignatura: planilla.subject_id.nombre,
      grupo: planilla.group_id.nomenclatura,
      estado: { _id: String(estado._id), nombre: estado.nombre, tono: estado.tono, es_justificada: estado.es_justificada },
      novedad: registro.novedad,
      justificacion: justificacion
        ? { _id: String(justificacion._id), estado: justificacion.estado, motivo: justificacion.motivo }
        : null,
    });
  }
  return filas;
}
