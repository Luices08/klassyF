import { ClientSession } from 'mongoose';
import Counter from '../models/counter.model';

export interface FolioMatricula {
  numero_folio: number;
  folio_matricula: string;
}

/**
 * Genera el folio reglamentario de matricula (CU-SEC-03: Libro de Matricula):
 * numero de folio secuencial y atomico DENTRO del libro indicado, usando
 * findByIdAndUpdate con $inc para evitar folios duplicados bajo concurrencia.
 * Debe invocarse dentro de la misma sesion/transaccion de la matricula para
 * que el consecutivo haga rollback si la matricula falla.
 */
export async function generateFolioMatricula(
  year: number,
  numeroLibro: number,
  session: ClientSession
): Promise<FolioMatricula> {
  const key = `MAT-${year}-L${numeroLibro}`;
  const counter = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  const numero_folio = counter?.seq ?? 0;
  return { numero_folio, folio_matricula: `L${numeroLibro}-F${String(numero_folio).padStart(6, '0')}-${year}` };
}
