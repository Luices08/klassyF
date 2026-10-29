import { DOCUMENTOS_TERMINOS, TipoTerminos, tiposExigidos } from '../constants/terminos';
import AceptacionTerminos from '../models/aceptacionTerminos.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';

export interface TerminoPendiente {
  tipo: TipoTerminos;
  version: string;
}

export const documentosVigentes = () => Object.values(DOCUMENTOS_TERMINOS);

/** Lo que la persona aún no aceptó en su versión vigente, para el perfil con el que tiene la sesión abierta. */
export async function pendientesDe(user: UserDocument): Promise<TerminoPendiente[]> {
  const exigidos = tiposExigidos(user.rol).map((tipo) => ({ tipo, version: DOCUMENTOS_TERMINOS[tipo].version }));
  const aceptados = await AceptacionTerminos.find({ usuario_id: user._id, $or: exigidos }).select('tipo').lean();
  const yaAceptados = new Set(aceptados.map((a) => a.tipo));
  return exigidos.filter((t) => !yaAceptados.has(t.tipo));
}

/** Idempotente: aceptar dos veces la misma versión deja una sola constancia. */
export async function aceptar(
  user: UserDocument,
  terminos: TerminoPendiente[],
  ip: string | null,
  navegador: string | null
): Promise<TerminoPendiente[]> {
  const exigidos = tiposExigidos(user.rol);
  for (const { tipo, version } of terminos) {
    if (!exigidos.includes(tipo)) throw new ApiError(400, 'Esos términos no corresponden al perfil con el que inició sesión.');
    if (DOCUMENTOS_TERMINOS[tipo].version !== version) {
      throw new ApiError(409, 'Los términos y condiciones se actualizaron. Recargue la página para leer la versión vigente.');
    }
  }

  // La constancia es la propia `AceptacionTerminos`; no va al historial de acciones (decisión del usuario).
  for (const { tipo, version } of terminos) {
    await AceptacionTerminos.updateOne(
      { usuario_id: user._id, tipo, version },
      { $setOnInsert: { rol: user.rol, ip, navegador: navegador?.slice(0, 300) ?? null } },
      { upsert: true }
    );
  }
  return pendientesDe(user);
}
