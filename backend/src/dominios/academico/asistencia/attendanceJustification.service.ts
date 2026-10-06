import fs from 'fs/promises';
import path from 'path';
import { EstadoJustificacion } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import Attendance from './attendance.model';
import AttendanceJustification, { AttendanceJustificationDocument } from './attendanceJustification.model';
import StudentGuardian from '../../registro/estudiantes/studentGuardian.model';
import { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { detectarFirmaArchivo } from '../../../utils/firmasArchivo';
import { carpetaAsistencia } from '../../../utils/uploadPaths';
import { registrarEvento } from '../../../services/audit.service';
import { mapaDeEstados } from './attendanceState.service';
import { filtroAlcanceAsistencia } from './attendance.service';

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface CrearJustificacionInput {
  attendance_id: string;
  registro_id: string;
  motivo: string;
  acudiente_id?: string;
}

/** Una planilla visible para el usuario: staff todas; un docente solo las de sus clases (M08). */
async function obtenerPlanillaVisible(attendanceId: string, usuario: UserDocument) {
  const planilla = await Attendance.findById(attendanceId);
  if (!planilla) throw new ApiError(404, 'Planilla de asistencia no encontrada.');

  const alcance = await filtroAlcanceAsistencia(usuario, String(planilla.academic_year_id));
  if (alcance && !(await Attendance.exists({ _id: planilla._id, ...alcance }))) {
    throw new ApiError(403, 'No tiene permisos sobre la asistencia de esta clase.');
  }
  return planilla;
}

/**
 * Registra la excusa de una inasistencia con su soporte (opcional). Mientras no exista el portal M27, la carga la
 * hace el personal en nombre del acudiente (`acudiente_id`, que debe estar vinculado al estudiante en M03).
 * Queda PENDIENTE hasta que coordinación la revise.
 */
export async function crearJustificacion(
  input: CrearJustificacionInput,
  archivo: ArchivoSubido | undefined,
  usuario: UserDocument,
  ip?: string | null
): Promise<AttendanceJustificationDocument> {
  const planilla = await obtenerPlanillaVisible(input.attendance_id, usuario);

  const registro = planilla.registros.id(input.registro_id);
  if (!registro) throw new ApiError(404, 'Registro de asistencia no encontrado en esa planilla.');

  const estado = (await mapaDeEstados()).get(String(registro.state_id));
  if (!estado?.cuenta_como_falla) {
    throw new ApiError(409, 'Solo se pueden justificar inasistencias (estados que cuentan como falla).');
  }

  if (input.acudiente_id) {
    const vinculo = await StudentGuardian.exists({ student_id: registro.student_id, guardian_id: input.acudiente_id });
    if (!vinculo) throw new ApiError(400, 'El acudiente no está vinculado a este estudiante.');
  }

  let archivoPath: string | null = null;
  if (archivo) {
    // El mimetype lo declara el cliente: se confirma con la firma de bytes y la extensión sale de ella.
    const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
    if (!firma) throw new ApiError(400, 'El soporte no es un PDF, JPG, PNG o WEBP válido.');

    const carpeta = carpetaAsistencia(input.attendance_id);
    await fs.mkdir(carpeta, { recursive: true });
    const destino = path.join(carpeta, `${input.registro_id}-${Date.now()}${firma.ext}`);
    await fs.writeFile(destino, archivo.buffer);
    archivoPath = path.relative(process.cwd(), destino);
  }

  let justificacion: AttendanceJustificationDocument;
  try {
    justificacion = await AttendanceJustification.create({
      attendance_id: planilla._id,
      registro_id: registro._id,
      student_id: registro.student_id,
      acudiente_id: input.acudiente_id ?? null,
      motivo: input.motivo,
      archivo_path: archivoPath,
      archivo_nombre: archivo ? archivo.originalname.slice(0, 120) : null,
      registrado_por: usuario._id,
    });
  } catch (err) {
    if (archivoPath) await fs.rm(path.resolve(process.cwd(), archivoPath), { force: true });
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'Esta inasistencia ya tiene una justificación pendiente o aprobada.');
    }
    throw err;
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'JUSTIFICACION_ASISTENCIA_CREADA',
    entidad: 'AttendanceJustification',
    entidad_id: justificacion._id,
    detalle: `Estudiante ${String(registro.student_id)}, ${planilla.fecha.toISOString().slice(0, 10)}${archivoPath ? ' (con soporte)' : ''}.`,
    ip,
  });
  return justificacion;
}

