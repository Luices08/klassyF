import mongoose, { ClientSession } from 'mongoose';

interface MongoLabeledError {
  hasErrorLabel?: (label: string) => boolean;
  errorLabelSet?: Set<string>;
}

function hasLabel(err: unknown, label: string): boolean {
  const e = err as MongoLabeledError;
  return typeof e?.hasErrorLabel === 'function' ? e.hasErrorLabel(label) : !!e?.errorLabelSet?.has(label);
}

async function commitWithRetry(session: ClientSession): Promise<void> {
  for (;;) {
    try {
      await session.commitTransaction();
      return;
    } catch (err) {
      // El resultado del commit quedo indeterminado (ej. corte de red justo
      // despues de que MongoDB lo aplico); reintentar el commit es seguro.
      if (hasLabel(err, 'UnknownTransactionCommitResult')) continue;
      throw err;
    }
  }
}

async function safeAbort(session: ClientSession): Promise<void> {
  try {
    await session.abortTransaction();
  } catch (_err) {
    // La transaccion puede no haber alcanzado a iniciar o ya estar abortada.
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Backoff exponencial con jitter: bajo alta contencion sobre un mismo
// documento (muchas matriculas simultaneas contra un mismo grupo), reintentar
// sin espera satura de inmediato el mismo write lock. Un pequeño backoff
// creciente da tiempo a que las transacciones en curso liberen el documento.
function backoffMs(attempt: number): number {
  const base = Math.min(100, 5 * 2 ** (attempt - 1));
  return Math.random() * base;
}

interface RunTransactionOptions {
  maxRetries?: number;
}

/**
 * Ejecuta `fn(session)` dentro de una transaccion de MongoDB
 * (session.startTransaction()) con reintento automático ante
 * TransientTransactionError.
 *
 * Por que es necesario: cuando dos matriculas concurrentes intentan
 * modificar el MISMO documento Group dentro de transacciones separadas,
 * MongoDB usa control de concurrencia optimista a nivel de transaccion y
 * aborta una de ellas con WriteConflict (error 112, etiquetado
 * TransientTransactionError) en vez de resolverlo por si solo. El driver NO
 * reintenta esto automaticamente con session.startTransaction() manual; es
 * responsabilidad de la aplicacion reintentar la transaccion completa, tal
 * como documenta MongoDB. Sin este reintento, una de las dos peticiones
 * concurrentes recibiria un 500 en vez de que la logica de negocio decida
 * limpiamente (cupo disponible -> 201, cupo lleno -> 409).
 */
export async function runTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  { maxRetries = 20 }: RunTransactionOptions = {}
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    for (let attempt = 1; ; attempt += 1) {
      session.startTransaction();
      try {
        const result = await fn(session);
        await commitWithRetry(session);
        return result;
      } catch (err) {
        await safeAbort(session);
        if (hasLabel(err, 'TransientTransactionError') && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }
    }
  } finally {
    await session.endSession();
  }
}

export default runTransaction;
