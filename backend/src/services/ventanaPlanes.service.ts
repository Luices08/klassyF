import AcademicYear from '../models/academicYear.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PeriodoVentana, estadoDeVentana, validarVentana, ventanaDeEntrega } from '../utils/planeacion';
import { registrarEvento } from './audit.service';

export interface CambioVentana {
  /** Un día de calendario. `null` vuelve a la fecha sugerida; sin enviarlo, no se toca. */
  fecha_apertura?: string | Date | null;
  fecha_limite?: string | Date | null;
}

// Las fechas de calendario de M05 se guardan a medianoche UTC del día elegido.
const soloDia = (valor: string | Date): Date => new Date(new Date(valor).toISOString().slice(0, 10));

function vistaVentanas(periodos: ReadonlyArray<PeriodoVentana & { nombre: string; estado: string }>, ahora: Date) {
  return [...periodos]
    .sort((a, b) => a.numero - b.numero)
    .flatMap((periodo) => {
      const ventana = ventanaDeEntrega(periodos, periodo.numero);
      if (!ventana) return [];
      return [
        {
          numero: periodo.numero,
          nombre: periodo.nombre,
          estado_periodo: periodo.estado,
          fecha_inicio: periodo.fecha_inicio,
          fecha_fin: periodo.fecha_fin,
          apertura: ventana.apertura,
          limite: ventana.limite,
          apertura_personalizada: ventana.apertura_personalizada,
          limite_personalizado: ventana.limite_personalizado,
          estado: estadoDeVentana(ventana, ahora),
        },
      ];
    });
}

/** La ventana de entrega de planes de aula de cada periodo del año: la configurada o, donde no se ha tocado, la sugerida. */
export async function listarVentanas(anioId: string) {
  const anio = await AcademicYear.findById(anioId).select('year estado periodos').lean();
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  return { anio: { _id: String(anio._id), year: anio.year, estado: anio.estado }, periodos: vistaVentanas(anio.periodos, new Date()) };
}

/**
 * Coordinación o administración fijan cuándo abre y hasta cuándo se radican los planes de aula de un periodo, sin tocar las fechas
 * del periodo (esas son de M05). Se valida el resultado completo antes de guardar, no cada fecha por separado.
 */
export async function configurarVentana(anioId: string, numero: number, cambio: CambioVentana, usuario: UserDocument, ip?: string | null) {
  const anio = await AcademicYear.findById(anioId).select('year estado periodos');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año lectivo ${anio.year} está cerrado y solo admite consulta.`);
  const periodo = anio.periodos.find((p) => p.numero === numero);
  if (!periodo) throw new ApiError(404, `El año lectivo ${anio.year} no tiene periodo ${numero}.`);

  const apertura = cambio.fecha_apertura === undefined ? (periodo.fecha_apertura_planes_aula ?? null) : cambio.fecha_apertura ? soloDia(cambio.fecha_apertura) : null;
  const limite = cambio.fecha_limite === undefined ? (periodo.fecha_limite_planes_aula ?? null) : cambio.fecha_limite ? soloDia(cambio.fecha_limite) : null;

  const resultante: PeriodoVentana[] = anio.periodos.map((p) =>
    p.numero === numero ? { ...p.toObject(), fecha_apertura_planes_aula: apertura, fecha_limite_planes_aula: limite } : p.toObject()
  );
  const error = validarVentana(resultante, numero);
  if (error) throw new ApiError(400, error);

  // updateOne y no save(): guardar el año completo volvería a validar todo su calendario por un cambio que no lo toca.
  await AcademicYear.updateOne(
    { _id: anio._id, 'periodos.numero': numero },
    { $set: { 'periodos.$.fecha_apertura_planes_aula': apertura, 'periodos.$.fecha_limite_planes_aula': limite } }
  );

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'VENTANA_PLANES_AULA_ACTUALIZADA',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}, periodo ${numero}: ${apertura ? apertura.toISOString().slice(0, 10) : 'apertura sugerida'} a ${limite ? limite.toISOString().slice(0, 10) : 'límite sugerido'}.`,
    ip,
  });
  return listarVentanas(anioId);
}
