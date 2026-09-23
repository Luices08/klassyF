/** Toda respuesta exitosa trae `success: true`; la forma del resto varia por endpoint. */
export interface ApiEnvelopeBase {
  success: true;
}

/** Forma mas comun: GET listas/detalle, POST/PATCH que devuelven el recurso en `data`. */
export interface ApiSuccess<T> extends ApiEnvelopeBase {
  data: T;
  count?: number;
}

export interface ApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const ROLES = [
  'SUPERADMIN',
  'ADMIN',
  'COORDINADOR',
  'DOCENTE',
  'SECRETARIA',
  'ESTUDIANTE',
  'ACUDIENTE',
] as const;
export type Rol = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  estado?: 'activo' | 'inactivo';
}

export interface LoginResponse extends ApiEnvelopeBase {
  token: string;
  user: AuthUser;
}
