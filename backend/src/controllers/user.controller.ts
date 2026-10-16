import { ParamsDictionary } from 'express-serve-static-core';
import { FilterQuery, Types } from 'mongoose';
import { EstadoUsuario, Rol, TIPOS_DOCUMENTO, TipoDocumento } from '../constants/enums';
import { ROLES, ROLES_ADICIONALES_PERMITIDOS, ROLES_LIST, ROLES_STAFF, puedeGestionarRol, puedeGestionarRoles } from '../constants/roles';
import ActivitySubmission from '../models/activitySubmission.model';
import AdmissionRequest from '../models/admissionRequest.model';
import LiderArea from '../models/liderArea.model';
import Attendance from '../models/attendance.model';
import Campus from '../models/campus.model';
import DocumentoReferencia from '../models/documentoReferencia.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import Institution from '../models/institution.model';
import PeriodoProrroga from '../models/periodoProrroga.model';
import PlanArea from '../models/planArea.model';
import PlanAula from '../models/planAula.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { IUser } from '../models/user.model';
import { registrarEvento } from '../services/audit.service';
import { generateToken } from '../services/token.service';
import { filtroPorEstado } from '../utils/filtroEstado';
import { leerCsv } from '../utils/csv';
import { generarPasswordTemporal } from '../utils/generarPasswordTemporal';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

// La jerarquía institucional (puedeGestionarRol de ../constants/roles)
// rige todas las acciones: ningún rol puede crear, editar, cambiar estado,
// resetear clave ni eliminar a roles de rango igual o superior.

async function exigirSedesExistentes(ids: string[] | undefined): Promise<void> {
  if (!ids || ids.length === 0) return;
  const existentes = await Campus.countDocuments({ _id: { $in: ids } });
  if (existentes !== new Set(ids).size) throw new ApiError(400, 'Una o más sedes indicadas no existen.');
}

interface CreateUserBody {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  telefono?: string;
  password: string;
  /** Un solo rol (forma anterior) o varios: la persona escoge con cuál entrar al iniciar sesión. */
  rol?: Rol;
  roles?: Rol[];
  estado?: EstadoUsuario;
  sedes_ids?: string[];
}

/**
 * Roles que esta vista puede asignar: al menos uno de personal; ACUDIENTE solo como adicional (el acudiente "puro" y el
 * estudiante nacen en el módulo escolar). Quien opera debe poder gestionar cada uno.
 */
function validarRolesAsignables(operador: Rol, roles: Rol[]): void {
  if (new Set(roles).size !== roles.length) throw new ApiError(400, 'Hay roles repetidos.');
  if (roles.includes(ROLES.ESTUDIANTE)) {
    throw new ApiError(400, 'Los estudiantes no se crean ni se combinan con otros roles desde esta vista. Se gestionan desde el módulo escolar (Estudiantes y Matrículas).');
  }
  if (!roles.some((r) => ROLES_STAFF.includes(r))) {
    throw new ApiError(
      400,
      'Los acudientes no se crean desde esta vista. Se gestionan desde el módulo escolar; aquí solo se le agrega el rol ACUDIENTE a alguien del personal.'
    );
  }
  const noPermitido = roles.find((r) => !ROLES_STAFF.includes(r) && !ROLES_ADICIONALES_PERMITIDOS.includes(r));
  if (noPermitido) throw new ApiError(400, `El rol ${noPermitido} no se asigna desde esta vista.`);
  const sinPermiso = roles.find((r) => !puedeGestionarRol(operador, r));
  if (sinPermiso) throw new ApiError(403, `Tu rol (${operador}) no tiene permisos para asignar el rol ${sinPermiso}.`);
}

