/** Hilo aparte donde entrena la red: entrenar ocupa la CPU por varios segundos y en el hilo principal frenaría a toda la API. */
import { parentPort, workerData } from 'worker_threads';
import { entrenarYEvaluar, FilaEntrenamiento } from './utils/entrenamiento';

try {
  parentPort?.postMessage({ ok: true, resultado: entrenarYEvaluar(workerData.filas as FilaEntrenamiento[]) });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
