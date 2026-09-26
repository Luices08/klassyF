import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoUsuario, Rol, TipoDocumento } from '../constants/enums';
import { ROLES } from '../constants/roles';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

// Un solo rol de maximo privilegio (ADMIN) desde que se quito SUPERADMIN: solo un
// ADMIN puede crear, editar o degradar/eliminar a otro ADMIN — un COORDINADOR o
// SECRETARIA no debe poder tocar una cuenta de administrador.
const ROLES_RESTRINGIDOS: Rol[] = [ROLES.ADMIN];

interface CreateUserBody {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  password: string;
  rol: Rol;
  estado?: EstadoUsuario;
}

export const createUser = catchAsync<unknown, unknown, CreateUserBody>(async (req, res) => {
  if (ROLES_RESTRINGIDOS.includes(req.body.rol) && req.user?.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un ADMIN puede crear usuarios con rol ADMIN.');
  }

  const { password, ...rest } = req.body;
  const user = new User(rest);
  user.password = password;
  await user.save();

  res.status(201).json({ success: true, data: user });
});

interface ListUsersQuery {
  rol?: Rol;
  estado?: EstadoUsuario;
}

export const listUsers = catchAsync<unknown, unknown, unknown, ListUsersQuery>(async (req, res) => {
  const filter: Partial<Record<'rol' | 'estado', string>> = {};
  if (req.query.rol) filter.rol = req.query.rol;
  if (req.query.estado) filter.estado = req.query.estado;

  const users = await User.find(filter).sort({ apellido: 1, nombre: 1 });

  res.status(200).json({ success: true, count: users.length, data: users });
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
  rol?: Rol;
  password?: string;
}

export const updateUser = catchAsync<UserParams, unknown, UpdateUserBody>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  const esOAsignaRolRestringido =
    ROLES_RESTRINGIDOS.includes(user.rol) || (req.body.rol && ROLES_RESTRINGIDOS.includes(req.body.rol));
  if (esOAsignaRolRestringido && req.user?.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un ADMIN puede editar una cuenta ADMIN o asignar el rol ADMIN.');
  }

  const { password, ...rest } = req.body;
  Object.assign(user, rest);
  if (password) user.password = password;
  await user.save();

  res.status(200).json({ success: true, data: user });
});

/** true si, quitando `excluirId`, no queda ningun otro ADMIN (activo, si `soloActivos`). */
async function esUnicoAdmin(excluirId: string, soloActivos: boolean): Promise<boolean> {
  const filtro: Record<string, unknown> = { rol: ROLES.ADMIN, _id: { $ne: excluirId } };
  if (soloActivos) filtro.estado = 'activo';
  const otrosAdmins = await User.countDocuments(filtro);
  return otrosAdmins === 0;
}

interface ActualizarEstadoBody {
  estado: EstadoUsuario;
}

export const actualizarEstadoUsuario = catchAsync<UserParams, unknown, ActualizarEstadoBody>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'No puedes cambiar el estado de tu propio usuario.');
  }
  if (user.rol === ROLES.ADMIN && req.user?.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un ADMIN puede cambiar el estado de una cuenta ADMIN.');
  }
  if (user.rol === ROLES.ADMIN && req.body.estado === 'inactivo' && (await esUnicoAdmin(req.params.id, true))) {
    throw new ApiError(400, 'No puedes desactivar al único administrador activo del sistema.');
  }

  user.estado = req.body.estado;
  await user.save();

  res.status(200).json({ success: true, data: user });
});

export const eliminarUsuario = catchAsync<UserParams>(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado.');

  if (String(user._id) === String(req.user?._id)) {
    throw new ApiError(400, 'No puedes eliminar tu propio usuario.');
  }
  if (user.rol === ROLES.ADMIN && req.user?.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un ADMIN puede eliminar una cuenta ADMIN.');
  }
  if (user.rol === ROLES.ADMIN && (await esUnicoAdmin(req.params.id, false))) {
    throw new ApiError(400, 'No puedes eliminar al único administrador del sistema.');
  }

  await User.deleteOne({ _id: user._id });

  res.status(200).json({ success: true, data: null });
});