export const createUser = catchAsync<unknown, unknown, CreateUserBody>(async (req, res) => {
  const roles = req.body.roles ?? (req.body.rol ? [req.body.rol] : []);
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  validarRolesAsignables(req.user.rol, roles);
  await exigirSedesExistentes(req.body.sedes_ids);

  // Una persona, un solo registro: si el documento ya existe se le agrega el rol, no se crea otro usuario.
  const existente = await User.findOne({ numero_documento: req.body.numero_documento }).select('nombre apellido roles');
  if (existente) {
    throw new ApiError(
      409,
      `Ya existe un usuario con ese documento (${existente.nombre} ${existente.apellido}, ${existente.roles.join(' + ')}). Edítalo y agrégale el rol en lugar de crear otro registro.`
    );
  }

  const { password, rol: _rol, roles: _roles, ...rest } = req.body;
  const user = new User({ ...rest, roles, debe_cambiar_password: true });
  user.password = password;
  await user.save();

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_CREADO',
    entidad: 'User',
    entidad_id: user._id,
    detalle: `${user.nombre} ${user.apellido} (${user.roles.join(', ')})`,
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: user });
});

interface ListUsersQuery {
  rol?: Rol | string;
  roles?: string | string[];
  estado?: EstadoUsuario;
  sede_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const listUsers = catchAsync<unknown, unknown, unknown, ListUsersQuery>(async (req, res) => {
  const filter: FilterQuery<IUser> = {};
  const rawRoles = req.query.roles || req.query.rol;
  if (rawRoles) {
    const rolesList = (
      Array.isArray(rawRoles)
        ? rawRoles
        : typeof rawRoles === 'string'
        ? rawRoles.split(',')
        : [rawRoles]
    )
      .map((r) => r.trim())
      .filter((r): r is Rol => (ROLES_LIST as readonly string[]).includes(r));

    // `roles` es un arreglo: coincide si la persona tiene alguno de los pedidos.
    if (rolesList.length === 1) {
      filter.roles = rolesList[0];
    } else if (rolesList.length > 1) {
      filter.roles = { $in: rolesList };
    }
  }
  if (req.query.estado) filter.estado = filtroPorEstado(req.query.estado);
  if (req.query.sede_id) filter.sedes_ids = req.query.sede_id;
  if (req.query.search) {
    const regex = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }, { email: regex }];
  }

  // La paginacion es opt-in (solo si viene page o limit) para no romper a los
  // consumidores existentes que esperan el listado completo (ej. selects de
  // estudiante en Matriculas/Boletin, que siguen llamando /users sin paginar).
  const paginar = req.query.page !== undefined || req.query.limit !== undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  let query = User.find(filter).sort({ apellido: 1, nombre: 1 }).populate('sedes_ids', 'nombre');
  if (paginar) query = query.skip((page - 1) * limit).limit(limit);

  const [users, total] = await Promise.all([query, User.countDocuments(filter)]);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    page: paginar ? page : 1,
    pages: paginar ? Math.max(1, Math.ceil(total / limit)) : 1,
    data: users,
  });
});

export const getMe = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: req.user });
});

interface UserParams extends ParamsDictionary {
  id: string;
}

interface UpdateUserBody {
  nombre?: string;
  apellido?: string;
  tipo_documento?: TipoDocumento;
  numero_documento?: string;
  email?: string;
  telefono?: string;
  /** Forma anterior: reemplaza todos los roles por uno. */
  rol?: Rol;
  roles?: Rol[];
  password?: string;
  sedes_ids?: string[];
}

