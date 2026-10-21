import { REVISION_NOTICIAS_PROGRAMADAS_MS } from '../constants/noticias';
import { procesarNoticiasPendientes } from './noticiaAvisos.service';

const ESPERA_INICIAL_MS = 15 * 1000;

/**
 * Cada minuto busca las noticias programadas a las que ya les llegó la hora y avisa a sus destinatarios. A diferencia de los avisos diarios de M28, aquí la hora importa
 * (una noticia se programa para las 7:00), por eso es frecuente; el reclamo atómico de cada noticia evita avisar dos veces aunque haya varias instancias.
 */
export function iniciarPlanificadorNoticias(): void {
  const revisar = (): void => {
    procesarNoticiasPendientes().catch((err) => console.error('[planificador] Error al avisar noticias programadas:', err));
  };
  setTimeout(revisar, ESPERA_INICIAL_MS).unref();
  setInterval(revisar, REVISION_NOTICIAS_PROGRAMADAS_MS).unref();
}
