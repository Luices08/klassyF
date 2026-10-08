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
export const ROLES = ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE', 'SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Jerarquía institucional de roles (M02).
 * Nivel numérico mayor = mayor rango jerárquico.
 * Un usuario solo puede gestionar (crear, editar, cambiar estado,
 * resetear clave, cerrar sesiones, eliminar) a usuarios de rango estrictamente menor,
 * con la excepción de que un ADMIN puede gestionar a otros ADMIN (salvo a sí mismo).
 */
export const JERARQUIA_ROLES: Record<Rol, number> = {
  ADMIN: 100,
  COORDINADOR: 70,
  COORDINADOR_CONVIVENCIA: 70,
  ORIENTADOR: 70,
  SECRETARIA: 40,
  DOCENTE: 40,
  ESTUDIANTE: 10,
  ACUDIENTE: 10,
};

export function puedeGestionarRol(operadorRol: Rol, objetivoRol: Rol): boolean {
  if (operadorRol === 'ADMIN') return true;
  return (JERARQUIA_ROLES[operadorRol] ?? 0) > (JERARQUIA_ROLES[objetivoRol] ?? 0);
}

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
