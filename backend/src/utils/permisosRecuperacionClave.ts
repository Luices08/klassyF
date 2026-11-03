import { Types } from 'mongoose';
import { Rol } from '../constants/enums';
import { ROLES_QUE_ATIENDEN_CLAVE } from '../constants/recuperacionClave';
import { ROLES, puedeGestionarRoles } from '../constants/roles';

export interface OperadorDeClave {
  rol: Rol;
  sedes_ids: ReadonlyArray<Types.ObjectId | string>;
}

export interface SolicitudDeClave {
  roles: readonly Rol[];
  sedes_ids: ReadonlyArray<Types.ObjectId | string>;
}

/**
 * Quién puede atender una solicitud de clave. Reusa la jerarquía de M02 (`puedeGestionarRoles`): secretaría atiende estudiantes y
 * acudientes, coordinación además a docentes y secretaría, y el ADMIN a cualquiera. La secretaría solo atiende las sedes que tiene
 * asignadas; una solicitud sin sede conocida (p. ej. un acudiente cuyo hijo aún no tiene grupo) queda para coordinación y ADMIN.
 */
export function puedeAtenderSolicitudClave(operador: OperadorDeClave, solicitud: SolicitudDeClave): boolean {
  if (!ROLES_QUE_ATIENDEN_CLAVE.includes(operador.rol)) return false;
  if (!puedeGestionarRoles(operador.rol, solicitud.roles)) return false;
  if (operador.rol !== ROLES.SECRETARIA) return true;
  const sedesDelOperador = new Set(operador.sedes_ids.map(String));
  return solicitud.sedes_ids.some((sede) => sedesDelOperador.has(String(sede)));
}

/** Perfiles que pueden atender a quien tiene esos roles; sirve para avisar solo a quienes sí podrán resolver la solicitud. */
export function rolesQueAtiendenA(rolesDelSolicitante: readonly Rol[], haySedeConocida: boolean): Rol[] {
  return ROLES_QUE_ATIENDEN_CLAVE.filter(
    (rol) => puedeGestionarRoles(rol, rolesDelSolicitante) && (rol !== ROLES.SECRETARIA || haySedeConocida)
  );
}
