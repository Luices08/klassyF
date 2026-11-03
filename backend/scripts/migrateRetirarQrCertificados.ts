/**
 * Migracion unica: los certificados ya no llevan codigo QR ni `token_verificacion`. Retira el indice unico de ese campo
 * (sin el, el segundo certificado expedido chocaria: un campo ausente cuenta como nulo y el indice no lo admite repetido)
 * y borra el token guardado en los documentos ya expedidos. Es idempotente y no toca el contenido, la huella ni el codigo.
 *
 * Uso: npm run migrate:retirar-qr-certificados
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import CertificadoEmitido from '../src/models/certificadoEmitido.model';

const INDICE_VIEJO = 'token_verificacion_1';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  const indices = await CertificadoEmitido.collection.indexes().catch(() => []);
  if (indices.some((i) => i.name === INDICE_VIEJO)) {
    await CertificadoEmitido.collection.dropIndex(INDICE_VIEJO);
    console.log(`[migrate] Índice ${INDICE_VIEJO} eliminado.`);
  } else {
    console.log(`[migrate] El índice ${INDICE_VIEJO} ya no existe.`);
  }

  const resultado = await CertificadoEmitido.collection.updateMany({ token_verificacion: { $exists: true } }, { $unset: { token_verificacion: '' } });
  console.log(`[migrate] Token de verificación retirado de ${resultado.modifiedCount} certificado(s).`);
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('[migrate] Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
