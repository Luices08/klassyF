import fs from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { EstadoActividadEstudiante, FORMATOS_EVIDENCIA } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ActivitySubmission, { IActivitySubmission } from '../models/activitySubmission.model';
import Enrollment from '../models/enrollment.model';
import PeriodLock from '../models/periodLock.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { estadoDeEntrega, evaluarVentanaEntrega } from '../utils/actividades';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
import { detectarEvidencia } from '../utils/evidenciasActividad';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { carpetaActividad } from '../utils/uploadPaths';
import { ActividadPlana, VistaActividad, armarVistas, asignacionDelDocente } from './activity.service';
import { registrarEvento } from './audit.service';
import { fechaDeClase } from './attendance.service';

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

type EntregaPlana = IActivitySubmission & { _id: Types.ObjectId };

/** La entrega tal como viaja por la API: nunca la ruta en disco, solo si hay archivo y cómo se llama. */
export function vistaEntrega(entrega: EntregaPlana | null) {
  if (!entrega) return null;
  return {
    _id: String(entrega._id),
    estado: estadoDeEntrega(entrega),
    fecha_entrega: entrega.fecha_entrega ?? null,
    con_retraso: entrega.con_retraso ?? false,
    texto_entrega: entrega.texto_entrega ?? '',
    tiene_archivo: Boolean(entrega.archivo_path),
    archivo_nombre: entrega.archivo_nombre ?? null,
    archivo_formato: entrega.archivo_formato ?? null,
    calificacion_numerica: entrega.calificacion_numerica ?? null,
    retroalimentacion: entrega.retroalimentacion ?? '',
    fecha_calificacion: entrega.fecha_calificacion ?? null,
  };
}

// --- Bandeja del estudiante (CU-EST-03) ---

export interface FiltrosMisActividades {
  subject_id?: string;
  estado?: EstadoActividadEstudiante;
  periodo?: number;
  /** YYYY-MM-DD, sobre la fecha de entrega. */
  desde?: string;
  hasta?: string;
}

function periodoCerrado(anio: AcademicYearDocument, periodo: number): boolean {
  return anio.periodos.find((p) => p.numero === periodo)?.estado === 'CERRADO';
}

/** Lo que el estudiante necesita para decidir si entrega: su estado, si el plazo sigue abierto y por qué no. */
function vistaParaEstudiante(vista: VistaActividad, entrega: EntregaPlana | null, anio: AcademicYearDocument, ahora: Date) {
  const estado = estadoDeEntrega(entrega);
  const ventana = evaluarVentanaEntrega(vista, ahora);

  let motivoBloqueo: string | null = null;
  if (!vista.requiere_entrega) motivoBloqueo = 'Esta actividad no recibe entregas digitales: tu docente la califica en clase.';
  else if (estado === 'CALIFICADA') motivoBloqueo = 'La actividad ya fue calificada.';
  else if (periodoCerrado(anio, vista.periodo_numero)) motivoBloqueo = `El periodo ${vista.periodo_numero} está cerrado.`;
  else if (!ventana.abierta) motivoBloqueo = ventana.motivo;

  return {
    ...vista,
    estado,
    puede_entregar: motivoBloqueo === null,
    motivo_bloqueo: motivoBloqueo,
    entrega: vistaEntrega(entrega),
  };
}

async function anioEnCurso(): Promise<AcademicYearDocument | null> {
  return AcademicYear.findOne({ estado: 'EN_CURSO' });
}

async function asignacionesDelEstudiante(estudianteId: Types.ObjectId, anio: AcademicYearDocument, subjectId?: string) {
  const matriculas = await Enrollment.find({
    student_id: estudianteId,
    academic_year_id: anio._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  })
    .select('group_id')
    .lean();
  if (matriculas.length === 0) return [];

  return TeacherAssignment.find({
    group_id: { $in: matriculas.map((m) => m.group_id) },
    academic_year_id: anio._id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    ...(subjectId ? { subject_id: subjectId } : {}),
  })
    .select('_id')
    .lean();
}

/** Las actividades publicadas de las clases del grupo del estudiante, con su entrega; la más próxima a vencer primero. */
export async function listarMisActividades(estudiante: UserDocument, filtros: FiltrosMisActividades) {
  const anio = await anioEnCurso();
  if (!anio) return [];

  const asignaciones = await asignacionesDelEstudiante(estudiante._id, anio, filtros.subject_id);
  if (asignaciones.length === 0) return [];

  const ahora = new Date();
  const actividades = (await Activity.find({
    teacher_assignment_id: { $in: asignaciones.map((a) => a._id) },
    fecha_apertura: { $lte: ahora },
    ...(filtros.periodo ? { periodo_numero: filtros.periodo } : {}),
    ...(filtros.desde || filtros.hasta
      ? {
          fecha_entrega: {
            ...(filtros.desde ? { $gte: inicioDelDia(fechaDeClase(filtros.desde)) } : {}),
            ...(filtros.hasta ? { $lte: finDelDia(fechaDeClase(filtros.hasta)) } : {}),
          },
        }
      : {}),
  })
    .sort({ fecha_entrega: 1 })
    .lean()) as unknown as ActividadPlana[];

  const [vistas, entregas] = await Promise.all([
    armarVistas(actividades, ahora),
    ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) }, student_id: estudiante._id }).lean(),
  ]);
  const entregaDe = new Map(entregas.map((e) => [String(e.activity_id), e as unknown as EntregaPlana]));

  const resultado = vistas.map((v) => vistaParaEstudiante(v, entregaDe.get(v._id) ?? null, anio, ahora));
  return filtros.estado ? resultado.filter((r) => r.estado === filtros.estado) : resultado;
}

