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

export function permisosCertificados(rol: Rol, _delegacionRectoria?: boolean): PermisosCertificados {
  if (rol === ROLES.ADMIN || rol === ROLES.SECRETARIA) {
    return {
      imagen: { rectoria: true, secretaria: true, sello: true },
      designar: { rectoria: rol === ROLES.ADMIN, secretaria: true },
      ajustes: true,
    };
  }
  return { imagen: { rectoria: false, secretaria: false, sello: false }, designar: { rectoria: false, secretaria: false }, ajustes: false };
}

/**
 * Qué puede hacer un usuario sobre un TIPO de documento según el estado del tipo. Secretaría y ADMIN crean, editan plantillas, activan,
 * archivan y eliminan según las necesidades de la secretaría académica.
 */
export interface PermisosTipo {
  /** Nombre, descripción, estados de matrícula, prefijo y fuentes. */
  editar: boolean;
  /** Redactar y publicar el texto del tipo. */
  editarPlantilla: boolean;
  /** Pasar de borrador (o archivado) a activo. */
  activar: boolean;
  archivar: boolean;
  eliminar: boolean;
}

export function permisosTipo(rol: Rol, estado: 'BORRADOR' | 'ACTIVO' | 'ARCHIVADO'): PermisosTipo {
  const ninguno: PermisosTipo = { editar: false, editarPlantilla: false, activar: false, archivar: false, eliminar: false };
  if (rol === ROLES.ADMIN || rol === ROLES.SECRETARIA) {
    return {
      editar: estado !== 'ARCHIVADO',
      editarPlantilla: estado !== 'ARCHIVADO',
      activar: estado !== 'ACTIVO',
      archivar: estado !== 'ARCHIVADO',
      eliminar: true,
    };
  }
  return ninguno;
}
