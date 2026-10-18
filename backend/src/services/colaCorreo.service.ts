import { ClientSession, Types } from 'mongoose';
import { CORREOS_EN_PARALELO, CORREOS_POR_TANDA, MINUTOS_RESERVA_CORREO, SEGUNDOS_ENTRE_TANDAS, TipoCorreo } from '../constants/citaciones';
import CorreoEnCola, { CorreoEnColaDocument } from '../models/correoEnCola.model';
import { estadoTrasFallo, proximoIntento } from '../utils/citaciones';
import { armarMensajeDeCitacion } from './citacionCorreo.service';
import { correoConfigurado, enviarCorreo } from './correo.service';

/**
 * Cola de correo en segundo plano. Quien convoca solo escribe filas (`encolarCorreo`, milisegundos aunque sean 40 acudientes); un
 * proceso del propio servidor las envía de a pocas, en paralelo limitado, con reintentos y espera creciente.
 * Es una cola en Mongo a propósito: la instalación ya la tiene, se respalda con ella y no obliga a levantar otro servicio. El reclamo es
 * atómico (`findOneAndUpdate`), así que varias instancias del servidor no envían dos veces el mismo correo.
 */

let colaActiva = false;
let procesando = false;

export interface CorreoPorEncolar {
  /** Se genera antes si hace falta enlazarlo a otro documento en la misma transacción. */
  _id: Types.ObjectId;
  tipo: TipoCorreo;
  referencia_id: Types.ObjectId;
  para: string;
}

/**
 * Deja los correos en la cola. Nunca envía ni espera al SMTP. Con `session` entra en la transacción de quien lo llama (así un correo nunca
 * queda sin su citación ni al revés); entonces quien llama debe invocar `despertarCola()` después de confirmar.
 */
export async function encolarCorreos(correos: CorreoPorEncolar[], session?: ClientSession): Promise<void> {
  if (correos.length === 0) return;
  await CorreoEnCola.insertMany(
    correos.map((c) => ({ ...c, estado: 'PENDIENTE', proximo_intento: new Date() })),
    { session }
  );
  if (!session) despertarCola();
}

/** Pide una pasada inmediata de la cola, sin esperar al siguiente turno. No hace nada si la cola no se arrancó (pruebas, scripts). */
export function despertarCola(): void {
  if (!colaActiva) return;
  setImmediate(() => {
    procesarCola().catch((err) => console.error('[correo] Error procesando la cola:', err));
  });
}

async function reclamarSiguiente(ahora: Date): Promise<CorreoEnColaDocument | null> {
  return CorreoEnCola.findOneAndUpdate(
    {
      $or: [
        { estado: 'PENDIENTE', proximo_intento: { $lte: ahora } },
        // Un correo reservado cuyo proceso murió: al vencer la reserva lo toma otro.
        { estado: 'ENVIANDO', reservado_hasta: { $lte: ahora } },
      ],
    },
    { $set: { estado: 'ENVIANDO', reservado_hasta: new Date(ahora.getTime() + MINUTOS_RESERVA_CORREO * 60_000) }, $inc: { intentos: 1 } },
    { sort: { proximo_intento: 1 }, new: true }
  );
}

async function enviarUno(correo: CorreoEnColaDocument, ahora: Date): Promise<void> {
  try {
    const armado = await armarMensajeDeCitacion(correo);
    if ('omitir' in armado) {
      await CorreoEnCola.updateOne({ _id: correo._id }, { $set: { estado: 'OMITIDO', reservado_hasta: null, ultimo_error: armado.omitir.slice(0, 300) } });
      return;
    }
    await enviarCorreo(armado.mensaje);
    await CorreoEnCola.updateOne({ _id: correo._id }, { $set: { estado: 'ENVIADO', reservado_hasta: null, enviado_en: new Date(), ultimo_error: '' } });
  } catch (err) {
    const estado = estadoTrasFallo(correo.intentos);
    await CorreoEnCola.updateOne(
      { _id: correo._id },
      { $set: { estado, reservado_hasta: null, proximo_intento: proximoIntento(correo.intentos, ahora), ultimo_error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }
    );
  }
}

/**
 * Envía una tanda de correos pendientes (hasta `limite`, `paralelo` a la vez). Devuelve cuántos reclamó. Sin correo configurado no
 * reclama nada: los correos esperan en la cola y salen cuando se configure.
 */
export async function procesarCola(opciones: { ahora?: Date; limite?: number; paralelo?: number } = {}): Promise<number> {
  if (!correoConfigurado() || procesando) return 0;
  procesando = true;
  const { ahora = new Date(), limite = CORREOS_POR_TANDA, paralelo = CORREOS_EN_PARALELO } = opciones;
  let reclamados = 0;
  try {
    const trabajador = async (): Promise<void> => {
      while (reclamados < limite) {
        reclamados += 1;
        const correo = await reclamarSiguiente(ahora);
        if (!correo) {
          reclamados -= 1;
          return;
        }
        await enviarUno(correo, ahora);
      }
    };
    await Promise.all(Array.from({ length: paralelo }, trabajador));
  } finally {
    procesando = false;
  }
  return reclamados;
}

/** Arranca el envío en segundo plano: una pasada cada pocos segundos y otra cada vez que se encola algo. */
export function iniciarColaCorreo(): void {
  colaActiva = true;
  const pasada = (): void => {
    procesarCola().catch((err) => console.error('[correo] Error procesando la cola:', err));
  };
  setTimeout(pasada, 5_000).unref();
  setInterval(pasada, SEGUNDOS_ENTRE_TANDAS * 1000).unref();
}
