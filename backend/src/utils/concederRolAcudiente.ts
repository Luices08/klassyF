import { ClientSession } from 'mongoose';
import { ROLES } from '../constants/roles';
import { UserDocument } from '../models/user.model';
import ApiError from './ApiError';

/**
 * Una persona, un solo usuario: si el acudiente ya existe como personal del colegio (p. ej. una docente que además es madre
 * de un estudiante) se le agrega el rol ACUDIENTE y al iniciar sesión elige con cuál entrar. Un estudiante no puede serlo.
 */
export async function concederRolAcudiente(usuario: UserDocument, session: ClientSession): Promise<void> {
  if (usuario.roles.includes(ROLES.ACUDIENTE)) return;
  if (usuario.roles.includes(ROLES.ESTUDIANTE)) {
    throw new ApiError(409, `El documento ${usuario.numero_documento} pertenece a un estudiante; no se puede habilitar como acudiente.`);
  }
  usuario.roles = [...usuario.roles, ROLES.ACUDIENTE];
  await usuario.save({ session });
}
