/**
 * Migracion unica: un año lectivo ya no es unico por numero, sino solo entre los que no estan CERRADOS
 * (se puede abrir otro 2026 despues de cerrar el primero). Retira el indice unico institucion+year de antes,
 * que lo seguiria impidiendo, y crea el parcial nuevo. Es idempotente.
 *
 * Uso: npm run migrate:anio-repetible
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import AcademicYear from '../src/models/academicYear.model';

const INDICE_VIEJO = 'institucion_id_1_year_1';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  // En una instalación nueva la colección aún no existe y listar sus índices fallaría.
  await AcademicYear.createCollection();
  const indices = await AcademicYear.collection.indexes();
  if (indices.some((i) => i.name === INDICE_VIEJO)) {
    await AcademicYear.collection.dropIndex(INDICE_VIEJO);
    console.log(`[migrate] Índice ${INDICE_VIEJO} eliminado.`);
  } else {
    console.log(`[migrate] El índice ${INDICE_VIEJO} ya no existe.`);
  }

  await AcademicYear.createIndexes();
  console.log('[migrate] Índice de año sin cerrar único creado.');
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('[migrate] Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
