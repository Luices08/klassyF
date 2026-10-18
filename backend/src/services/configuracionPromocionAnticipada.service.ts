import { ROLES } from '../constants/roles';
import ConfiguracionPromocionAnticipada, { ConfiguracionPromocionAnticipadaDocument } from '../models/configuracionPromocionAnticipada.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { CONFIGURACION_ANTICIPADA_INICIAL, ConfiguracionAnticipada, validarConfiguracionAnticipada } from '../utils/promocionAnticipada';
import { registrarEvento } from './audit.service';

/** La configuración de la promoción anticipada de la instalación; si aún no existe nace con los valores de partida (siempre editables). */
export async function obtenerConfiguracion(): Promise<ConfiguracionPromocionAnticipadaDocument> {
  const existente = await ConfiguracionPromocionAnticipada.findOne();
  if (existente) return existente;
  try {
    return await ConfiguracionPromocionAnticipada.create(structuredClone(CONFIGURACION_ANTICIPADA_INICIAL));
  } catch (err) {
    // Dos primeras peticiones a la vez.
    const otra = await ConfiguracionPromocionAnticipada.findOne();
    if (otra) return otra;
    throw err;
  }
}

export const datosDeConfiguracion = (c: ConfiguracionPromocionAnticipadaDocument): ConfiguracionAnticipada => {
  const plano = JSON.parse(JSON.stringify(c.toObject())) as ConfiguracionAnticipada;
  return {
    activa: plano.activa,
    periodo_evaluacion: plano.periodo_evaluacion,
    dias_ventana_tras_cierre: plano.dias_ventana_tras_cierre,
    grados_excluidos_ids: (plano.grados_excluidos_ids ?? []).map(String),
    rendimiento_excepcional: plano.rendimiento_excepcional,
    reiniciantes: plano.reiniciantes,
    exige: plano.exige,
    tratamiento_notas: plano.tratamiento_notas,
  };
};

/** Solo el administrador cambia las reglas; un trámite en curso conserva las que regían cuando se abrió. */
export async function actualizarConfiguracion(cambios: ConfiguracionAnticipada, usuario: UserDocument, ip?: string | null): Promise<ConfiguracionPromocionAnticipadaDocument> {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cambia la configuración de la promoción anticipada.');
  const problema = validarConfiguracionAnticipada(cambios);
  if (problema) throw new ApiError(400, problema);
  const config = await obtenerConfiguracion();
  config.set({ ...cambios, actualizado_por: usuario._id });
  await config.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_ANTICIPADA_CONFIGURACION_ACTUALIZADA',
    entidad: 'ConfiguracionPromocionAnticipada',
    entidad_id: config._id,
    detalle: `Periodo ${cambios.periodo_evaluacion}, notas: ${cambios.tratamiento_notas}, ${cambios.activa ? 'activa' : 'desactivada'}`,
    ip,
  });
  return config;
}
