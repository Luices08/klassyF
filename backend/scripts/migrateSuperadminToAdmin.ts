/**
 * Migracion unica: el rol SUPERADMIN se elimino del enum (ver CLAUDE.md — Klassy
 * es de una sola institucion por instalacion, ADMIN ya es el maximo privilegio).
 * Este script pasa a ADMIN cualquier usuario que haya quedado con rol
 * "SUPERADMIN" en Mongo antes del cambio (Mongo no revalida documentos ya
 * guardados contra un enum que cambio en el codigo).
 *
 * Uso: npm run migrate:superadmin-to-admin
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import User from '../src/models/user.model';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  // Se usa el driver nativo (User.collection) porque el filtro busca un valor
  // ("SUPERADMIN") que el schema de Mongoose ya no reconoce como valido.
  const result = await User.collection.updateMany({ rol: 'SUPERADMIN' }, { $set: { rol: 'ADMIN' } });
  console.log(`[migrate] ${result.modifiedCount} usuario(s) SUPERADMIN migrado(s) a ADMIN.`);

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
