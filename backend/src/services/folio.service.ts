import { ClientSession } from 'mongoose';
import Counter from '../models/counter.model';

/**
 * Genera un folio de matricula secuencial y atomico, con formato MAT-<year>-000001.
 * Usa findByIdAndUpdate con $inc (operacion atomica de MongoDB) para evitar folios
 * duplicados bajo concurrencia. Debe invocarse dentro de la misma sesion/transaccion
 * de la matricula para que el consecutivo haga rollback si la matricula falla.
 */
export async function generateFolio(year: number, session: ClientSession): Promise<string> {
  const key = `MAT-${year}`;
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  const seq = counter?.seq ?? 0;
  return `${key}-${String(seq).padStart(6, '0')}`;
}
