import TareaDiaria from '../models/tareaDiaria.model';
import { avisarActividadesPublicadasHoy, recordarCierresDePeriodo, recordarEventosDelCalendario } from './notificacionesEventos.service';

const CADA_HORA_MS = 60 * 60 * 1000;
const ESPERA_INICIAL_MS = 30 * 1000;

/** Día calendario en hora de Colombia (UTC-5), para que "una vez al día" no dependa de la zona del servidor. */
export function diaDeColombia(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Ejecuta los avisos del calendario (M28) si hoy aún no corrieron. El reclamo es un insert con `_id` único: si otra
 * instancia ya lo tomó, no hace nada. Si la ejecución falla se libera para reintentar en la siguiente revisión.
 */
export async function ejecutarAvisosDiarios(ahora: Date = new Date()): Promise<boolean> {
  const id = `notificar-diario:${diaDeColombia(ahora)}`;
  try {
    await TareaDiaria.create({ _id: id });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
  try {
    await recordarCierresDePeriodo(ahora);
    await recordarEventosDelCalendario(ahora);
    await avisarActividadesPublicadasHoy(ahora);
    return true;
  } catch (err) {
    await TareaDiaria.deleteOne({ _id: id });
    throw err;
  }
}

/** Arranca la revisión: poco después de iniciar y luego cada hora; el reclamo diario evita repetir. */
export function iniciarPlanificadorNotificaciones(): void {
  const revisar = (): void => {
    ejecutarAvisosDiarios().catch((err) => console.error('[planificador] Error en avisos diarios:', err));
  };
  setTimeout(revisar, ESPERA_INICIAL_MS).unref();
  setInterval(revisar, CADA_HORA_MS).unref();
}
