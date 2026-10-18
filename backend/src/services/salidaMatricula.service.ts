import { ClientSession, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  EstadoPazYSalvoSalida,
  MAX_SOPORTES_SALIDA,
  MIN_LONGITUD_MOTIVO_SALIDA,
  NOMBRES_TIPO_SALIDA,
  PoliticaCupoSalida,
  TipoSalida,
} from '../constants/salidas';
import AcademicYear from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ActivitySubmission from '../models/activitySubmission.model';
import Attendance from '../models/attendance.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment, { EnrollmentDocument, ISalidaMatricula } from '../models/enrollment.model';
import Group from '../models/group.model';
import PazYSalvoSalida from '../models/pazYSalvoSalida.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import StudentProfile from '../models/studentProfile.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { finDelDia } from '../utils/calendarioAcademico';
import { aDiaDeCalendario, estadoGlobalDePazYSalvo, motivoFechaEfectivaInvalida } from '../utils/salidas';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { abrirPazYSalvoDeSalida, PazYSalvoSalidaVista, vistaPazYSalvoDeSalida } from './pazYSalvoSalida.service';
import { liberarCupoDeSalida, politicaDeCupo } from './salidaCupo.service';

/**
 * Retiro o traslado de un estudiante durante el año (M04). La matrícula pasa a RETIRADO: es el estado que las listas del aula (asistencia M13,
 * actividades y planilla M11/M12, boletín M17) ya excluyen, así que el estudiante desaparece de lo diario sin tocar un solo registro suyo. Las notas,
 * asistencias y entregas anteriores viven en sus colecciones por estudiante y grupo y no se leen ni se borran aquí.
 */

export interface SalidaInput {
  tipo: TipoSalida;
  fecha_efectiva?: string | Date;
  motivo: string;
  observaciones?: string;
  institucion_receptora?: { nombre: string; codigo_dane?: string; municipio?: string } | null;
}

interface Actor {
  id: Types.ObjectId | string;
}

/**
 * Pasa una matrícula activa a RETIRADO con todos los datos de la salida. Va dentro de la transacción de quien la llama (`registrarSalida`
 * y `updateEnrollmentStatus`) para que el cupo, el expediente y el paz y salvo queden todos o ninguno. Devuelve si el cupo se liberó.
 */