export interface ListarJustificacionesFiltro {
  academic_year_id: string;
  estado?: EstadoJustificacion;
  student_id?: string;
  group_id?: string;
}

export async function listarJustificaciones(filtro: ListarJustificacionesFiltro, usuario: UserDocument) {
  const alcance = await filtroAlcanceAsistencia(usuario, filtro.academic_year_id);
  const planillas = await Attendance.find({
    academic_year_id: filtro.academic_year_id,
    ...(filtro.group_id ? { group_id: filtro.group_id } : {}),
    ...alcance,
  })
    .select('fecha periodo_numero group_id subject_id registros')
    .populate<{ group_id: { nomenclatura: string } }>('group_id', 'nomenclatura')
    .populate<{ subject_id: { nombre: string } }>('subject_id', 'nombre');
  const planillaDe = new Map(planillas.map((p) => [String(p._id), p]));

  const justificaciones = await AttendanceJustification.find({
    attendance_id: { $in: planillas.map((p) => p._id) },
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    ...(filtro.student_id ? { student_id: filtro.student_id } : {}),
  })
    .populate('student_id', 'nombre apellido numero_documento')
    .populate('acudiente_id', 'nombre apellido')
    .populate('revisado_por', 'nombre apellido')
    .sort({ createdAt: -1 })
    .limit(300);

  const estados = await mapaDeEstados();
  return justificaciones.map((j) => {
    const planilla = planillaDe.get(String(j.attendance_id));
    const registro = planilla?.registros.id(j.registro_id);
    return {
      ...j.toObject(),
      tiene_soporte: Boolean(j.archivo_path),
      archivo_path: undefined,
      inasistencia: {
        fecha: planilla?.fecha ?? null,
        periodo_numero: planilla?.periodo_numero ?? null,
        grupo: planilla?.group_id.nomenclatura ?? null,
        asignatura: planilla?.subject_id.nombre ?? null,
        estado: registro ? (estados.get(String(registro.state_id))?.nombre ?? null) : null,
      },
    };
  });
}

export interface RevisarJustificacionInput {
  estado: Extract<EstadoJustificacion, 'APROBADA' | 'RECHAZADA'>;
  comentario?: string;
}

/** Coordinación aprueba o rechaza. Una aprobada convierte la falla en justificada en reportes y boletín. */
export async function revisarJustificacion(
  id: string,
  input: RevisarJustificacionInput,
  revisor: UserDocument,
  ip?: string | null
): Promise<AttendanceJustificationDocument> {
  const justificacion = await AttendanceJustification.findById(id);
  if (!justificacion) throw new ApiError(404, 'Justificación no encontrada.');
  if (justificacion.estado !== 'PENDIENTE') throw new ApiError(409, 'Esta justificación ya fue revisada.');
  if (input.estado === 'RECHAZADA' && !input.comentario?.trim()) {
    throw new ApiError(400, 'Indica el motivo del rechazo.');
  }

  justificacion.estado = input.estado;
  justificacion.comentario_revision = input.comentario?.trim() || null;
  justificacion.revisado_por = revisor._id;
  justificacion.fecha_revision = new Date();
  await justificacion.save();

  await registrarEvento({
    usuario_id: revisor._id,
    accion: 'JUSTIFICACION_ASISTENCIA_REVISADA',
    entidad: 'AttendanceJustification',
    entidad_id: justificacion._id,
    detalle: input.estado,
    ip,
  });
  return justificacion;
}

/** Ruta absoluta del soporte, con los mismos permisos que la planilla a la que pertenece. */
export async function rutaDelSoporte(id: string, usuario: UserDocument): Promise<{ ruta: string; nombre: string | null }> {
  const justificacion = await AttendanceJustification.findById(id);
  if (!justificacion) throw new ApiError(404, 'Justificación no encontrada.');
  if (usuario.rol !== ROLES.ADMIN) await obtenerPlanillaVisible(String(justificacion.attendance_id), usuario);
  if (!justificacion.archivo_path) throw new ApiError(404, 'Esta justificación no tiene soporte adjunto.');

  return { ruta: path.resolve(process.cwd(), justificacion.archivo_path), nombre: justificacion.archivo_nombre };
}
