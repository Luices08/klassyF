import { RequestHandler } from 'express';
import { Rol } from '../constants/enums';
import User from '../models/user.model';
import { verifyToken } from '../services/token.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

/**
 * verifyToken (expuesto como `authenticate`): valida el JWT del header
 * Authorization: Bearer <token> y adjunta el usuario autenticado en req.user.
 */
export const authenticate = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Token de autenticacion no proporcionado.');
  }

  const token = header.split(' ')[1] as string;
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new ApiError(401, 'Token invalido o expirado.');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.estado !== 'activo') {
    throw new ApiError(401, 'Usuario no autorizado o inactivo.');
  }

  req.user = user;
  next();
});

/**
 * checkRole([...rolesPermitidos]): middleware factory de RBAC estricto.
 * Debe usarse despues de `authenticate`.
 */
export const checkRole = (...rolesPermitidos: Rol[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      throw new ApiError(403, 'No tiene permisos para realizar esta accion.');
    }
    next();
  };
};
