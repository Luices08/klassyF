import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { iniciarColaEntrenamiento } from './modulos/predictivo/services/modelos.service';
import { iniciarColaCorreo } from './services/colaCorreo.service';
import { iniciarPlanificadorNotificaciones } from './services/planificadorNotificaciones.service';
import { iniciarPlanificadorNoticias } from './services/planificadorNoticias.service';

async function start(): Promise<void> {
  await connectDB();

  const server = app.listen(env.port, () => {
    console.log(`[server] Klassy nucleo institucional escuchando en puerto ${env.port} (${env.nodeEnv})`);
  });

  iniciarPlanificadorNotificaciones();
  iniciarPlanificadorNoticias();
  iniciarColaCorreo();
  iniciarColaEntrenamiento();

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} recibido, cerrando servidor...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] Error fatal al iniciar:', err);
  process.exit(1);
});
