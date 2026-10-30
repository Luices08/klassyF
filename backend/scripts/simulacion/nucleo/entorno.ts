/**
 * Variables de entorno de la simulación. Se fijan antes de importar `src/config/env.ts`: la simulación NUNCA lee el
 * `MONGO_URI` ni el `UPLOADS_DIR` del `.env` (son los de la base de trabajo), solo los suyos (`SIM_MONGO_URI`, `SIM_UPLOADS_DIR`).
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const URI_POR_DEFECTO = 'mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0';

export const MONGO_URI_SIM = process.env.SIM_MONGO_URI || URI_POR_DEFECTO;
export const UPLOADS_DIR_SIM = path.resolve(process.env.SIM_UPLOADS_DIR || 'uploads-sim');
export const RESPALDOS_DIR_SIM = path.resolve(process.env.SIM_RESPALDOS_DIR || 'respaldos-sim');

/** El nombre de la base debe decir «sim»: así un descuido en la URI no escribe en la base de trabajo. */
export function nombreDeBase(uri: string): string {
  const sinParametros = uri.split('?')[0] ?? '';
  return sinParametros.slice(sinParametros.lastIndexOf('/') + 1);
}

if (!/sim/i.test(nombreDeBase(MONGO_URI_SIM))) {
  throw new Error(`La base de la simulación debe tener «sim» en su nombre (recibí «${nombreDeBase(MONGO_URI_SIM)}»). Revisa SIM_MONGO_URI.`);
}

process.env.MONGO_URI = MONGO_URI_SIM;
process.env.UPLOADS_DIR = UPLOADS_DIR_SIM;
// «test» apaga el registro de peticiones de morgan (miles de líneas por fase); no cambia ninguna regla del sistema.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'simulacion-local-klassy';
process.env.JWT_EXPIRES_IN = '3650d';
