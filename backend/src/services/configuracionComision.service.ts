import ConfiguracionComision, { ConfiguracionComisionDocument } from '../models/configuracionComision.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { CONFIGURACION_INICIAL, ConfiguracionDeComision, validarConfiguracion } from '../utils/comision';
import { ROLES } from '../constants/roles';
import { registrarEvento } from './audit.service';

/** La configuración de M20 de la instalación; si aún no existe se crea con los valores de partida (siempre editables). */
export async function obtenerConfiguracion(): Promise<ConfiguracionComisionDocument> {
  const existente = await ConfiguracionComision.findOne();
  if (existente) return existente;
  try {
    return await ConfiguracionComision.create(structuredClone(CONFIGURACION_INICIAL));
  } catch (err) {
    // Dos primeras peticiones a la vez.
    const otra = await ConfiguracionComision.findOne();
    if (otra) return otra;
    throw err;
  }
}

export const datosDeConfiguracion = (c: ConfiguracionComisionDocument): ConfiguracionDeComision => {
  const plano = JSON.parse(JSON.stringify(c.toObject())) as ConfiguracionDeComision;
  return { semaforo: plano.semaforo, reprobacion_masiva: plano.reprobacion_masiva, quorum_porcentaje: plano.quorum_porcentaje, mayoria: plano.mayoria, firmas_requeridas: plano.firmas_requeridas };
};

/** Solo el administrador cambia las reglas del tablero y de las sesiones; lo ya firmado no cambia (cada acta guarda su quórum). */
export async function actualizarConfiguracion(cambios: ConfiguracionDeComision, usuario: UserDocument, ip?: string | null): Promise<ConfiguracionComisionDocument> {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cambia la configuración de la comisión.');
  const problema = validarConfiguracion(cambios);
  if (problema) throw new ApiError(400, problema);
  const config = await obtenerConfiguracion();
  config.set({ ...cambios, actualizado_por: usuario._id });
  await config.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'COMISION_CONFIGURACION_ACTUALIZADA',
    entidad: 'ConfiguracionComision',
    entidad_id: config._id,
    detalle: `Semáforo ${cambios.semaforo.amarillo_desde}/${cambios.semaforo.naranja_desde}/${cambios.semaforo.rojo_desde}, quórum ${cambios.quorum_porcentaje}%, mayoría ${cambios.mayoria}`,
    ip,
  });
  return config;
}
