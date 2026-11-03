import { Rol } from './enums';
import { ROLES } from './roles';

export const ESTADOS_SOLICITUD_CLAVE = ['PENDIENTE', 'ATENDIDA', 'RECHAZADA'] as const;
export type EstadoSolicitudClave = (typeof ESTADOS_SOLICITUD_CLAVE)[number];

/** Quién atiende las solicitudes de clave: lista de permitidos, sin herencia. Qué cuentas atiende cada uno lo decide la jerarquía de M02. */
export const ROLES_QUE_ATIENDEN_CLAVE: readonly Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

export const MAX_NOTA_SOLICITUD_CLAVE = 200;
export const MAX_MOTIVO_RECHAZO_CLAVE = 300;
/** Lo que se muestra en la bandeja: lo más reciente primero y sin paginar (una solicitud pendiente es poca cosa). */
export const MAX_SOLICITUDES_LISTADAS = 200;
