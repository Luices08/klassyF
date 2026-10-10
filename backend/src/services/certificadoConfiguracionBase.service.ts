import ConfiguracionCertificados, { ConfiguracionCertificadosDocument } from '../models/configuracionCertificados.model';
import Institution from '../models/institution.model';
import ApiError from '../utils/ApiError';

/**
 * La configuración de certificados de la instalación (una por institución). Vive aparte para que los servicios de tipos, plantillas y
 * firmas la compartan sin importarse entre sí.
 */
export async function obtenerConfiguracion(): Promise<ConfiguracionCertificadosDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de expedir certificados.');
  const existente = await ConfiguracionCertificados.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionCertificados.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await ConfiguracionCertificados.findOne({ institucion_id: institucion._id })) as ConfiguracionCertificadosDocument;
    throw err;
  }
}
