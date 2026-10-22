/** Los pasos de una fase con su fecha: se ejecutan en orden cronológico moviendo el reloj simulado. */
import { sumarDias } from './fechas';
import { irA } from './reloj';

/** ¿Ese instante cae después del día de corte? */
export const despuesDelCorte = (ctx: { corte: Date }, cuando: Date): boolean => cuando.getTime() >= sumarDias(ctx.corte, 1).getTime() + 5 * 3_600_000;

/** Un paso de la simulación con su fecha: el reloj salta a ella antes de llamar a la API. */
export interface Evento {
  cuando: Date;
  correr: () => Promise<void>;
}

/**
 * Ejecuta los eventos en orden de fecha, moviendo el reloj a cada uno. Un evento puede agendar otros (en `nuevos`): se suman a la
 * fila en cuanto aparecen, así una entrega nunca corre antes que la actividad que la origina ni después de su calificación.
 * Con `ctx`, lo que cae después del día de corte no se ejecuta (el periodo queda a medias, como el de hoy).
 */
export async function ejecutarEventos(eventos: Evento[], nuevos: Evento[] = [], ctx?: { corte: Date }): Promise<number> {
  const fila = [...eventos];
  let omitidos = 0;
  while (fila.length > 0) {
    // Orden estable: a igual fecha, primero lo que se agendó primero.
    let i = 0;
    for (let k = 1; k < fila.length; k += 1) if ((fila[k] as Evento).cuando < (fila[i] as Evento).cuando) i = k;
    const [e] = fila.splice(i, 1) as [Evento];
    if (ctx && despuesDelCorte(ctx, e.cuando)) {
      omitidos += 1;
      continue;
    }
    irA(e.cuando);
    await e.correr();
    if (nuevos.length > 0) fila.push(...nuevos.splice(0));
  }
  return omitidos;
}