export const updateUser = catchAsync<UserParams, unknown, UpdateUserBody>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'Para editar tus propios datos o tu contraseña, usa la opción en Mi cuenta.');
  }
  if (!req.user || !puedeGestionarRoles(req.user.rol, user.roles)) {
    throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para editar un usuario con rol ${user.roles.join(' + ')}.`);
  }

  const nuevosRoles = req.body.roles ?? (req.body.rol ? [req.body.rol] : undefined);
  if (nuevosRoles) {
    // Un acudiente "puro" (sin rol de personal) se conserva tal cual: su rol lo gestiona el módulo escolar.
    const esAcudientePuro = user.roles.every((r) => r === ROLES.ACUDIENTE || r === ROLES.ESTUDIANTE);
    if (esAcudientePuro) throw new ApiError(400, 'Los roles de estudiantes y acudientes se gestionan desde el módulo escolar.');
    validarRolesAsignables(req.user.rol, nuevosRoles);
    if (user.roles.includes(ROLES.ADMIN) && !nuevosRoles.includes(ROLES.ADMIN) && (await esUnicoAdmin(req.params.id, true))) {
      throw new ApiError(400, 'No puedes quitarle el rol de administrador al único administrador activo del sistema.');
    }
  }
  await exigirSedesExistentes(req.body.sedes_ids);

  const { password, rol: _rol, roles: _roles, ...rest } = req.body;
  Object.assign(user, rest);
  if (nuevosRoles) user.roles = nuevosRoles;
  if (password) {
    user.password = password;
    user.debe_cambiar_password = true;
    user.version_sesion += 1;
  }
  await user.save();

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_ACTUALIZADO',
    entidad: 'User',
    entidad_id: user._id,
    detalle: [...Object.keys(rest), ...(nuevosRoles ? ['roles'] : [])].join(', '),
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: user });
});

/** true si, quitando `excluirId`, no queda ningun otro ADMIN (activo, si `soloActivos`). */
async function esUnicoAdmin(excluirId: string, soloActivos: boolean): Promise<boolean> {
  const filtro: Record<string, unknown> = { roles: ROLES.ADMIN, _id: { $ne: excluirId } };
  if (soloActivos) filtro.estado = 'activo';
  const otrosAdmins = await User.countDocuments(filtro);
  return otrosAdmins === 0;
}

interface ActualizarEstadoBody {
  estado: EstadoUsuario;
  motivo?: string;
}

export const actualizarEstadoUsuario = catchAsync<UserParams, unknown, ActualizarEstadoBody>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'No puedes cambiar el estado de tu propio usuario.');
  }
  if (!req.user || !puedeGestionarRoles(req.user.rol, user.roles)) {
    throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para cambiar el estado de un usuario con rol ${user.roles.join(' + ')}.`);
  }
  if (user.roles.includes(ROLES.ADMIN) && req.body.estado === 'inactivo' && (await esUnicoAdmin(req.params.id, true))) {
    throw new ApiError(400, 'No puedes desactivar al único administrador activo del sistema.');
  }

  user.estado = req.body.estado;
  // Suspender/bloquear (M02) se modela como 'inactivo' + motivo en la bitacora
  // (ver CLAUDE.md: no se duplica el enum activo/inactivo compartido con Sede/Grado/Institucion).
  if (req.body.estado === 'inactivo') user.version_sesion += 1;
  await user.save();

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_ESTADO_CAMBIADO',
    entidad: 'User',
    entidad_id: user._id,
    detalle: `Nuevo estado: ${req.body.estado}${req.body.motivo ? ` — motivo: ${req.body.motivo}` : ''}`,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: user });
});

/** Colecciones que representan "acciones registradas" (M02): si alguna referencia al usuario, no se puede borrar fisicamente. */
async function tieneHistorial(userId: string): Promise<boolean> {
  // El acudiente (M03) es una entidad propia (Guardian): si este User tiene un
  // Guardian vinculado con al menos un estudiante, tambien cuenta como historial.
  const guardian = await Guardian.findOne({ user_id: userId });
  const vinculosComoAcudiente = guardian ? await StudentGuardian.countDocuments({ guardian_id: guardian._id }) : 0;

  const conteos = await Promise.all([
    Enrollment.countDocuments({ student_id: userId }),
    Enrollment.countDocuments({ 'checklist.revisado_por': userId }),
    Attendance.countDocuments({ 'registros.student_id': userId }),
    ActivitySubmission.countDocuments({ $or: [{ student_id: userId }, { docente_id: userId }] }),
    TeacherAssignment.countDocuments({ docente_id: userId }),
    StudentProfile.countDocuments({ $or: [{ user_id: userId }, { registrado_por_id: userId }] }),
    Group.countDocuments({ director_grupo_id: userId }),
    // M07: líder de un área, planes radicados o revisados y documentos de apoyo cargados.
    LiderArea.countDocuments({ docente_id: userId }),
    PlanArea.countDocuments({ $or: [{ 'versiones.subido_por': userId }, { 'revisiones.revisor_id': userId }] }),
    PlanAula.countDocuments({ $or: [{ docente_id: userId }, { 'versiones.subido_por': userId }, { 'revisiones.revisor_id': userId }] }),
    DocumentoReferencia.countDocuments({ subido_por: userId }),
    Institution.countDocuments({ administrador_id: userId }),
    PeriodoProrroga.countDocuments({ $or: [{ docente_id: userId }, { otorgada_por_id: userId }, { revocada_por_id: userId }] }),
    AdmissionRequest.countDocuments({ revisado_por: userId }),
  ]);
  return vinculosComoAcudiente > 0 || conteos.some((c) => c > 0);
}

