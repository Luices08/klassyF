import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import ObservacionBoletin from '../models/observacionBoletin.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { asignacionDelDocente } from './activity.service';
import { registrarEvento } from './audit.service';
import { assertPeriodNotLocked } from './periodLock.service';

export interface ObservacionInput {
  student_id: string;
  /** Vacío = quitar la observación. */
  texto: string;
}

export interface ObservacionVista {
  student_id: string;
  nombre_completo: string;
  documento: string;
  texto: string;
}

/** El docente titular escribe; coordinación y administración solo consultan. Otro docente, nada. */
async function resolverAcceso(asignacionId: string, usuario: UserDocument): Promise<TeacherAssignmentDocument> {
  if (usuario.rol === ROLES.DOCENTE) return asignacionDelDocente(asignacionId, usuario);
  const asignacion = await TeacherAssignment.findById(asignacionId);
  if (!asignacion || asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) {
    throw new ApiError(404, 'Asignación académica de clase no encontrada.');
  }
  return asignacion;
}

async function exigirPeriodo(anioId: Types.ObjectId, periodoNumero: number): Promise<void> {
  const anio = await AcademicYear.findById(anioId).select('periodos year');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!anio.periodos.some((p) => p.numero === periodoNumero)) {
    throw new ApiError(400, `El año ${anio.year} no tiene un periodo ${periodoNumero}.`);
  }
}

async function estudiantesDelGrupo(grupoId: Types.ObjectId, anioId: Types.ObjectId): Promise<UserDocument[]> {
  const matriculas = await Enrollment.find({ group_id: grupoId, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id');
  const estudiantes = await User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).sort({ apellido: 1, nombre: 1 });
  return estudiantes;
}

export async function listarObservaciones(asignacionId: string, periodoNumero: number, usuario: UserDocument): Promise<ObservacionVista[]> {
  const asignacion = await resolverAcceso(asignacionId, usuario);
  await exigirPeriodo(asignacion.academic_year_id, periodoNumero);

  const [estudiantes, guardadas] = await Promise.all([
    estudiantesDelGrupo(asignacion.group_id as Types.ObjectId, asignacion.academic_year_id),
    ObservacionBoletin.find({ teacher_assignment_id: asignacion._id, periodo_numero: periodoNumero }).lean(),
  ]);
  const textoPor = new Map(guardadas.map((o) => [String(o.student_id), o.texto]));

  return estudiantes.map((e) => ({
    student_id: String(e._id),
    nombre_completo: `${e.apellido} ${e.nombre}`,
    documento: e.numero_documento,
    texto: textoPor.get(String(e._id)) ?? '',
  }));
}

/**
 * Guarda en lote las observaciones de una clase: valida todo antes de escribir (un estudiante ajeno al grupo o un periodo
 * que ya no admite cambios deja todo como estaba) y exige las mismas ventanas que la digitación de notas (M05).
 */
export async function guardarObservaciones(
  asignacionId: string,
  periodoNumero: number,
  observaciones: ObservacionInput[],
  usuario: UserDocument,
  ip?: string | null
): Promise<{ guardadas: number; eliminadas: number }> {
  if (usuario.rol !== ROLES.DOCENTE) throw new ApiError(403, 'Solo el docente titular escribe las observaciones del boletín.');
  const asignacion = await resolverAcceso(asignacionId, usuario);
  const grupoId = asignacion.group_id as Types.ObjectId;
  await exigirPeriodo(asignacion.academic_year_id, periodoNumero);
  await assertPeriodNotLocked(asignacion.academic_year_id, grupoId, periodoNumero, usuario._id);

  const estudiantes = await estudiantesDelGrupo(grupoId, asignacion.academic_year_id);
  const idsDelGrupo = new Set(estudiantes.map((e) => String(e._id)));
  const vistos = new Set<string>();
  for (const o of observaciones) {
    if (!idsDelGrupo.has(o.student_id)) throw new ApiError(400, 'Hay un estudiante que no pertenece a este grupo o no tiene matrícula activa.');
    if (vistos.has(o.student_id)) throw new ApiError(400, 'Un estudiante aparece más de una vez.');
    vistos.add(o.student_id);
  }

  let guardadas = 0;
  let eliminadas = 0;
  for (const o of observaciones) {
    const filtro = { teacher_assignment_id: asignacion._id, periodo_numero: periodoNumero, student_id: o.student_id };
    if (!o.texto.trim()) {
      eliminadas += (await ObservacionBoletin.deleteOne(filtro)).deletedCount;
      continue;
    }
    await ObservacionBoletin.updateOne(
      filtro,
      {
        $set: { texto: o.texto.trim(), autor_id: usuario._id },
        $setOnInsert: {
          academic_year_id: asignacion.academic_year_id,
          group_id: grupoId,
          subject_id: asignacion.subject_id,
        },
      },
      { upsert: true, runValidators: true }
    );
    guardadas += 1;
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_OBSERVACIONES_GUARDADAS',
    entidad: 'TeacherAssignment',
    entidad_id: asignacion._id,
    detalle: `periodo ${periodoNumero}: ${guardadas} guardadas, ${eliminadas} quitadas`,
    ip,
  });
  return { guardadas, eliminadas };
}
