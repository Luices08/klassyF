import { ClientSession, Types } from 'mongoose';
import { ESTADOS_TITULACION_QUE_GRADUAN, EstadoTitulacion, NOMBRES_REQUISITO } from '../constants/titulacion';
import Counter from '../models/counter.model';
import Titulacion, { ActaDeGrado, TitulacionDocument } from '../models/titulacion.model';
import ApiError from '../utils/ApiError';
import { DatosTitulacion } from '../utils/certificados';
import { obtenerConfiguracion } from './certificadoConfiguracionBase.service';

export const codigoDeActa = (anio: number, consecutivo: number): string => `AG-${anio}-${String(consecutivo).padStart(4, '0')}`;

/**
 * Asienta una acta de grado en el libro del colegio: número anual sin huecos (`AG-2026-0001`) y posición física (libro y folio). El folio avanza
 * dentro del libro vigente y, al llenarlo (`folios_por_libro_actas`), abre el siguiente: un graduado extemporáneo toma el siguiente folio del
 * libro vigente en la fecha en que cumple, no uno de su año (así el archivo conserva su correlatividad). Corre en la transacción de quien expide,
 * de modo que si el documento falla no se consume ningún número.
 */
export async function asentarActa(session: ClientSession, ahora = new Date()): Promise<ActaDeGrado> {
  const folios = (await obtenerConfiguracion()).folios_por_libro_actas;
  const anio = ahora.getFullYear();
  const consecutivo = (await Counter.findByIdAndUpdate(`ACTA-GRADO-${anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session }))?.seq ?? 0;

  let libro = (await Counter.findByIdAndUpdate('ACTA-GRADO-LIBRO', { $setOnInsert: { seq: 1 } }, { new: true, upsert: true, session }))?.seq ?? 1;
  let folio = (await Counter.findByIdAndUpdate('ACTA-GRADO-FOLIO', { $inc: { seq: 1 } }, { new: true, upsert: true, session }))?.seq ?? 1;
  if (folio > folios) {
    libro = (await Counter.findByIdAndUpdate('ACTA-GRADO-LIBRO', { $inc: { seq: 1 } }, { new: true, session }))?.seq ?? libro + 1;
    await Counter.updateOne({ _id: 'ACTA-GRADO-FOLIO' }, { $set: { seq: 1 } }, { session });
    folio = 1;
  }
  return { codigo: codigoDeActa(anio, consecutivo), consecutivo, anio, libro, folio, fecha: ahora };
}

/** Las razones por las que un estudiante todavía no puede graduarse, en frases para Secretaría. */
const razones = (t: Pick<TitulacionDocument, 'pendientes'>): string => (t.pendientes.length === 0 ? '' : ` Pendiente: ${t.pendientes.map((p) => p.detalle).join(' ')}`);

export interface ActaAsignada {
  titulacion: TitulacionDocument;
  acta: ActaDeGrado | null;
}

/**
 * El candado de M26: un documento de titulación solo se expide si el estado del estudiante (M19/M26) es uno de los que el tipo admite. Si el
 * estado gradúa y aún no tiene acta, se le asienta ahora (una sola por titulación: el acta y el diploma comparten número, libro y folio).
 * Debe llamarse dentro de la transacción de la expedición.
 */
export async function validarYAsentarActa(
  tipo: { nombre: string; estados_titulacion?: EstadoTitulacion[] },
  enrollmentId: string | Types.ObjectId,
  session: ClientSession
): Promise<ActaAsignada> {
  const titulacion = await Titulacion.findOne({ enrollment_id: enrollmentId }).session(session);
  if (!titulacion) throw new ApiError(409, `«${tipo.nombre}» exige que el estudiante haya aprobado el último grado y tenga su titulación evaluada (cierre de promoción de M19).`);
  const admitidos = tipo.estados_titulacion ?? [];
  if (!admitidos.includes(titulacion.estado)) {
    throw new ApiError(409, `No se puede expedir «${tipo.nombre}»: la situación del estudiante es ${titulacion.estado}.${razones(titulacion)}`, {
      estado: titulacion.estado,
      pendientes: titulacion.pendientes.map((p) => ({ requisito: p.requisito, nombre: NOMBRES_REQUISITO[p.requisito], detalle: p.detalle })),
    });
  }
  if (ESTADOS_TITULACION_QUE_GRADUAN.includes(titulacion.estado) && !titulacion.acta) {
    const acta = await asentarActa(session);
    await Titulacion.updateOne({ _id: titulacion._id }, { $set: { acta } }, { session });
    titulacion.acta = acta;
  }
  return { titulacion, acta: titulacion.acta ?? null };
}

/** Lo que el documento congela de la titulación. En la vista previa no hay acta todavía: se muestra «(se asigna al expedir)». */
export function datosParaDocumento(titulacion: Pick<TitulacionDocument, 'titulo' | 'estado' | 'pendientes'>, acta: ActaDeGrado | null, vistaPrevia: boolean): DatosTitulacion {
  const graduado = ESTADOS_TITULACION_QUE_GRADUAN.includes(titulacion.estado);
  return {
    titulo: titulacion.titulo,
    estado: titulacion.estado,
    pendientes: titulacion.pendientes.map((p) => p.detalle),
    acta: acta
      ? { codigo: acta.codigo, libro: acta.libro, folio: acta.folio, fecha: acta.fecha.toISOString() }
      : graduado && vistaPrevia
        ? { codigo: '(se asigna al expedir)', libro: 0, folio: 0, fecha: new Date().toISOString() }
        : null,
  };
}

export async function titulacionDeMatricula(enrollmentId: string | Types.ObjectId): Promise<TitulacionDocument | null> {
  return Titulacion.findOne({ enrollment_id: enrollmentId });
}