export const eliminarUsuario = catchAsync<UserParams>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'No puedes eliminar tu propio usuario.');
  }
  if (!req.user || !puedeGestionarRoles(req.user.rol, user.roles)) {
    throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para eliminar a un usuario con rol ${user.roles.join(' + ')}.`);
  }
  if (user.roles.includes(ROLES.ADMIN) && (await esUnicoAdmin(req.params.id, false))) {
    throw new ApiError(400, 'No puedes eliminar al único administrador del sistema.');
  }

  if (await tieneHistorial(req.params.id)) {
    await registrarEvento({
      usuario_id: req.user?._id,
      accion: 'USUARIO_ELIMINACION_BLOQUEADA',
      entidad: 'User',
      entidad_id: user._id,
      ip: req.ip,
    });
    throw new ApiError(
      400,
      'No se puede eliminar: el usuario ya tiene historial registrado (matrículas, asistencia, notas o asignaciones). Use inactivar en su lugar.'
    );
  }

  await User.deleteOne({ _id: user._id });

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_ELIMINADO',
    entidad: 'User',
    entidad_id: user._id,
    detalle: `${user.nombre} ${user.apellido}`,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: null });
});

export const resetearPassword = catchAsync<UserParams>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'Para cambiar tu propia contraseña, usa la opción en Mi cuenta.');
  }
  if (!req.user || !puedeGestionarRoles(req.user.rol, user.roles)) {
    throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para resetear la contraseña de un usuario con rol ${user.roles.join(' + ')}.`);
  }

  const passwordTemporal = generarPasswordTemporal();
  user.password = passwordTemporal;
  user.debe_cambiar_password = true;
  user.intentos_fallidos = 0;
  user.bloqueado_hasta = null;
  user.version_sesion += 1;
  await user.save();

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'PASSWORD_RESETEADA',
    entidad: 'User',
    entidad_id: user._id,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: { password_temporal: passwordTemporal } });
});

