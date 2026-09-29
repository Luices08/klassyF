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

// Un solo rol administrativo (ADMIN): Klassy es de una institucion por
// instalacion, no hay un nivel "super" por encima del admin institucional.
export const ROLES = ['ADMIN', 'COORDINADOR', 'DOCENTE', 'SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const;
export type Rol = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  numero_documento: string;
  rol: Rol;
  estado?: 'activo' | 'inactivo';
  debe_cambiar_password?: boolean;
}

export interface LoginResponse extends ApiEnvelopeBase {
  token: string;
  user: AuthUser;
}
