/**
 * Crea (si no existen) los tipos de documento de titulación de M26: acta de grado, diploma de bachiller y constancia de culminación.
 * Idempotente. Nacen en BORRADOR: Secretaría ajusta su texto y el administrador los activa. Una instalación nueva también los necesita,
 * porque los tipos de partida de M26 se siembran una sola vez y no los incluyen.
 *
 * Uso: npm run sembrar:tipos-titulacion
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { sembrarTiposDeTitulacion } from '../src/services/tipoCertificado.service';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const creados = await sembrarTiposDeTitulacion();
  console.log(creados.length > 0 ? `[sembrar] Tipos creados en borrador: ${creados.join(', ')}.` : '[sembrar] Los tipos de titulación ya existían.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[sembrar] Falló:', err);
  await mongoose.disconnect();
  process.exit(1);
});
