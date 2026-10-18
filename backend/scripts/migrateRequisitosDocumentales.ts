/**
 * Convierte los documentos de matrícula de siempre en el catálogo configurable (M04): crea los requisitos de partida (identidad, foto, EPS,
 * vacunas, certificados, paz y salvo, etc.) con las reglas que el sistema ya aplicaba. Idempotente (se siembra una sola vez) y NO toca ninguna
 * matrícula ni su checklist: los documentos ya pedidos, cargados o aprobados quedan exactamente como estaban.
 *
 * Uso: npm run migrate:requisitos-documentales
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import RequisitoDocumental from '../src/models/requisitoDocumental.model';
import { asegurarCatalogoSembrado } from '../src/services/requisitoDocumental.service';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const sembrado = await asegurarCatalogoSembrado();
  const total = await RequisitoDocumental.countDocuments();
  console.log(sembrado ? `[migrate] Catálogo sembrado: ${total} documentos. Ninguna matrícula fue modificada.` : `[migrate] El catálogo ya estaba sembrado (${total} documentos).`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[migrate] Falló:', err);
  await mongoose.disconnect();
  process.exit(1);
});
