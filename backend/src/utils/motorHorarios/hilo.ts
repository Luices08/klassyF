import path from 'path';
import { Worker } from 'worker_threads';
import { OpcionesGeneracion, ResultadoMotor } from './generador';
import { EntradaMotor } from './tipos';

/**
 * Corre `generarHorario` en un worker thread. En desarrollo (tsx, archivos .ts) el hilo necesita el mismo cargador de
 * TypeScript; compilado (dist/, archivos .js) se ejecuta directo.
 */
export function generarEnHilo(entrada: EntradaMotor, opciones: OpcionesGeneracion): Promise<ResultadoMotor> {
  const enTypeScript = __filename.endsWith('.ts');
  const archivo = path.join(__dirname, enTypeScript ? 'worker.ts' : 'worker.js');
  return new Promise((resolve, reject) => {
    const hilo = new Worker(archivo, { workerData: { entrada, opciones }, execArgv: enTypeScript ? ['--require', 'tsx/cjs'] : [] });
    let respondio = false;
    hilo.once('message', (resultado: ResultadoMotor) => {
      respondio = true;
      resolve(resultado);
    });
    hilo.once('error', reject);
    hilo.once('exit', (codigo) => {
      if (!respondio) reject(new Error(`El motor de horarios terminó sin resultado (código ${codigo}).`));
    });
  });
}
