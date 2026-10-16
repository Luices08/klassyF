/**
 * Recordatorio de cierre de periodo (M28). Avisa a los docentes cuando faltan DIAS_RECORDATORIO_CIERRE días o menos.
 * No hay planificador interno: se programa una vez al día en el servidor (cron). Es idempotente: agrupa en la misma alerta.
 *
 * Uso: npm run notificar:cierres
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { recordarCierresDePeriodo } from '../src/services/notificacionesEventos.service';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  await recordarCierresDePeriodo(new Date());
  await mongoose.disconnect();
  console.log('[notificar] Listo.');
}

run().catch((err) => {
  console.error('[notificar] Error:', err);
  process.exit(1);
});