export async function aplicarSalida(enrollment: EnrollmentDocument, input: SalidaInput, actor: Actor, session: ClientSession): Promise<{ cupo_liberado: boolean }> {
  if (!ESTADOS_MATRICULA_ACTIVOS.includes(enrollment.estado)) {
    throw new ApiError(
      409,
      enrollment.estado === 'PREINSCRITO'
        ? 'Una matrícula preinscrita aún no tiene folio: si el aspirante desiste, anula la matrícula.'
        : `La matrícula ya está en estado ${enrollment.estado}.`
    );
  }
  const motivo = (input.motivo ?? '').trim();
  if (motivo.length < MIN_LONGITUD_MOTIVO_SALIDA) throw new ApiError(400, 'Indica el motivo de la salida.');
  const receptora = input.institucion_receptora?.nombre?.trim() ? input.institucion_receptora : null;
  if (input.tipo === 'TRASLADO' && !receptora) throw new ApiError(400, 'Un traslado exige la institución receptora.');

  const anio = await AcademicYear.findById(enrollment.academic_year_id).session(session);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año lectivo ${anio.year} está cerrado: el retiro ya no se registra.`);

  const hoy = aDiaDeCalendario(new Date(Date.now() - 5 * 60 * 60 * 1000));
  const fecha = input.fecha_efectiva ? aDiaDeCalendario(input.fecha_efectiva) : hoy;
  const rechazo = motivoFechaEfectivaInvalida(fecha, enrollment.fecha_matricula, hoy);
  if (rechazo) throw new ApiError(400, rechazo);

  const ahora = new Date();
  const estadoPrevio = enrollment.estado;
  enrollment.estado = 'RETIRADO';
  enrollment.motivo_retiro = motivo;
  enrollment.salida = {
    tipo: input.tipo,
    fecha_efectiva: fecha,
    motivo,
    observaciones: (input.observaciones ?? '').trim(),
    institucion_receptora: receptora ? { nombre: receptora.nombre.trim(), codigo_dane: (receptora.codigo_dane ?? '').trim(), municipio: (receptora.municipio ?? '').trim() } : null,
    estado_previo: estadoPrevio,
    registrado_por: new Types.ObjectId(String(actor.id)),
    fecha_registro: ahora,
    cupo_liberado: false,
    fecha_cupo_liberado: null,
    soportes: [],
  } as unknown as ISalidaMatricula;
  // La trayectoria queda cerrada en el último grupo: desde la fecha efectiva ya no pertenece a ninguno.
  const abierto = [...enrollment.trayectoria].reverse().find((t) => t.hasta === null);
  if (abierto) abierto.hasta = fecha;
  else enrollment.trayectoria.push({ group_id: enrollment.group_id, desde: enrollment.fecha_matricula, hasta: fecha });
  await enrollment.save({ session });

  // El expediente del estudiante (M03) refleja que ya no está en el colegio; así matricularlo de nuevo pasa por el reingreso guiado.
  await StudentProfile.updateOne({ user_id: enrollment.student_id, estado: 'ACTIVO' }, { $set: { estado: 'RETIRADO' } }, { session });

  const pazYSalvo = await abrirPazYSalvoDeSalida(enrollment, actor.id, session);
  const estadoPaz: EstadoPazYSalvoSalida = pazYSalvo ? estadoGlobalDePazYSalvo(pazYSalvo.dependencias) : 'APROBADO';
  const cupoLiberado = await liberarCupoDeSalida(enrollment._id, enrollment.group_id, await politicaDeCupo(session), estadoPaz, session);

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'SALIDA_MATRICULA_REGISTRADA',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    // Sin el motivo ni la observación: solo qué pasó y desde cuándo.
    detalle: `${estadoPrevio} -> RETIRADO (${input.tipo}) desde ${fecha.toISOString().slice(0, 10)}${receptora ? ` hacia ${receptora.nombre.trim()}` : ''}`,
  });
  if (pazYSalvo) await registrarEvento({ usuario_id: actor.id, accion: 'PAZ_Y_SALVO_SALIDA_ABIERTO', entidad: 'PazYSalvoSalida', entidad_id: enrollment._id, detalle: `${pazYSalvo.dependencias.length} dependencia(s)` });
  if (cupoLiberado) await registrarEvento({ usuario_id: actor.id, accion: 'SALIDA_CUPO_LIBERADO', entidad: 'Enrollment', entidad_id: enrollment._id, detalle: 'Al registrar la salida' });
  return { cupo_liberado: cupoLiberado };
}

/** Registra la salida de una matrícula (el camino completo, con todos los datos). */
export async function registrarSalida(enrollmentId: string, input: SalidaInput, usuario: UserDocument): Promise<DetalleSalida> {
  await runTransaction(async (session) => {
    const matricula = await Enrollment.findById(enrollmentId).session(session);
    if (!matricula) throw new ApiError(404, 'Matrícula no encontrada.');
    await exigirAlcance(usuario, matricula.group_id, session);
    await aplicarSalida(matricula, input, { id: usuario._id }, session);
  });
  return detalleDeSalida(enrollmentId, usuario);
}

// --- Consultas ---

/** ADMIN y coordinación ven toda la institución; Secretaría solo las sedes que tiene asignadas (como en los certificados, M26). */
async function exigirAlcance(usuario: UserDocument, groupId: Types.ObjectId, session?: ClientSession): Promise<void> {
  if (usuario.rol !== ROLES.SECRETARIA) return;
  const grupo = await Group.findById(groupId).select('sede_id').session(session ?? null).lean();
  const permitido = grupo && usuario.sedes_ids.some((s) => String(s) === String(grupo.sede_id));
  if (!permitido) throw new ApiError(404, 'Matrícula no encontrada.');
}

interface GrupoPoblado {
  _id: Types.ObjectId;
  nomenclatura: string;
  sede_id: { _id: Types.ObjectId; nombre: string } | null;
  jornada_id: { nombre: string } | null;
  grade_id: { nombre: string } | null;
}
const nombreGrupo = (g: GrupoPoblado | null): string => (g ? `${g.grade_id?.nombre ?? ''} ${g.nomenclatura}`.trim() : '');
const POBLAR_GRUPO = { path: 'group_id', select: 'nomenclatura sede_id jornada_id grade_id', populate: [{ path: 'sede_id', select: 'nombre' }, { path: 'jornada_id', select: 'nombre' }, { path: 'grade_id', select: 'nombre' }] };

interface EstudianteResumen {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface FilaSalida {
  enrollment_id: string;
  estudiante: EstudianteResumen;
  grupo: string;
  sede: string;
  tipo: TipoSalida;
  /** null: salida anterior a este módulo (solo se sabía el motivo). */
  fecha_efectiva: Date | null;
  motivo: string;
  institucion_receptora: string;
  estado_paz_y_salvo: EstadoPazYSalvoSalida;
  dependencias_pendientes: number;
  cupo_liberado: boolean;
  soportes: number;
  legado: boolean;
}

export interface FiltrosSalidas {
  academic_year_id: string;
  tipo?: TipoSalida;
  estado_paz_y_salvo?: EstadoPazYSalvoSalida;
  search?: string;
}

/** Las salidas del año, con el estado de su paz y salvo. */
export async function listarSalidas(filtros: FiltrosSalidas, usuario: UserDocument): Promise<FilaSalida[]> {
  const matriculas = await Enrollment.find({ academic_year_id: filtros.academic_year_id, estado: 'RETIRADO' })
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>('student_id', 'nombre apellido numero_documento')
    .populate<{ group_id: GrupoPoblado | null }>(POBLAR_GRUPO)
    .lean();
  const pazYSalvos = await PazYSalvoSalida.find({ academic_year_id: filtros.academic_year_id }).lean();
  const pazPorMatricula = new Map(pazYSalvos.map((p) => [String(p.enrollment_id), p]));
  const sedesPermitidas = usuario.rol === ROLES.SECRETARIA ? new Set(usuario.sedes_ids.map(String)) : null;
  const texto = (filtros.search ?? '').trim().toLowerCase();

  return matriculas
    .filter((m) => m.student_id && (!sedesPermitidas || (m.group_id?.sede_id && sedesPermitidas.has(String(m.group_id.sede_id._id)))))
    .map((m): FilaSalida => {
      const s = m.student_id as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
      const paz = pazPorMatricula.get(String(m._id));
      return {
        enrollment_id: String(m._id),
        estudiante: { _id: String(s._id), nombre: s.nombre, apellido: s.apellido, numero_documento: s.numero_documento },
        grupo: nombreGrupo(m.group_id),
        sede: m.group_id?.sede_id?.nombre ?? '',
        tipo: m.salida?.tipo ?? 'RETIRO',
        fecha_efectiva: m.salida?.fecha_efectiva ?? null,
        motivo: m.salida?.motivo ?? m.motivo_retiro ?? '',
        institucion_receptora: m.salida?.institucion_receptora?.nombre ?? '',
        estado_paz_y_salvo: paz ? estadoGlobalDePazYSalvo(paz.dependencias) : 'APROBADO',
        dependencias_pendientes: paz ? paz.dependencias.filter((d) => d.estado !== 'APROBADO').length : 0,
        cupo_liberado: m.salida?.cupo_liberado ?? true,
        soportes: m.salida?.soportes?.length ?? 0,
        legado: !m.salida,
      };
    })
    .filter((f) => !filtros.tipo || f.tipo === filtros.tipo)
    .filter((f) => !filtros.estado_paz_y_salvo || f.estado_paz_y_salvo === filtros.estado_paz_y_salvo)
    .filter((f) => !texto || `${f.estudiante.nombre} ${f.estudiante.apellido} ${f.estudiante.numero_documento} ${f.institucion_receptora}`.toLowerCase().includes(texto))
    .sort((a, b) => (b.fecha_efectiva?.getTime() ?? 0) - (a.fecha_efectiva?.getTime() ?? 0));
}

export interface MatriculaParaSalida {
  enrollment_id: string;
  estudiante: EstudianteResumen;
  grupo: string;
  estado: string;
  folio: string | null;
}

/** Las matrículas activas del año: de entre ellas se elige a quién se le registra la salida. */
export async function matriculasParaSalida(anioId: string, usuario: UserDocument): Promise<MatriculaParaSalida[]> {
  const matriculas = await Enrollment.find({ academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>('student_id', 'nombre apellido numero_documento')
    .populate<{ group_id: GrupoPoblado | null }>(POBLAR_GRUPO)
    .lean();
  const sedesPermitidas = usuario.rol === ROLES.SECRETARIA ? new Set(usuario.sedes_ids.map(String)) : null;
  return matriculas
    .filter((m) => m.student_id && (!sedesPermitidas || (m.group_id?.sede_id && sedesPermitidas.has(String(m.group_id.sede_id._id)))))
    .map((m) => {
      const s = m.student_id as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
      return {
        enrollment_id: String(m._id),
        estudiante: { _id: String(s._id), nombre: s.nombre, apellido: s.apellido, numero_documento: s.numero_documento },
        grupo: nombreGrupo(m.group_id),
        estado: m.estado,
        folio: m.folio_matricula,
      };
    })
    .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es'));
}

export interface DetalleSalida {
  enrollment_id: string;
  estado_matricula: string;
  estudiante: EstudianteResumen;
  anio: { _id: string; year: number; estado: string };
  grupo: { nombre: string; sede: string; jornada: string };
  libro: { folio: string | null; numero_libro: number | null; numero_folio: number | null; tipo_ingreso: string; fecha_matricula: Date };
  salida: {
    tipo: TipoSalida;
    nombre_tipo: string;
    fecha_efectiva: Date;
    motivo: string;
    observaciones: string;
    institucion_receptora: { nombre: string; codigo_dane: string; municipio: string } | null;
    registrado_por: string;
    fecha_registro: Date;
    cupo_liberado: boolean;
    fecha_cupo_liberado: Date | null;
    soportes: Array<{ _id: string; nombre: string; mimetype: string; tamano: number; fecha: Date }>;
  } | null;
  /** Salida anterior a este módulo: solo conserva el motivo. */
  legado: boolean;
  motivo_legado: string | null;
  politica_cupo: PoliticaCupoSalida;
  paz_y_salvo: PazYSalvoSalidaVista;
  trayectoria: Array<{ grupo: string; desde: Date; hasta: Date | null }>;
  /** Lo que sigue guardado a nombre del estudiante: nada de esto se borra ni se oculta al retirarlo. */
  conservado: { notas_asignatura: number; registros_asistencia: number; entregas: number; asistencia_posterior_a_la_salida: number };
  faltantes: string[];
}

export async function detalleDeSalida(enrollmentId: string, usuario: UserDocument): Promise<DetalleSalida> {
  const matricula = Types.ObjectId.isValid(enrollmentId)
    ? await Enrollment.findById(enrollmentId)
        .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>('student_id', 'nombre apellido numero_documento')
        .populate<{ group_id: GrupoPoblado | null }>(POBLAR_GRUPO)
        .lean()
    : null;
  if (!matricula || !matricula.student_id || !matricula.group_id || matricula.estado !== 'RETIRADO') throw new ApiError(404, 'Salida no encontrada.');
  if (usuario.rol === ROLES.SECRETARIA && !usuario.sedes_ids.some((s) => String(s) === String(matricula.group_id?.sede_id?._id))) throw new ApiError(404, 'Salida no encontrada.');

  const estudiante = matricula.student_id;
  const grupoActual = matricula.group_id;
  // `.lean()` no aplica el default del esquema: una matrícula anterior a la trayectoria no trae el campo.
  const tramos = matricula.trayectoria ?? [];
  const [anio, paz, politica, tramosGrupos, conteos] = await Promise.all([
    AcademicYear.findById(matricula.academic_year_id).select('year estado').lean(),
    vistaPazYSalvoDeSalida(matricula._id),
    politicaDeCupo(),
    Group.find({ _id: { $in: tramos.map((t) => t.group_id) } })
      .populate('grade_id', 'nombre')
      .select('nomenclatura grade_id')
      .lean(),
    conservadoDe(estudiante._id, matricula.academic_year_id, [matricula.group_id._id, ...tramos.map((t) => t.group_id)], matricula.salida?.fecha_efectiva ?? null),
  ]);
  const registrador = matricula.salida ? await User.findById(matricula.salida.registrado_por).select('nombre apellido').lean() : null;
  const nombresDeGrupos = new Map(tramosGrupos.map((g) => [String(g._id), `${(g.grade_id as unknown as { nombre?: string } | null)?.nombre ?? ''} ${g.nomenclatura}`.trim()]));
  // Una matrícula anterior a la trayectoria tiene un solo tramo: el grupo en el que terminó.
  const trayectoria =
    tramos.length > 0
      ? tramos.map((t) => ({ grupo: nombresDeGrupos.get(String(t.group_id)) ?? '', desde: t.desde, hasta: t.hasta }))
      : [{ grupo: nombreGrupo(grupoActual), desde: matricula.fecha_matricula, hasta: matricula.salida?.fecha_efectiva ?? null }];

  const faltantes: string[] = [];
  if (matricula.salida && matricula.salida.soportes.length === 0) faltantes.push('Soporte documental de la salida');

  return {
    enrollment_id: String(matricula._id),
    estado_matricula: matricula.estado,
    estudiante: { _id: String(estudiante._id), nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento },
    anio: { _id: String(matricula.academic_year_id), year: anio?.year ?? 0, estado: anio?.estado ?? '' },
    grupo: { nombre: nombreGrupo(grupoActual), sede: grupoActual.sede_id?.nombre ?? '', jornada: grupoActual.jornada_id?.nombre ?? '' },
    libro: {
      folio: matricula.folio_matricula,
      numero_libro: matricula.numero_libro,
      numero_folio: matricula.numero_folio,
      tipo_ingreso: matricula.tipo_ingreso,
      fecha_matricula: matricula.fecha_matricula,
    },
    salida: matricula.salida
      ? {
          tipo: matricula.salida.tipo,
          nombre_tipo: NOMBRES_TIPO_SALIDA[matricula.salida.tipo],
          fecha_efectiva: matricula.salida.fecha_efectiva,
          motivo: matricula.salida.motivo,
          observaciones: matricula.salida.observaciones,
          institucion_receptora: matricula.salida.institucion_receptora,
          registrado_por: registrador ? `${registrador.nombre} ${registrador.apellido}` : '',
          fecha_registro: matricula.salida.fecha_registro,
          cupo_liberado: matricula.salida.cupo_liberado,
          fecha_cupo_liberado: matricula.salida.fecha_cupo_liberado,
          soportes: matricula.salida.soportes.map((s) => ({ _id: String(s._id), nombre: s.nombre, mimetype: s.mimetype, tamano: s.tamano, fecha: s.fecha })),
        }
      : null,
    legado: !matricula.salida,
    motivo_legado: matricula.salida ? null : matricula.motivo_retiro,
    politica_cupo: politica,
    paz_y_salvo: paz,
    trayectoria,
    conservado: conteos,
    faltantes,
  };
}

/** Cuánto sigue guardado a nombre del estudiante en el año: es la prueba visible de que retirarlo no borró nada. */
async function conservadoDe(studentId: Types.ObjectId, anioId: Types.ObjectId, gruposIds: Types.ObjectId[], fechaEfectiva: Date | null): Promise<DetalleSalida['conservado']> {
  const asignaciones = await TeacherAssignment.find({ group_id: { $in: gruposIds } }).distinct('_id');
  const [notas, asistencia, entregas, posteriores] = await Promise.all([
    CalificacionAsignatura.countDocuments({ student_id: studentId, academic_year_id: anioId }),
    Attendance.aggregate<{ n: number }>([{ $match: { academic_year_id: anioId } }, { $unwind: '$registros' }, { $match: { 'registros.student_id': studentId } }, { $count: 'n' }]),
    Activity.find({ teacher_assignment_id: { $in: asignaciones } }).distinct('_id').then((ids) => ActivitySubmission.countDocuments({ student_id: studentId, activity_id: { $in: ids } })),
    // Si la salida se registró con fecha pasada, puede haber asistencia tomada después de esa fecha: se conserva, pero no cuenta en el boletín de retiro.
    fechaEfectiva
      ? Attendance.aggregate<{ n: number }>([
          { $match: { academic_year_id: anioId, fecha: { $gt: finDelDia(fechaEfectiva) } } },
          { $unwind: '$registros' },
          { $match: { 'registros.student_id': studentId } },
          { $count: 'n' },
        ])
      : Promise.resolve([] as Array<{ n: number }>),
  ]);
  return { notas_asignatura: notas, registros_asistencia: asistencia[0]?.n ?? 0, entregas, asistencia_posterior_a_la_salida: posteriores[0]?.n ?? 0 };
}

// --- Soportes documentales (mientras no exista el archivo general, M29) ---

export async function agregarSoporte(
  enrollmentId: string,
  archivo: { nombre: string; archivo_path: string; mimetype: string; tamano: number },
  usuario: UserDocument,
  ip?: string | null
): Promise<DetalleSalida> {
  const matricula = await Enrollment.findById(enrollmentId);
  if (!matricula?.salida) throw new ApiError(404, 'Esta matrícula no tiene una salida registrada.');
  await exigirAlcance(usuario, matricula.group_id);
  if (matricula.salida.soportes.length >= MAX_SOPORTES_SALIDA) throw new ApiError(409, `Una salida admite hasta ${MAX_SOPORTES_SALIDA} soportes.`);
  matricula.salida.soportes.push({ ...archivo, cargado_por: usuario._id, fecha: new Date() } as never);
  await matricula.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'SALIDA_SOPORTE_CARGADO', entidad: 'Enrollment', entidad_id: matricula._id, detalle: archivo.nombre, ip });
  return detalleDeSalida(enrollmentId, usuario);
}

export async function archivoDeSoporte(enrollmentId: string, soporteId: string, usuario: UserDocument, ip?: string | null): Promise<{ ruta: string; nombre: string; mimetype: string }> {
  const matricula = await Enrollment.findById(enrollmentId);
  const soporte = matricula?.salida?.soportes.id(soporteId);
  if (!matricula || !soporte) throw new ApiError(404, 'Soporte no encontrado.');
  await exigirAlcance(usuario, matricula.group_id);
  await registrarEvento({ usuario_id: usuario._id, accion: 'SALIDA_SOPORTE_DESCARGADO', entidad: 'Enrollment', entidad_id: matricula._id, detalle: soporte.nombre, ip });
  return { ruta: soporte.archivo_path, nombre: soporte.nombre, mimetype: soporte.mimetype };
}
