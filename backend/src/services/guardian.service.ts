import { Types } from 'mongoose';
import { Parentesco, TipoDocumento } from '../constants/enums';
import Guardian, { GuardianDocument } from '../models/guardian.model';
import StudentGuardian, { StudentGuardianDocument } from '../models/studentGuardian.model';
import User from '../models/user.model';
import { ROLES } from '../constants/roles';
import ApiError from '../utils/ApiError';

export interface DatosNuevoAcudiente {
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombre: string;
  apellido: string;
  telefono_principal: string;
  telefono_secundario?: string;
  email?: string;
  ocupacion?: string;
  direccion?: string;
}

export interface VincularAcudienteInput extends Partial<DatosNuevoAcudiente> {
  guardian_id?: string;
  parentesco: Parentesco;
  es_principal?: boolean;
  autorizado_retiro?: boolean;
}

async function obtenerEstudiante(studentId: string) {
  const student = await User.findOne({ _id: studentId, rol: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');
  return student;
}

/** Si `es_principal` es true, quita el flag a cualquier otro acudiente del mismo estudiante. */
async function asegurarUnicoPrincipal(studentId: string, exceptoRelacionId?: Types.ObjectId): Promise<void> {
  await StudentGuardian.updateMany(
    { student_id: studentId, _id: { $ne: exceptoRelacionId } },
    { $set: { es_principal: false } }
  );
}

export async function listarAcudientes(filter: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: GuardianDocument[]; total: number; page: number; pages: number }> {
  const query: Record<string, unknown> = {};
  if (filter.search) {
    const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }, { email: regex }];
  }

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

  const [data, total] = await Promise.all([
    Guardian.find(query)
      .sort({ apellido: 1, nombre: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Guardian.countDocuments(query),
  ]);

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function listarAcudientesDeEstudiante(studentId: string): Promise<StudentGuardianDocument[]> {
  await obtenerEstudiante(studentId);
  return StudentGuardian.find({ student_id: studentId }).populate('guardian_id').sort({ es_principal: -1 });
}

export async function vincularAcudiente(
  studentId: string,
  input: VincularAcudienteInput
): Promise<StudentGuardianDocument> {
  await obtenerEstudiante(studentId);

  let guardian: GuardianDocument | null;
  if (input.guardian_id) {
    guardian = await Guardian.findById(input.guardian_id);
    if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  } else {
    if (!input.tipo_documento || !input.numero_documento || !input.nombre || !input.apellido || !input.telefono_principal) {
      throw new ApiError(400, 'Faltan datos para registrar un acudiente nuevo.');
    }
    guardian = await Guardian.findOne({ numero_documento: input.numero_documento });
    if (!guardian) {
      guardian = await Guardian.create({
        tipo_documento: input.tipo_documento,
        numero_documento: input.numero_documento,
        nombre: input.nombre,
        apellido: input.apellido,
        telefono_principal: input.telefono_principal,
        telefono_secundario: input.telefono_secundario,
        email: input.email,
        ocupacion: input.ocupacion,
        direccion: input.direccion,
      });
    }
  }

  const yaVinculado = await StudentGuardian.findOne({ student_id: studentId, guardian_id: guardian._id });
  if (yaVinculado) throw new ApiError(409, 'Este acudiente ya esta vinculado a este estudiante.');

  if (input.es_principal) await asegurarUnicoPrincipal(studentId);

  return StudentGuardian.create({
    student_id: studentId,
    guardian_id: guardian._id,
    parentesco: input.parentesco,
    es_principal: Boolean(input.es_principal),
    autorizado_retiro: input.autorizado_retiro ?? true,
  });
}

export async function actualizarVinculo(
  relationId: string,
  patch: { parentesco?: Parentesco; es_principal?: boolean; autorizado_retiro?: boolean }
): Promise<StudentGuardianDocument> {
  const relacion = await StudentGuardian.findById(relationId);
  if (!relacion) throw new ApiError(404, 'Vinculo acudiente-estudiante no encontrado.');

  if (patch.es_principal) await asegurarUnicoPrincipal(String(relacion.student_id), relacion._id);

  Object.assign(relacion, patch);
  await relacion.save();
  return relacion;
}

export async function desvincularAcudiente(relationId: string): Promise<void> {
  const relacion = await StudentGuardian.findById(relationId);
  if (!relacion) throw new ApiError(404, 'Vinculo acudiente-estudiante no encontrado.');
  await StudentGuardian.deleteOne({ _id: relacion._id });
}

export async function actualizarAcudiente(
  guardianId: string,
  patch: Partial<DatosNuevoAcudiente>
): Promise<GuardianDocument> {
  const guardian = await Guardian.findById(guardianId);
  if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  Object.assign(guardian, patch);
  await guardian.save();
  return guardian;
}

export async function actualizarEstadoAcudiente(guardianId: string, estado: 'activo' | 'inactivo'): Promise<GuardianDocument> {
  const guardian = await Guardian.findById(guardianId);
  if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  guardian.estado = estado;
  await guardian.save();
  return guardian;
}
