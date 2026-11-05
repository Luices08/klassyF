import { ClientSession, Types } from 'mongoose';
import { Parentesco, TipoDocumento } from '../constants/enums';
import Guardian, { GuardianDocument } from '../models/guardian.model';
import StudentGuardian, { StudentGuardianDocument } from '../models/studentGuardian.model';
import User from '../models/user.model';
import { ROLES } from '../constants/roles';
import ApiError from '../utils/ApiError';
import { concederRolAcudiente } from '../utils/concederRolAcudiente';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';

export interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
  /** Perfiles de quien actúa: solo `actualizarAcudiente` los lee, para decidir si puede corregir el documento. */
  roles?: readonly string[];
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
 * Dato único: si ya hay un `User` con ese documento se reutiliza, nunca se duplica. Si ya es personal del colegio
 * se le agrega el rol ACUDIENTE (`concederRolAcudiente`) y elige perfil al iniciar sesión.
 * La contraseña temporal es el número de documento (decisión de producto); `debe_cambiar_password`
 * obliga a cambiarla en el primer ingreso.
 */
async function asegurarCuentaPortal(guardian: GuardianDocument, session: ClientSession, { aliasSiElCorreoEstaEnUso = false }: { aliasSiElCorreoEstaEnUso?: boolean } = {}): Promise<CuentaPortal> {
  const existente = await User.findOne({ numero_documento: guardian.numero_documento }).session(session);
  if (existente) {
    await concederRolAcudiente(existente, session);
    return { usuarioId: existente._id, creada: false };
  }

  if (!guardian.email) {
    throw new ApiError(400, 'Para habilitar el acceso al portal el acudiente debe tener un correo registrado.');
  }
  // El correo del acudiente suele estar ya en uso por el primer hijo que se admitió con él: automáticamente se usa un alias («+documento») que llega al mismo buzón.
  let email = guardian.email;
  if (await User.exists({ email }).session(session)) {
    if (!aliasSiElCorreoEstaEnUso) throw new ApiError(409, 'Ya existe un usuario con ese correo; usa otro correo para el acudiente.');
    const [local, dominio] = email.split('@');
    email = `${local}+${guardian.numero_documento}@${dominio}`;
    if (await User.exists({ email }).session(session)) throw new ApiError(409, 'Ya existe un usuario con ese correo; usa otro correo para el acudiente.');
  }

  const usuario = new User({
    nombre: guardian.nombre,
    apellido: guardian.apellido,
    tipo_documento: guardian.tipo_documento,
    numero_documento: guardian.numero_documento,
    email,
    telefono: guardian.telefono_principal,
    roles: [ROLES.ACUDIENTE],
    debe_cambiar_password: true,
  });
  usuario.password = guardian.numero_documento;
  await usuario.save({ session });
  return { usuarioId: usuario._id, creada: true };
}

export interface ResultadoHabilitacionAutomatica {
  habilitados: number;
  /** Acudientes a los que no se les pudo abrir la cuenta y por qué (falta el documento o el correo, es estudiante, etc.). */
  omitidos: Array<{ acudiente: string; motivo: string }>;
}

/**
 * Cuando la matrícula de un estudiante queda confirmada (condicional o definitiva) se abre la cuenta del portal de su acudiente principal: el acudiente
 * entra a la plataforma con la matrícula confirmada, no antes. Usa el número de documento como contraseña temporal (se cambia al primer ingreso).
 * Es idempotente y nunca rompe la matrícula: a quien no se le puede abrir (documento provisional «TEL-…», sin correo, es estudiante) se le anota el motivo
 * y secretaría lo resuelve en la ficha del estudiante.
 */
