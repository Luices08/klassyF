import { ClientSession, Types } from 'mongoose';
import { Parentesco, TipoDocumento } from '../../../constants/enums';
import Guardian, { GuardianDocument } from './guardian.model';
import StudentGuardian, { StudentGuardianDocument } from './studentGuardian.model';
import User from '../../../models/user.model';
import { ROLES } from '../../../constants/roles';
import ApiError from '../../../utils/ApiError';
import runTransaction from '../../../utils/runTransaction';
import { registrarEvento } from '../../../services/audit.service';

export interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

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
  /** Crea (o reutiliza) la cuenta de portal M27 del acudiente. Sin esto M02 no se toca. */
  habilitar_portal?: boolean;
}

interface CuentaPortal {
  usuarioId: Types.ObjectId;
  creada: boolean;
}

/**
 * Dato único: si ya hay un `User` con ese documento se reutiliza, nunca se duplica. Una persona que
 * ya es personal del colegio (otro rol) no se convierte en acudiente por esta vía: el portal M27
 * resuelve al acudiente por `user_id` + rol ACUDIENTE, y mezclar roles en un mismo usuario no existe.
 * La contraseña temporal es el número de documento (decisión de producto); `debe_cambiar_password`
 * obliga a cambiarla en el primer ingreso.
 */
async function asegurarCuentaPortal(guardian: GuardianDocument, session: ClientSession): Promise<CuentaPortal> {
  const existente = await User.findOne({ numero_documento: guardian.numero_documento }).session(session);
  if (existente) {
    if (existente.rol !== ROLES.ACUDIENTE) {
      throw new ApiError(
        409,
        `El documento ${guardian.numero_documento} ya pertenece a un usuario con rol ${existente.rol}; no se puede habilitar como acudiente.`
      );
    }
    return { usuarioId: existente._id, creada: false };
  }

  if (!guardian.email) {
    throw new ApiError(400, 'Para habilitar el acceso al portal el acudiente debe tener un correo registrado.');
  }
  if (await User.exists({ email: guardian.email }).session(session)) {
    throw new ApiError(409, 'Ya existe un usuario con ese correo; usa otro correo para el acudiente.');
  }

  const usuario = new User({
    nombre: guardian.nombre,
    apellido: guardian.apellido,
    tipo_documento: guardian.tipo_documento,
    numero_documento: guardian.numero_documento,
    email: guardian.email,
    telefono: guardian.telefono_principal,
    rol: ROLES.ACUDIENTE,
    debe_cambiar_password: true,
  });
  usuario.password = guardian.numero_documento;
  await usuario.save({ session });
  return { usuarioId: usuario._id, creada: true };
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
  input: VincularAcudienteInput,
  { usuarioId, ip }: ContextoActor
): Promise<StudentGuardianDocument> {
  await obtenerEstudiante(studentId);

  // Una sola transacción: si falla la cuenta de portal no queda un acudiente (ni vínculo) huérfano.
  const { relacion, guardian, cuenta } = await runTransaction(async (session) => {
    let guardian: GuardianDocument | null;
    if (input.guardian_id) {
      guardian = await Guardian.findById(input.guardian_id).session(session);
      if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
    } else {
      if (!input.tipo_documento || !input.numero_documento || !input.nombre || !input.apellido || !input.telefono_principal) {
        throw new ApiError(400, 'Faltan datos para registrar un acudiente nuevo.');
      }
      guardian = await Guardian.findOne({ numero_documento: input.numero_documento }).session(session);
      if (!guardian) {
        const creados = await Guardian.create(
          [
            {
              tipo_documento: input.tipo_documento,
              numero_documento: input.numero_documento,
              nombre: input.nombre,
              apellido: input.apellido,
              telefono_principal: input.telefono_principal,
              telefono_secundario: input.telefono_secundario,
              email: input.email,
              ocupacion: input.ocupacion,
              direccion: input.direccion,
            },
          ],
          { session }
        );
        guardian = creados[0]!;
      }
    }

    const yaVinculado = await StudentGuardian.findOne({ student_id: studentId, guardian_id: guardian!._id }).session(session);
    if (yaVinculado) throw new ApiError(409, 'Este acudiente ya esta vinculado a este estudiante.');

    let cuenta: CuentaPortal | null = null;
    if (input.habilitar_portal && !guardian!.user_id) {
      cuenta = await asegurarCuentaPortal(guardian!, session);
      guardian!.user_id = cuenta.usuarioId;
      await guardian!.save({ session });
    }

    if (input.es_principal) {
      await StudentGuardian.updateMany({ student_id: studentId }, { $set: { es_principal: false } }, { session });
    }

    const [relacion] = await StudentGuardian.create(
      [
        {
          student_id: studentId,
          guardian_id: guardian!._id,
          parentesco: input.parentesco,
          es_principal: Boolean(input.es_principal),
          autorizado_retiro: input.autorizado_retiro ?? true,
        },
      ],
      { session }
    );

    return { relacion: relacion!, guardian: guardian!, cuenta };
  });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_VINCULADO',
    entidad: 'StudentGuardian',
    entidad_id: relacion._id,
    detalle: `Acudiente ${guardian.nombre} ${guardian.apellido} (${input.parentesco}) vinculado al estudiante ${studentId}${input.es_principal ? ' como principal' : ''}.`,
    ip,
  });

  if (cuenta) {
    await registrarEvento({
      usuario_id: usuarioId,
      accion: 'ACUDIENTE_PORTAL_HABILITADO',
      entidad: 'Guardian',
      entidad_id: guardian._id,
      detalle: `Acceso al portal de ${guardian.nombre} ${guardian.apellido}: ${cuenta.creada ? 'cuenta creada' : 'cuenta existente reutilizada'}.`,
      ip,
    });
    if (cuenta.creada) {
      await registrarEvento({
        usuario_id: usuarioId,
        accion: 'USUARIO_CREADO',
        entidad: 'User',
        entidad_id: cuenta.usuarioId,
        detalle: `${guardian.nombre} ${guardian.apellido} (${ROLES.ACUDIENTE}) — desde M03`,
        ip,
      });
    }
  }

  return relacion;
}

