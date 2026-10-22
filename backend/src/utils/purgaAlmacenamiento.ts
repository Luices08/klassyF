import path from 'path';
import { DIAS_PURGA_ARCHIVOS_POR_DEFECTO } from '../constants/actividades';

/**
 * Reglas puras de la depuración de archivos de entregas (M11). Se prueban sin base de datos ni disco; el servicio solo trae los
 * datos y las aplica.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ArchivoDepurable {
  path: string | null;
  purgado?: boolean;
}

/** Un archivo que todavía existe en disco según la base: no depurado y con ruta. */
export function archivoDisponible(archivo: ArchivoDepurable): boolean {
  return archivo.purgado !== true && Boolean(archivo.path);
}

/**
 * Un archivo se puede depurar cuando pasaron `dias` desde lo MÁS TARDÍO entre el fin del periodo y el día en que se entregó: una
 * entrega tardía (el docente aún recibía trabajos) conserva su plazo completo. `dias = 0` depura de inmediato.
 */
export function cumpleAntiguedad(finPeriodo: Date, fechaEntrega: Date | null | undefined, ahora: Date, dias: number): boolean {
  const referencia = Math.max(finPeriodo.getTime(), fechaEntrega ? fechaEntrega.getTime() : 0);
  return referencia + dias * MS_POR_DIA <= ahora.getTime();
}

/**
 * La ruta absoluta de un archivo solo si cae DENTRO de `base`. La base de datos guarda rutas relativas al proceso; nada de lo que
 * diga una ruta guardada debe poder hacer que se borre algo fuera de la carpeta de actividades.
 */
export function rutaDentroDe(base: string, rutaGuardada: string, raiz: string = process.cwd()): string | null {
  const carpeta = path.resolve(base);
  const absoluta = path.resolve(raiz, rutaGuardada);
  return absoluta.startsWith(carpeta + path.sep) ? absoluta : null;
}

export function megabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export interface ArgumentosPurga {
  periodoId: string;
  dias: number;
  simular: boolean;
}

/** Lee `--periodoId=<id> [--olderThanDays=N] [--dry-run]`. Lanza un Error con el mensaje listo para mostrar en consola. */
export function interpretarArgumentosPurga(argv: readonly string[]): ArgumentosPurga {
  const valor = (nombre: string): string | undefined => argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

  const periodoId = valor('periodoId')?.trim();
  if (!periodoId || !/^[0-9a-fA-F]{24}$/.test(periodoId)) {
    throw new Error('Indica el periodo con --periodoId=<id> (el _id del periodo dentro del año lectivo, 24 caracteres hexadecimales).');
  }

  const textoDias = valor('olderThanDays');
  const dias = textoDias === undefined ? DIAS_PURGA_ARCHIVOS_POR_DEFECTO : Number(textoDias);
  if (textoDias !== undefined && (textoDias.trim() === '' || !Number.isInteger(dias) || dias < 0)) {
    throw new Error('--olderThanDays debe ser un número entero de días, 0 o mayor.');
  }

  return { periodoId, dias, simular: argv.includes('--dry-run') };
}
