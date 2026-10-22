import { CRITERIOS_DESEMPATE, CRITERIOS_INICIALES, CriterioConfigurado, TOLERANCIA_OCUPACION_POR_DEFECTO } from '../constants/rematricula';
import { ROLES } from '../constants/roles';
import ConfiguracionRematricula, { ConfiguracionRematriculaDocument } from '../models/configuracionRematricula.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

export interface DatosConfiguracionRematricula {
  criterios_desempate: CriterioConfigurado[];
  tolerancia_ocupacion_pct: number;
}

/** La configuración de la rematrícula de la instalación; si aún no existe se crea con los valores de partida (siempre editables). */
export async function obtenerConfiguracion(): Promise<ConfiguracionRematriculaDocument> {
  const existente = await ConfiguracionRematricula.findOne();
  if (existente) return existente;
  try {
    return await ConfiguracionRematricula.create({ criterios_desempate: structuredClone(CRITERIOS_INICIALES), tolerancia_ocupacion_pct: TOLERANCIA_OCUPACION_POR_DEFECTO });
  } catch (err) {
    // Dos primeras peticiones a la vez.
    const otra = await ConfiguracionRematricula.findOne();
    if (otra) return otra;
    throw err;
  }
}

export const datosDeConfiguracion = (c: ConfiguracionRematriculaDocument): DatosConfiguracionRematricula => ({
  criterios_desempate: c.criterios_desempate.map((x) => ({ criterio: x.criterio, activo: x.activo })),
  tolerancia_ocupacion_pct: c.tolerancia_ocupacion_pct,
});

/** Cada criterio del catálogo aparece una sola vez (el orden de la lista es el orden de prioridad). */
export function validarConfiguracionRematricula(cambios: DatosConfiguracionRematricula): string | null {
  const claves = cambios.criterios_desempate.map((c) => c.criterio);
  if (claves.length !== CRITERIOS_DESEMPATE.length || new Set(claves).size !== claves.length || !claves.every((c) => CRITERIOS_DESEMPATE.includes(c))) {
    return 'Los criterios de desempate deben incluir cada criterio exactamente una vez; el orden de la lista es el orden de prioridad.';
  }
  if (!Number.isFinite(cambios.tolerancia_ocupacion_pct) || cambios.tolerancia_ocupacion_pct < 0 || cambios.tolerancia_ocupacion_pct > 50) {
    return 'La tolerancia de ocupación entre grupos debe estar entre 0 y 50 puntos.';
  }
  return null;
}

/** Solo el administrador cambia las reglas de prioridad y balanceo; una pre-matrícula ya creada no se recalcula. */
export async function actualizarConfiguracion(cambios: DatosConfiguracionRematricula, usuario: UserDocument, ip?: string | null): Promise<ConfiguracionRematriculaDocument> {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cambia las reglas de la rematrícula.');
  const problema = validarConfiguracionRematricula(cambios);
  if (problema) throw new ApiError(400, problema);
  const config = await obtenerConfiguracion();
  config.set({ criterios_desempate: cambios.criterios_desempate, tolerancia_ocupacion_pct: cambios.tolerancia_ocupacion_pct, actualizado_por: usuario._id });
  await config.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'REMATRICULA_CONFIGURACION_ACTUALIZADA',
    entidad: 'ConfiguracionRematricula',
    entidad_id: config._id,
    detalle: `Prioridad: ${cambios.criterios_desempate.filter((c) => c.activo).map((c) => c.criterio).join(' > ') || 'ninguno'}; tolerancia ${cambios.tolerancia_ocupacion_pct}%.`,
    ip,
  });
  return config;
}
