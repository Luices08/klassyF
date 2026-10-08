import { parentPort, workerData } from 'worker_threads';
import { generarHorario } from './generador';
import { EntradaMotor } from './tipos';

// Hilo aparte para el motor: el recocido usa la CPU durante segundos y, en el hilo principal, Express dejaría de atender.
const { entrada, opciones } = workerData as { entrada: EntradaMotor; opciones: Parameters<typeof generarHorario>[1] };
parentPort?.postMessage(generarHorario(entrada, opciones));
