import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Rol } from '../constants/enums';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';

export interface JwtPayload {
  sub: string;
  /** Perfil con el que se abrió la sesión: uno de los roles del usuario. */
  rol: Rol;
  email?: string | null;
  /** version_sesion del usuario al momento de emitir el token; ver invalidacion en auth.middleware. */
  ver: number;
}

/** Sesión con el perfil `rol` (por omisión, el activo del documento). */
export function generateToken(user: UserDocument, rol: Rol = user.rol): string {
  const payload: JwtPayload = {
    sub: user._id.toString(),
    rol,
    email: user.email ?? null,
    ver: user.version_sesion,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

const MINUTOS_SELECCION_PERFIL = 5;

interface SeleccionPerfilPayload {
  sub: string;
  proposito: 'seleccion_perfil';
  ver: number;
}

/**
 * Token corto que solo sirve para elegir perfil: lo entrega el login cuando la contraseña es correcta y la persona tiene
 * más de un rol. No abre sesión (el middleware lo rechaza porque no trae `rol`), así que no hay que volver a pedir la clave.
 */
export function generarTokenSeleccionPerfil(user: UserDocument): string {
  const payload: SeleccionPerfilPayload = { sub: user._id.toString(), proposito: 'seleccion_perfil', ver: user.version_sesion };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: `${MINUTOS_SELECCION_PERFIL}m` } as SignOptions);
}

export function verificarTokenSeleccionPerfil(token: string): { sub: string; ver: number } {
  let payload: Partial<SeleccionPerfilPayload>;
  try {
    payload = jwt.verify(token, env.jwtSecret) as Partial<SeleccionPerfilPayload>;
  } catch {
    throw new ApiError(401, 'La selección de perfil expiró, vuelve a iniciar sesión.');
  }
  if (payload.proposito !== 'seleccion_perfil' || !payload.sub || payload.ver === undefined) {
    throw new ApiError(401, 'Token de selección de perfil inválido.');
  }
  return { sub: payload.sub, ver: payload.ver };
}
