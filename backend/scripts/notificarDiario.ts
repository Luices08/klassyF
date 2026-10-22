/**
 * Avisos que dependen del calendario (M28): cierre de periodo próximo, desarrollo institucional que se acerca, recuperaciones (inicio y «mañana termina») y
 * actividades programadas que se publican hoy. El servidor ya los corre solo una vez al día
 * (`planificadorNotificaciones.service`); este script es solo para lanzarlos a mano. Es idempotente mientras el aviso siga sin leer.
 *
 * Uso: npm run notificar:diario
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { avisarActividadesPublicadasHoy, recordarCierresDePeriodo, recordarEventosDelCalendario } from '../src/services/notificacionesEventos.service';
import { recordarRecuperaciones } from '../src/services/recuperacionAvisos.service';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const ahora = new Date();
  await recordarCierresDePeriodo(ahora);
  await recordarEventosDelCalendario(ahora);
  await recordarRecuperaciones(ahora);
  await avisarActividadesPublicadasHoy(ahora);
  await mongoose.disconnect();
  console.log('[notificar] Listo.');
}

run().catch((err) => {
  console.error('[notificar] Error:', err);
  process.exit(1);
});
