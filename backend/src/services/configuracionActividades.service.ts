import ConfiguracionActividades, { ConfiguracionActividadesDocument } from '../models/configuracionActividades.model';
import Institution from '../models/institution.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

export interface CambiosConfiguracionActividades {
  max_evaluaciones_por_dia?: number;
  max_entregas_por_dia?: number;
}

export async function obtenerConfiguracionActividades(): Promise<ConfiguracionActividadesDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de programar actividades.');
  const existente = await ConfiguracionActividades.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionActividades.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) {
      return (await ConfiguracionActividades.findOne({ institucion_id: institucion._id })) as ConfiguracionActividadesDocument;
    }
    throw err;
  }
}

/** Solo cambia cuándo se advierte: no toca ninguna actividad ya programada. */
export async function actualizarConfiguracionActividades(
  cambios: CambiosConfiguracionActividades,
  usuario: UserDocument,
  ip?: string | null
): Promise<ConfiguracionActividadesDocument> {
  const configuracion = await obtenerConfiguracionActividades();
  configuracion.set(cambios);
  await configuracion.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'ACTIVIDADES_CONFIGURACION_ACTUALIZADA',
    entidad: 'ConfiguracionActividades',
    entidad_id: configuracion._id,
    detalle: Object.entries(cambios)
      .map(([campo, valor]) => `${campo}=${valor}`)
      .join(', '),
    ip,
  });
  return configuracion;
}