export async function actualizarVinculo(
  relationId: string,
  patch: { parentesco?: Parentesco; es_principal?: boolean; autorizado_retiro?: boolean },
  { usuarioId, ip }: ContextoActor
): Promise<StudentGuardianDocument> {
  const relacion = await StudentGuardian.findById(relationId);
  if (!relacion) throw new ApiError(404, 'Vinculo acudiente-estudiante no encontrado.');

  if (patch.es_principal) await asegurarUnicoPrincipal(String(relacion.student_id), relacion._id);

  Object.assign(relacion, patch);
  await relacion.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_VINCULO_ACTUALIZADO',
    entidad: 'StudentGuardian',
    entidad_id: relacion._id,
    detalle: Object.keys(patch).join(', '),
    ip,
  });

  return relacion;
}

/**
 * Si el vinculo que se desvincula es el principal (responsable legal: firma matricula, recibe
 * citaciones, habilita el portal M27), exige reasignar la principalidad a otro acudiente antes
 * — salvo que sea el unico acudiente del estudiante, caso en que se permite (correccion de datos).
 */
export async function desvincularAcudiente(relationId: string, { usuarioId, ip }: ContextoActor): Promise<void> {
  const relacion = await StudentGuardian.findById(relationId).populate('guardian_id', 'nombre apellido');
  if (!relacion) throw new ApiError(404, 'Vinculo acudiente-estudiante no encontrado.');

  if (relacion.es_principal) {
    const otrosAcudientes = await StudentGuardian.countDocuments({
      student_id: relacion.student_id,
      _id: { $ne: relacion._id },
    });
    if (otrosAcudientes > 0) {
      throw new ApiError(
        409,
        'Este acudiente es el principal del estudiante: marca a otro acudiente como principal antes de desvincularlo.'
      );
    }
  }

  await StudentGuardian.deleteOne({ _id: relacion._id });

  const guardian = relacion.guardian_id as unknown as { nombre: string; apellido: string } | null;
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_DESVINCULADO',
    entidad: 'StudentGuardian',
    entidad_id: relacion._id,
    detalle: `Acudiente ${guardian?.nombre ?? ''} ${guardian?.apellido ?? ''} desvinculado del estudiante ${relacion.student_id}.`,
    ip,
  });
}

export async function actualizarAcudiente(
  guardianId: string,
  patch: Partial<DatosNuevoAcudiente>,
  { usuarioId, ip }: ContextoActor
): Promise<GuardianDocument> {
  const guardian = await Guardian.findById(guardianId);
  if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  Object.assign(guardian, patch);
  await guardian.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_ACTUALIZADO',
    entidad: 'Guardian',
    entidad_id: guardian._id,
    detalle: Object.keys(patch).join(', '),
    ip,
  });

  return guardian;
}

export async function actualizarEstadoAcudiente(
  guardianId: string,
  estado: 'activo' | 'inactivo',
  { usuarioId, ip }: ContextoActor
): Promise<GuardianDocument> {
  const guardian = await Guardian.findById(guardianId);
  if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  guardian.estado = estado;
  await guardian.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_ESTADO_CAMBIADO',
    entidad: 'Guardian',
    entidad_id: guardian._id,
    detalle: `${guardian.nombre} ${guardian.apellido} → ${estado}`,
    ip,
  });

  return guardian;
}
