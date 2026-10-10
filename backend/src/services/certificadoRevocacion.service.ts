import { ELEMENTOS_AUTENTICACION, ElementoAutenticacion, MAX_MOTIVO_ANULACION } from '../constants/certificados';
import { ROLES } from '../constants/roles';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion } from './certificadoConfiguracionBase.service';

/**
 * Anulación masiva por elemento comprometido (solo ADMIN). Cambiar el sello o una firma NO anula lo ya expedido: cada documento certifica un hecho en su
 * fecha y conserva las imágenes con las que salió. Esto es para el caso excepcional (una imagen robada, una firma que no debió estamparse): se anulan de
 * una vez todos los documentos vigentes que usaron esa imagen, con motivo y confirmando la contraseña. Sigue siendo una anulación: nada se borra.
 */
export interface CriterioRevocacion {
  elemento: ElementoAutenticacion;
  /** La huella de la imagen (la que se ve en «Imágenes usadas»): identifica el archivo exacto que se estampó. */
  imagen_hash: string;
  desde?: Date | null;
  hasta?: Date | null;
  tipo?: string | null;
}

const exigirAdmin = (usuario: UserDocument): void => {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador anula documentos por elemento.');
};

const campoDeImagen = (elemento: ElementoAutenticacion): string => `snapshot.firmas.${elemento}.imagen.hash`;

function filtroDe(c: CriterioRevocacion): Record<string, unknown> {
  if (!ELEMENTOS_AUTENTICACION.includes(c.elemento)) throw new ApiError(400, 'Elemento desconocido.');
  const filtro: Record<string, unknown> = { estado: 'VIGENTE', [campoDeImagen(c.elemento)]: c.imagen_hash };
  if (c.tipo) filtro.tipo = c.tipo;
  if (c.desde || c.hasta) filtro.fecha_emision = { ...(c.desde ? { $gte: c.desde } : {}), ...(c.hasta ? { $lte: c.hasta } : {}) };
  return filtro;
}

/** Cada imagen que se ha estampado en documentos vigentes, con cuántos y de cuándo a cuándo, y si es la que está hoy en la configuración. */
export async function imagenesUsadas(usuario: UserDocument) {
  exigirAdmin(usuario);
  const config = await obtenerConfiguracion();
  const porElemento = await Promise.all(
    ELEMENTOS_AUTENTICACION.map(async (elemento) => {
      const filas = await CertificadoEmitido.aggregate<{ _id: string; documentos: number; desde: Date; hasta: Date }>([
        { $match: { estado: 'VIGENTE', [campoDeImagen(elemento)]: { $type: 'string' } } },
        { $group: { _id: `$${campoDeImagen(elemento)}`, documentos: { $sum: 1 }, desde: { $min: '$fecha_emision' }, hasta: { $max: '$fecha_emision' } } },
        { $sort: { hasta: -1 } },
      ]);
      const actual = config[elemento].imagen?.hash ?? null;
      return filas.map((f) => ({ elemento, hash: f._id, huella: f._id.slice(0, 12).toUpperCase(), documentos: f.documentos, desde: f.desde, hasta: f.hasta, es_la_actual: f._id === actual }));
    })
  );
  return porElemento.flat();
}

/** Cuántos documentos vigentes alcanzaría (sin tocar nada): se muestra antes de pedir la confirmación. */
export async function previaDeRevocacion(criterio: CriterioRevocacion, usuario: UserDocument) {
  exigirAdmin(usuario);
  return { documentos: await CertificadoEmitido.countDocuments(filtroDe(criterio)) };
}

export async function revocarPorElemento(criterio: CriterioRevocacion, motivo: string, confirmarPassword: string, usuario: UserDocument, ip?: string | null) {
  exigirAdmin(usuario);
  const limpio = motivo.trim().slice(0, MAX_MOTIVO_ANULACION);
  if (limpio.length < 10) throw new ApiError(400, 'Explica el motivo de la anulación (al menos 10 caracteres): queda en cada documento.');
  const admin = await User.findById(usuario._id).select('+password_hash');
  if (!admin || !(await admin.comparePassword(confirmarPassword))) throw new ApiError(401, 'Contraseña incorrecta.');

  const filtro = filtroDe(criterio);
  const resultado = await CertificadoEmitido.updateMany(filtro, { $set: { estado: 'ANULADO', anulacion: { por: usuario._id, fecha: new Date(), motivo: limpio } } });
  if (resultado.modifiedCount === 0) throw new ApiError(409, 'No hay documentos vigentes con esa imagen en ese rango: no se anuló nada.');
  // El detalle de la auditoría no lleva el motivo (queda en cada documento) ni datos de estudiantes.
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CERTIFICADOS_ANULACION_MASIVA',
    entidad: 'CertificadoEmitido',
    detalle: `${criterio.elemento} ${criterio.imagen_hash.slice(0, 12)}: ${resultado.modifiedCount} documento(s)${criterio.tipo ? `; tipo ${criterio.tipo}` : ''}`,
    ip,
  });
  return { anulados: resultado.modifiedCount };
}
