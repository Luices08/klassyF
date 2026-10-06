import { UserDocument } from '../../../models/user.model';
import { ROLES } from '../../../constants/roles';
import ApiError from '../../../utils/ApiError';
import { registrarEvento } from '../../../services/audit.service';
import { obtenerConfiguracion } from './inclusionContexto.service';

export interface CambiosConfiguracion {
  plazo_elaboracion_dias?: number;
  seguimientos_minimos_anio?: number;
  retencion_anios?: number | null;
  declaracion_establecimiento?: string;
  declaracion_familia?: string;
  version_politica_datos?: string;
}

/** Política de inclusión del colegio: solo el ADMIN la cambia. No toca nada ya emitido (lo firmado conserva su texto). */
export async function actualizarConfiguracion(cambios: CambiosConfiguracion, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cambia la configuración de inclusión.');
  const configuracion = await obtenerConfiguracion();
  configuracion.set(cambios);
  await configuracion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONFIGURACION_ACTUALIZADA', entidad: 'ConfiguracionInclusion', entidad_id: configuracion._id, detalle: Object.keys(cambios).join(', '), ip });
  return configuracion;
}