export const cerrarSesiones = catchAsync<UserParams>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'No puedes cerrar tus propias sesiones desde aquí.');
  }
  if (!req.user || !puedeGestionarRoles(req.user.rol, user.roles)) {
    throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para cerrar las sesiones de un usuario con rol ${user.roles.join(' + ')}.`);
  }

  user.version_sesion += 1;
  await user.save();

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'SESIONES_CERRADAS',
    entidad: 'User',
    entidad_id: user._id,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: null });
});

interface ActualizarMiPerfilBody {
  telefono?: string;
  foto_url?: string | null;
}

export const actualizarMiPerfil = catchAsync<unknown, unknown, ActualizarMiPerfilBody>(async (req, res) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (req.body.telefono !== undefined) user.telefono = req.body.telefono;
  if (req.body.foto_url !== undefined) user.foto_url = req.body.foto_url;
  await user.save();

  res.status(200).json({ success: true, data: user });
});

interface CambiarMiPasswordBody {
  password_actual: string;
  password_nueva: string;
}

export const cambiarMiPassword = catchAsync<unknown, unknown, CambiarMiPasswordBody>(async (req, res) => {
  const user = await User.findById(req.user!._id).select('+password_hash');
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  const passwordOk = await user.comparePassword(req.body.password_actual);
  if (!passwordOk) throw new ApiError(401, 'La contraseña actual no es correcta.');

  user.password = req.body.password_nueva;
  user.debe_cambiar_password = false;
  user.version_sesion += 1;
  await user.save();

  await registrarEvento({
    usuario_id: user._id,
    accion: 'PASSWORD_CAMBIADA',
    entidad: 'User',
    entidad_id: user._id,
    ip: req.ip,
  });

  const token = generateToken(user, req.user!.rol);

  res.status(200).json({ success: true, data: { token } });
});

interface FilaImportacionError {
  fila: number;
  numero_documento?: string;
  motivo: string;
}

const COLUMNAS_OBLIGATORIAS_USUARIOS = ['tipo_documento', 'numero_documento', 'nombre', 'apellido', 'email', 'rol'];

/**
 * Carga masiva (M02): CSV con encabezado tipo_documento,numero_documento,nombre,apellido,email,rol,telefono,sedes_codigos.
 * Separador coma o punto y coma (se detecta); varias sedes en "sedes_codigos" se separan con | (o ; / , si la celda va entre comillas).
 */
export const bulkImportUsers = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo CSV en el campo "file".');

  const { registros } = leerCsv(file.buffer, COLUMNAS_OBLIGATORIAS_USUARIOS);
  if (registros.length === 0) throw new ApiError(400, 'El archivo no tiene filas de datos.');

  const errores: FilaImportacionError[] = [];
  let creados = 0;

  for (let i = 0; i < registros.length; i++) {
    const fila = i + 2; // +1 por el encabezado, +1 porque las filas se cuentan desde 1
    const registro = registros[i]!;
    const numeroDocumento = registro.numero_documento;

    try {
      if (!registro.tipo_documento || !numeroDocumento || !registro.nombre || !registro.apellido || !registro.email || !registro.rol) {
        throw new ApiError(400, 'Faltan columnas obligatorias (tipo_documento, numero_documento, nombre, apellido, email, rol).');
      }
      // Excel suele dejar "cc" o "docente" en minusculas: se toleran, pero el valor debe existir.
      const tipoDocumento = registro.tipo_documento.toUpperCase();
      const rol = registro.rol.toUpperCase();
      if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipoDocumento)) {
        throw new ApiError(400, `tipo_documento "${registro.tipo_documento}" no es valido. Usa: ${TIPOS_DOCUMENTO.join(', ')}.`);
      }
      if (!(ROLES as Record<string, string>)[rol]) {
        throw new ApiError(400, `Rol "${registro.rol}" no es valido. Usa: ${ROLES_LIST.join(', ')}.`);
      }
      if (rol === ROLES.ESTUDIANTE || rol === ROLES.ACUDIENTE) {
        throw new ApiError(
          400,
          `El rol ${rol} no se importa desde Usuarios. Usa la carga masiva en el módulo de Estudiantes.`
        );
      }
      if (!req.user || !puedeGestionarRol(req.user.rol, rol as Rol)) {
        throw new ApiError(403, `Tu rol (${req.user?.rol}) no tiene permisos para importar usuarios con rol ${rol}.`);
      }

      let sedesIds: Types.ObjectId[] = [];
      if (registro.sedes_codigos) {
        const codigos = registro.sedes_codigos.split(/[;|,]/).map((c) => c.trim()).filter(Boolean);
        const sedes = await Campus.find({ codigo_dane_sede: { $in: codigos } });
        if (sedes.length !== codigos.length) {
          throw new ApiError(400, 'Uno o mas codigos de sede en "sedes_codigos" no existen.');
        }
        sedesIds = sedes.map((s) => s._id);
      }

      const user = new User({
        nombre: registro.nombre,
        apellido: registro.apellido,
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento,
        email: registro.email,
        telefono: registro.telefono || undefined,
        roles: [rol as Rol],
        sedes_ids: sedesIds,
        debe_cambiar_password: true,
      });
      user.password = generarPasswordTemporal();
      await user.save();
      creados += 1;
    } catch (err) {
      const motivo =
        err instanceof ApiError
          ? err.message
          : (err as { code?: number }).code === 11000
            ? 'El numero de documento o el correo ya estan registrados.'
            : 'No se pudo crear el usuario.';
      errores.push({ fila, numero_documento: numeroDocumento, motivo });
    }
  }

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIOS_IMPORTADOS',
    entidad: 'User',
    detalle: `${creados} creados, ${errores.length} con error de ${registros.length} filas`,
    ip: req.ip,
  });

  res.status(200).json({
    success: true,
    data: { total_filas: registros.length, creados, fallidos: errores.length, errores },
  });
});
