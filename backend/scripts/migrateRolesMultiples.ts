/**
 * Migracion (M02, roles muchos a muchos): antes cada usuario tenia un unico campo `rol`; ahora tiene `roles` (arreglo),
 * porque una misma persona puede ser, p. ej., DOCENTE y ACUDIENTE y elige el perfil al iniciar sesion.
 * Copia `rol` a `roles: [rol]` en los usuarios que aun no tienen `roles`. Es idempotente y no borra `rol`
 * (queda en el documento como respaldo; el modelo nuevo lo ignora).
 *
 * Uso: npm run migrate:roles-multiples            (aplica)
 *      npm run migrate:roles-multiples -- --simular (solo cuenta)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import User from '../src/models/user.model';

const SIN_ROLES = { $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] };

async function run(): Promise<void> {
  const soloSimular = process.argv.includes('--simular');
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  // Driver nativo: el modelo nuevo ya no conoce el campo `rol` en sus filtros.
  const pendientes = await User.collection.countDocuments({ ...SIN_ROLES, rol: { $exists: true } });
  const huerfanos = await User.collection.countDocuments({ ...SIN_ROLES, rol: { $exists: false } });
  console.log(`[migrate] ${pendientes} usuario(s) por migrar${soloSimular ? ' (simulacion: no se escribe nada)' : ''}.`);
  if (huerfanos > 0) console.warn(`[migrate] ATENCION: ${huerfanos} usuario(s) sin rol ni roles; revisalos a mano.`);

  if (!soloSimular && pendientes > 0) {
    const resultado = await User.collection.updateMany({ ...SIN_ROLES, rol: { $exists: true } }, [{ $set: { roles: ['$rol'] } }]);
    console.log(`[migrate] ${resultado.modifiedCount} usuario(s) migrado(s) a roles[].`);
  }
  if (!soloSimular) await User.syncIndexes();

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