export async function habilitarPortalDeAcudientesDe(studentId: string | Types.ObjectId, { usuarioId, ip }: ContextoActor): Promise<ResultadoHabilitacionAutomatica> {
  const vinculos = await StudentGuardian.find({ student_id: studentId }).populate<{ guardian_id: GuardianDocument | null }>('guardian_id');
  const principales = vinculos.filter((v) => v.es_principal);
  const resultado: ResultadoHabilitacionAutomatica = { habilitados: 0, omitidos: [] };

  for (const vinculo of principales.length > 0 ? principales : vinculos.slice(0, 1)) {
    const guardian = vinculo.guardian_id;
    if (!guardian || guardian.user_id) continue;
    const nombre = `${guardian.nombre} ${guardian.apellido}`;
    if (guardian.numero_documento.startsWith('TEL-')) {
      resultado.omitidos.push({ acudiente: nombre, motivo: 'Falta su documento de identidad: la ficha tiene solo el teléfono.' });
      continue;
    }
    try {
      const cuenta = await runTransaction(async (session) => {
        const fresco = await Guardian.findById(guardian._id).session(session);
        if (!fresco || fresco.user_id) return null;
        const c = await asegurarCuentaPortal(fresco, session, { aliasSiElCorreoEstaEnUso: true });
        fresco.user_id = c.usuarioId;
        await fresco.save({ session });
        return c;
      });
      if (!cuenta) continue;
      resultado.habilitados += 1;
      await registrarEvento({
        usuario_id: usuarioId,
        accion: 'ACUDIENTE_PORTAL_HABILITADO',
        entidad: 'Guardian',
        entidad_id: guardian._id,
        detalle: `Acceso al portal de ${nombre} al confirmarse la matrícula del estudiante ${String(studentId)}: ${cuenta.creada ? 'cuenta creada' : 'cuenta existente reutilizada'}.`,
        ip,
      });
    } catch (err) {
      resultado.omitidos.push({ acudiente: nombre, motivo: err instanceof ApiError ? err.message : 'No se pudo abrir la cuenta.' });
    }
  }
  return resultado;
}

