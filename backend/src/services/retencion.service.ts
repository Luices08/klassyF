import { ROLES } from '../constants/roles';
import CasoConvivencia from '../models/casoConvivencia.model';
import Observacion from '../models/observacion.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { fechaLimiteRetencion } from '../utils/retencion';
import { hoyColombia } from '../utils/tiempo';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion } from './convivenciaCatalogo.service';

const MAXIMO_LISTADO = 50;

/**
 * Qué registros ya cumplieron el plazo de conservación que la institución definió. **Solo informa**: el sistema no borra ni
 * anonimiza nada por su cuenta (la supresión de datos de menores es una decisión de la institución, con acta del comité).
 * Sin plazo definido no se supone ninguno.
 */
export async function reporteRetencion(usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador consulta el informe de retención.');
  const configuracion = await obtenerConfiguracion();
  const hoy = hoyColombia();

  const observaciones = configuracion.retencion_anios_observaciones
    ? await vencidasObservaciones(fechaLimiteRetencion(configuracion.retencion_anios_observaciones, hoy))
    : null;
  const casos = configuracion.retencion_anios_casos ? await vencidosCasos(fechaLimiteRetencion(configuracion.retencion_anios_casos, hoy)) : null;

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'RETENCION_REPORTE_CONSULTADO',
    entidad: 'ConfiguracionConvivencia',
    entidad_id: configuracion._id,
    detalle: `observaciones ${observaciones?.total ?? '-'}; casos ${casos?.total ?? '-'}`,
    ip,
  });

  return {
    retencion_anios_observaciones: configuracion.retencion_anios_observaciones,
    retencion_anios_casos: configuracion.retencion_anios_casos,
    observaciones,
    casos,
    nota: 'El sistema solo informa. Suprimir o anonimizar registros es decisión de la institución y se documenta con acta del comité.',
  };
}

async function vencidasObservaciones(limite: Date) {
  const filtro = { fecha_hecho: { $lt: limite } };
  const [total, porAnio] = await Promise.all([
    Observacion.countDocuments(filtro),
    Observacion.aggregate<{ _id: number; total: number }>([{ $match: filtro }, { $group: { _id: { $year: '$fecha_hecho' }, total: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return { limite, total, por_anio: porAnio.map((a) => ({ anio: a._id, total: a.total })) };
}

/** Un caso abierto nunca vence: el plazo corre desde que se cierra o se anula. */
async function vencidosCasos(limite: Date) {
  const filtro = { $or: [{ 'cierre.fecha': { $lt: limite } }, { 'anulacion.fecha': { $lt: limite } }], estado: { $in: ['CERRADO', 'ANULADO'] } };
  const [total, casos] = await Promise.all([CasoConvivencia.countDocuments(filtro), CasoConvivencia.find(filtro).select('codigo anio estado').sort({ createdAt: 1 }).limit(MAXIMO_LISTADO)]);
  return { limite, total, casos: casos.map((c) => ({ codigo: c.codigo, anio: c.anio, estado: c.estado })) };
}
