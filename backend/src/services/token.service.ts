import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Rol } from '../constants/enums';
import { UserDocument } from '../models/user.model';

export interface JwtPayload {
  sub: string;
  rol: Rol;
  email: string;
}

export function generateToken(user: UserDocument): string {
  const payload: JwtPayload = {
    sub: user._id.toString(),
    rol: user.rol,
    email: user.email,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