async function obtenerEstudiante(studentId: string) {
  const student = await User.findOne({ _id: studentId, roles: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');
  return student;
}

/** Si `es_principal` es true, quita el flag a cualquier otro acudiente del mismo estudiante. */
async function asegurarUnicoPrincipal(studentId: string | Types.ObjectId, exceptoRelacionId?: Types.ObjectId | string): Promise<void> {
  const sId = typeof studentId === 'string' ? new Types.ObjectId(studentId) : studentId;
  const excId = exceptoRelacionId
    ? (typeof exceptoRelacionId === 'string' ? new Types.ObjectId(exceptoRelacionId) : exceptoRelacionId)
    : undefined;

  await StudentGuardian.updateMany(
    { student_id: sId, ...(excId ? { _id: { $ne: excId } } : {}) },
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
      await StudentGuardian.updateMany(
        { student_id: new Types.ObjectId(studentId) },
        { $set: { es_principal: false } },
        { session }
      );
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
  patch: { parentesco?: Parentesco; es_principal?: boolean; autorizado_retiro?: boolean; habilitar_portal?: boolean },
  { usuarioId, ip }: ContextoActor
): Promise<StudentGuardianDocument> {
  const relacion = await StudentGuardian.findById(relationId);
  if (!relacion) throw new ApiError(404, 'Vinculo acudiente-estudiante no encontrado.');

  if (patch.es_principal) await asegurarUnicoPrincipal(String(relacion.student_id), relacion._id);

  if (patch.habilitar_portal) {
    const guardian = await Guardian.findById(relacion.guardian_id);
    if (guardian && !guardian.user_id) {
      await runTransaction(async (session) => {
        const cuenta = await asegurarCuentaPortal(guardian, session);
        guardian.user_id = cuenta.usuarioId;
        await guardian.save({ session });
      });
    }
  }

  const { habilitar_portal: _, ...datosRelacion } = patch;
  Object.assign(relacion, datosRelacion);
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

const PUEDEN_CORREGIR_DOCUMENTO: string[] = [ROLES.ADMIN, ROLES.SECRETARIA];

/**
 * Corregir el documento de un acudiente (un error de digitación) cambia también el usuario de su cuenta del portal, porque entra con ese número.
 * Si esa cuenta es además de personal del colegio no se toca desde aquí: cambiaría el acceso de un docente o directivo.
 */
async function corregirDocumento(guardian: GuardianDocument, patch: Partial<DatosNuevoAcudiente>, actor: ContextoActor): Promise<boolean> {
  const numero = patch.numero_documento?.trim().toUpperCase();
  const tipo = patch.tipo_documento;
  const cambiaNumero = numero !== undefined && numero !== guardian.numero_documento;
  const cambiaTipo = tipo !== undefined && tipo !== guardian.tipo_documento;
  if (!cambiaNumero && !cambiaTipo) {
    delete patch.numero_documento;
    delete patch.tipo_documento;
    return false;
  }
  if (!actor.roles?.some((r) => PUEDEN_CORREGIR_DOCUMENTO.includes(r))) {
    throw new ApiError(403, 'Solo el administrador y la secretaría pueden corregir el documento de un acudiente.');
  }
  if (cambiaNumero) {
    if (await Guardian.exists({ numero_documento: numero, _id: { $ne: guardian._id } })) {
      throw new ApiError(409, 'Ya existe otro acudiente con ese número de documento. Si es la misma persona, vincula a ese acudiente en lugar de cambiar este.');
    }
    if (await User.exists({ numero_documento: numero, _id: { $ne: guardian.user_id } })) {
      throw new ApiError(409, 'Ese número de documento ya pertenece a otra persona del sistema.');
    }
  }

  await runTransaction(async (session) => {
    if (guardian.user_id) {
      const cuenta = await User.findById(guardian.user_id).session(session);
      if (cuenta) {
        if (cuenta.roles.some((r) => r !== ROLES.ACUDIENTE)) {
          throw new ApiError(409, 'Este acudiente también es personal del colegio: su documento se corrige desde Usuarios, porque cambia su acceso.');
        }
        if (cambiaNumero) cuenta.numero_documento = numero!;
        if (cambiaTipo) cuenta.tipo_documento = tipo!;
        await cuenta.save({ session });
      }
    }
    if (cambiaNumero) guardian.numero_documento = numero!;
    if (cambiaTipo) guardian.tipo_documento = tipo!;
    await guardian.save({ session });
  });
  delete patch.numero_documento;
  delete patch.tipo_documento;
  return true;
}

export async function actualizarAcudiente(
  guardianId: string,
  patch: Partial<DatosNuevoAcudiente>,
  actor: ContextoActor
): Promise<GuardianDocument> {
  const { usuarioId, ip } = actor;
  const guardian = await Guardian.findById(guardianId);
  if (!guardian) throw new ApiError(404, 'Acudiente no encontrado.');
  const campos = Object.keys(patch);
  const corrigioDocumento = await corregirDocumento(guardian, patch, actor);
  Object.assign(guardian, patch);
  await guardian.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ACUDIENTE_ACTUALIZADO',
    entidad: 'Guardian',
    entidad_id: guardian._id,
    detalle: `${campos.join(', ')}${corrigioDocumento ? ' (se corrigió el documento)' : ''}`,
    ip,
  });

  return guardian;
}

export interface HijoDeAcudiente {
  vinculo_id: string;
  estudiante_id: string;
  nombre: string;
  documento: string;
  parentesco: Parentesco;
  es_principal: boolean;
}

/** Los estudiantes a cargo de un acudiente: así se ve si es responsable de varios hermanos sin buscarlos uno por uno. */
export async function estudiantesDeAcudiente(guardianId: string): Promise<HijoDeAcudiente[]> {
  if (!Types.ObjectId.isValid(guardianId) || !(await Guardian.exists({ _id: guardianId }))) throw new ApiError(404, 'Acudiente no encontrado.');
  const vinculos = await StudentGuardian.find({ guardian_id: guardianId }).populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>(
    'student_id',
    'nombre apellido numero_documento'
  );
  return vinculos
    .filter((v) => v.student_id)
    .map((v) => ({
      vinculo_id: String(v._id),
      estudiante_id: String(v.student_id!._id),
      nombre: `${v.student_id!.apellido} ${v.student_id!.nombre}`,
      documento: v.student_id!.numero_documento,
      parentesco: v.parentesco,
      es_principal: v.es_principal,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
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
