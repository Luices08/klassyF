/**
 * Migracion unica: documentos creados antes de que existiera el campo `estado` (grados del catalogo, sedes,
 * institucion, usuarios) no lo tienen guardado. Mongoose los lee como 'activo' (default del schema) pero las
 * consultas que filtran por estado en la base los excluian: por ejemplo, el catalogo de grados mostraba solo los
 * 2 que alguien habia activado a mano. Este script les guarda estado 'activo'. Es idempotente.
 *
 * Uso: npm run migrate:estado-por-defecto
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import Campus from '../src/models/campus.model';
import Grade from '../src/models/grade.model';
import Institution from '../src/models/institution.model';
import User from '../src/models/user.model';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  // Driver nativo: con el modelo, Mongoose "rellena" el default al leer y no distingue el documento sin campo.
  const modelos = [Grade, Campus, Institution, User];
  for (const modelo of modelos) {
    const res = await modelo.collection.updateMany({ estado: { $exists: false } }, { $set: { estado: 'activo' } });
    console.log(`[migrate] ${modelo.collection.collectionName}: ${res.modifiedCount} documento(s) sin estado -> 'activo'.`);
  }

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