export async function detalleParaEstudiante(id: string, estudiante: UserDocument) {
  const anio = await anioEnCurso();
  const actividad = (await Activity.findById(id).lean()) as unknown as ActividadPlana | null;
  // "No existe", "no es de tu grupo" y "aún no se publica" responden igual: no se revela lo que el estudiante no ve.
  if (!anio || !actividad || actividad.fecha_apertura > new Date()) throw new ApiError(404, 'Actividad no encontrada.');

  const propias = await asignacionesDelEstudiante(estudiante._id, anio);
  if (!propias.some((a) => String(a._id) === String(actividad.teacher_assignment_id))) {
    throw new ApiError(404, 'Actividad no encontrada.');
  }

  const [[vista], entrega] = await Promise.all([
    armarVistas([actividad]),
    ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudiante._id }).lean(),
  ]);
  return vistaParaEstudiante(vista as VistaActividad, entrega as unknown as EntregaPlana | null, anio, new Date());
}

// --- Entrega de evidencias (CU-EST-03) ---

export interface RegistrarEntregaInput {
  texto_entrega?: string;
}

/**
 * Registra (o reemplaza, mientras no esté calificada) la entrega del estudiante y marca sola la transición de estado:
 * a tiempo -> ENTREGADA, pasado el plazo en una actividad que lo admite -> ENTREGADA_TARDE. Con formatos definidos exige
 * un archivo de uno de ellos; sin formatos, la respuesta es el texto.
 */
export async function registrarEntrega(
  activityId: string,
  input: RegistrarEntregaInput,
  archivo: ArchivoSubido | undefined,
  estudiante: UserDocument,
  ip?: string | null
) {
  const actividad = await Activity.findById(activityId);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await TeacherAssignment.findById(actividad.teacher_assignment_id);
  if (!asignacion) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');

  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, `El año lectivo ${anio.year} no está vigente; no se reciben entregas.`);

  const matricula = await Enrollment.exists({
    student_id: estudiante._id,
    group_id: asignacion.group_id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  if (!matricula) throw new ApiError(403, 'El estudiante no esta matriculado en el grupo de esta actividad.');

  const ahora = new Date();
  const ventana = evaluarVentanaEntrega(
    { fecha_apertura: actividad.fecha_apertura, fecha_entrega: actividad.fecha_entrega, permite_entrega_tardia: actividad.permite_entrega_tardia ?? false },
    ahora
  );
  if (!ventana.publicada) throw new ApiError(404, 'Actividad no encontrada.');
  if (!(actividad.requiere_entrega ?? true)) throw new ApiError(409, 'Esta actividad no recibe entregas digitales.');
  if (periodoCerrado(anio, actividad.periodo_numero)) {
    throw new ApiError(409, `El periodo ${actividad.periodo_numero} está cerrado; ya no se reciben entregas.`);
  }
  if (
    await PeriodLock.exists({
      academic_year_id: anio._id,
      group_id: asignacion.group_id,
      periodo_numero: actividad.periodo_numero,
      estado: 'CERRADO',
    })
  ) {
    throw new ApiError(409, `El periodo ${actividad.periodo_numero} está cerrado para tu grupo; ya no se reciben entregas.`);
  }
  if (!ventana.abierta) throw new ApiError(409, ventana.motivo ?? 'La actividad no recibe entregas.');

  const previa = await ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudiante._id });
  if (previa && typeof previa.calificacion_numerica === 'number') {
    throw new ApiError(409, 'La actividad ya fue calificada; no se puede modificar la entrega.');
  }

  const formatos = actividad.formatos_permitidos ?? [];
  const texto = input.texto_entrega?.trim() ?? '';
  let datosArchivo: { path: string; nombre: string; formato: string; bytes: number } | null = null;
  let destino: string | null = null;

  if (formatos.length === 0) {
    if (archivo) throw new ApiError(400, 'Esta actividad se responde por escrito: no recibe archivos.');
    if (!texto) throw new ApiError(400, 'Escribe tu respuesta para entregar la actividad.');
  } else {
    if (!archivo) throw new ApiError(400, 'Adjunta el archivo de tu entrega.');
    // El mimetype lo declara el cliente: la firma de bytes decide qué es el archivo y de ahí sale la extensión.
    const evidencia = detectarEvidencia(archivo.mimetype, archivo.originalname, archivo.buffer);
    if (!evidencia) throw new ApiError(400, 'El archivo no es un PDF, Word, Excel, PowerPoint o imagen válido.');
    if (!formatos.includes(evidencia.formato)) {
      throw new ApiError(400, `Esta actividad solo acepta: ${formatos.map((f) => FORMATOS_EVIDENCIA[f].etiqueta).join(', ')}.`);
    }

    const carpeta = carpetaActividad(String(actividad._id));
    await fs.mkdir(carpeta, { recursive: true });
    destino = path.join(carpeta, `${String(estudiante._id)}-${ahora.getTime()}${evidencia.ext}`);
    await fs.writeFile(destino, archivo.buffer);
    datosArchivo = {
      path: path.relative(process.cwd(), destino),
      nombre: archivo.originalname.slice(0, 120),
      formato: evidencia.formato,
      bytes: archivo.buffer.length,
    };
  }

  let entrega;
  try {
    entrega = await ActivitySubmission.findOneAndUpdate(
      // `calificacion_numerica: null` cierra la carrera con una calificación que llegue entre la lectura y esta
      // escritura: el índice único la convierte en un 409 en vez de pisar la nota.
      { activity_id: actividad._id, student_id: estudiante._id, calificacion_numerica: null },
      {
        $set: {
          texto_entrega: texto,
          archivo_path: datosArchivo?.path ?? null,
          archivo_nombre: datosArchivo?.nombre ?? null,
          archivo_formato: datosArchivo?.formato ?? null,
          archivo_bytes: datosArchivo?.bytes ?? null,
          fecha_entrega: ahora,
          estado: ventana.tardia ? 'ENTREGADA_TARDE' : 'ENTREGADA',
          con_retraso: ventana.tardia,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    if (destino) await fs.rm(destino, { force: true });
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'La actividad ya fue calificada; no se puede modificar la entrega.');
    }
    throw err;
  }

  if (previa?.archivo_path && previa.archivo_path !== datosArchivo?.path) {
    await fs.rm(path.resolve(process.cwd(), previa.archivo_path), { force: true });
  }

  await registrarEvento({
    usuario_id: estudiante._id,
    accion: 'ACTIVIDAD_ENTREGA_REGISTRADA',
    entidad: 'ActivitySubmission',
    entidad_id: entrega?._id ?? null,
    detalle: `Actividad ${String(actividad._id)}${ventana.tardia ? ' (con retraso)' : ''}${previa ? ' (reemplaza una entrega anterior)' : ''}.`,
    ip,
  });
  return vistaEntrega(entrega as unknown as EntregaPlana);
}

