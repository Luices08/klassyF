import { ClientSession } from 'mongoose';
import Counter from '../models/counter.model';
import Enrollment from '../models/enrollment.model';

export interface FolioMatricula {
  numero_folio: number;
  folio_matricula: string;
}

/**
 * Genera el folio reglamentario de matricula (CU-SEC-03: Libro de Matricula):
 * numero de folio secuencial y atomico DENTRO del libro indicado, usando
 * findByIdAndUpdate con $inc para evitar folios duplicados bajo concurrencia.
 * Si por semillas o datos previos el folio ya existe en base de datos, avanza
 * hasta encontrar el siguiente libre y sincroniza el contador.
 */
export async function generateFolioMatricula(
  year: number,
  numeroLibro: number,
  session: ClientSession
): Promise<FolioMatricula> {
  const key = `MAT-${year}-L${numeroLibro}`;
  const counter = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  let numero_folio = counter?.seq ?? 1;

  let folio_matricula = `L${numeroLibro}-F${String(numero_folio).padStart(6, '0')}-${year}`;
  while (await Enrollment.exists({ folio_matricula }).session(session)) {
    numero_folio++;
    folio_matricula = `L${numeroLibro}-F${String(numero_folio).padStart(6, '0')}-${year}`;
    await Counter.findByIdAndUpdate(key, { $set: { seq: numero_folio } }, { session });
  }

  return { numero_folio, folio_matricula };
}
