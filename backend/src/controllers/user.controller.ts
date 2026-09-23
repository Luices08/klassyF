import { ESTADOS_USUARIO, Rol, TipoDocumento } from '../constants/enums';
import { ROLES } from '../constants/roles';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

// Roles cuya creacion queda reservada exclusivamente a SUPERADMIN (permiso contextual,
// no solo por ruta): un COORDINADOR o SECRETARIA no debe poder crearse a si mismo un
// usuario RECTOR/SUPERADMIN.
const ROLES_RESTRINGIDOS: Rol[] = [ROLES.SUPERADMIN, ROLES.RECTOR];

interface CreateUserBody {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  password: string;
  rol: Rol;
  estado?: (typeof ESTADOS_USUARIO)[number];
}

export const createUser = catchAsync<unknown, unknown, CreateUserBody>(async (req, res) => {
  if (ROLES_RESTRINGIDOS.includes(req.body.rol) && req.user?.rol !== ROLES.SUPERADMIN) {
    throw new ApiError(403, 'Solo un SUPERADMIN puede crear usuarios con rol SUPERADMIN o RECTOR.');
  }

  const { password, ...rest } = req.body;
  const user = new User(rest);
  user.password = password;
  await user.save();

  res.status(201).json({ success: true, data: user });
});

interface ListUsersQuery {
  rol?: Rol;
  estado?: (typeof ESTADOS_USUARIO)[number];
}

export const listUsers = catchAsync<unknown, unknown, unknown, ListUsersQuery>(async (req, res) => {
  const filter: Partial<Record<'rol' | 'estado', string>> = {};
  if (req.query.rol) filter.rol = req.query.rol;
  if (req.query.estado) filter.estado = req.query.estado;

  const users = await User.find(filter).sort({ apellido: 1, nombre: 1 });

  res.status(200).json({ success: true, count: users.length, data: users });
});