// --- Revisión del docente ---

/** Cada estudiante activo del grupo con lo que entregó (o nada): la lista desde la que el docente revisa y califica. */
export async function listarEntregas(activityId: string, usuario: UserDocument) {
  const actividad = await Activity.findById(activityId).lean();
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  if (usuario.rol === ROLES.DOCENTE) await asignacionDelDocente(actividad.teacher_assignment_id, usuario);

  const asignacion = await TeacherAssignment.findById(actividad.teacher_assignment_id).select('group_id').lean();
  if (!asignacion?.group_id) throw new ApiError(404, 'Grupo de la actividad no encontrado.');

  const [matriculas, entregas] = await Promise.all([
    Enrollment.find({ group_id: asignacion.group_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
      .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>(
        'student_id',
        'nombre apellido numero_documento'
      )
      .lean(),
    ActivitySubmission.find({ activity_id: actividad._id }).lean(),
  ]);
  const entregaDe = new Map(entregas.map((e) => [String(e.student_id), e as unknown as EntregaPlana]));

  return matriculas
    .filter((m) => m.student_id)
    .map((m) => {
      const estudiante = m.student_id as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
      const entrega = entregaDe.get(String(estudiante._id)) ?? null;
      return {
        estudiante: {
          _id: String(estudiante._id),
          nombre: estudiante.nombre,
          apellido: estudiante.apellido,
          numero_documento: estudiante.numero_documento,
        },
        estado: estadoDeEntrega(entrega),
        entrega: vistaEntrega(entrega),
      };
    })
    .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es'));
}

/** Ruta del archivo entregado: el propio estudiante, el docente titular, coordinación o administración. */
export async function rutaDeEntrega(entregaId: string, usuario: UserDocument): Promise<{ ruta: string; nombre: string | null }> {
  const entrega = await ActivitySubmission.findById(entregaId);
  if (!entrega || !entrega.archivo_path) throw new ApiError(404, 'Entrega no encontrada.');

  if (usuario.rol === ROLES.ESTUDIANTE) {
    if (String(entrega.student_id) !== String(usuario._id)) throw new ApiError(404, 'Entrega no encontrada.');
  } else if (usuario.rol === ROLES.DOCENTE) {
    const actividad = await Activity.findById(entrega.activity_id).select('teacher_assignment_id').lean();
    if (!actividad) throw new ApiError(404, 'Entrega no encontrada.');
    await asignacionDelDocente(actividad.teacher_assignment_id, usuario);
  }

  return { ruta: path.resolve(process.cwd(), entrega.archivo_path), nombre: entrega.archivo_nombre };
}
