import { ElementoAutenticacion } from '../constants/certificados';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

/**
 * Quién gestiona qué en «Firmas y sellos». Función pura y lista de permitidos, como `permisosInclusion`.
 * Secretaría carga su propia firma y el sello; la firma de Rectoría solo mientras el ADMIN mantenga la delegación
 * (la misma llave que ya decide si secretaría la puede estampar al expedir). Quién es el rector, la política por
 * documento, la delegación y las dependencias del paz y salvo son decisiones del ADMIN.
 */
export interface PermisosCertificados {
  /** Cargar, reemplazar, quitar y ver la imagen de cada elemento. */
  imagen: Record<ElementoAutenticacion, boolean>;
  /** Elegir quién firma y el cargo que se imprime. */
  designar: { rectoria: boolean; secretaria: boolean };
  /** Delegación, política por documento y dependencias del paz y salvo. */
  ajustes: boolean;
}

export function permisosCertificados(rol: Rol, delegacionRectoria: boolean): PermisosCertificados {
  if (rol === ROLES.ADMIN) return { imagen: { rectoria: true, secretaria: true, sello: true }, designar: { rectoria: true, secretaria: true }, ajustes: true };
  if (rol === ROLES.SECRETARIA) {
    return { imagen: { rectoria: delegacionRectoria, secretaria: true, sello: true }, designar: { rectoria: false, secretaria: true }, ajustes: false };
  }
  return { imagen: { rectoria: false, secretaria: false, sello: false }, designar: { rectoria: false, secretaria: false }, ajustes: false };
}
