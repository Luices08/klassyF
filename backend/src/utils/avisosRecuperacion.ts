/**
 * Cuándo avisar de una ventana de recuperación (M18 → M28). Puro: recibe el instante y las fechas del evento del calendario (M05, que se
 * guardan como día de calendario: medianoche UTC, o el final de ese mismo día UTC) y decide si hoy toca el aviso de inicio o el de
 * «mañana termina». «Hoy» es el día de calendario en Colombia (UTC-5), igual que el resto del sistema.
 */

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;

/** Medianoche UTC del día de calendario de Colombia en el que cae `ahora`. */
export function hoyEnColombia(ahora: Date): Date {
  const dia = new Date(ahora.getTime() - 5 * MS_HORA);
  dia.setUTCHours(0, 0, 0, 0);
  return dia;
}

/** Día de calendario de una fecha del calendario del colegio, como medianoche UTC (ignora la hora con que se haya guardado). */
const diaDe = (fecha: Date): number => Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());

/** Días de calendario que faltan desde hoy hasta `fecha` (0 = hoy, 1 = mañana, negativo = ya pasó). */
export function diasHasta(ahora: Date, fecha: Date): number {
  return Math.round((diaDe(fecha) - hoyEnColombia(ahora).getTime()) / MS_DIA);
}

export interface VentanaDelCalendario {
  fecha_inicio: Date;
  fecha_fin: Date;
  /** Si el colegio fijó un plazo para registrar resultados, ese es el último día; si no, el fin del evento. */
  fecha_limite_resultados?: Date | null;
}

/** El último día en que se puede registrar una recuperación de esa ventana. */
export const ultimoDiaDeLaVentana = (v: VentanaDelCalendario): Date => v.fecha_limite_resultados ?? v.fecha_fin;

export interface MomentoDeAviso {
  /** La ventana empieza hoy. */
  iniciaHoy: boolean;
  /** Mañana es el último día de la ventana (hoy es el penúltimo; si dura un solo día, no hay aviso de «mañana termina»). */
  terminaManana: boolean;
  /** Hoy se puede registrar. */
  abierta: boolean;
}

export function momentoDeAviso(ahora: Date, ventana: VentanaDelCalendario): MomentoDeAviso {
  const hastaInicio = diasHasta(ahora, ventana.fecha_inicio);
  const hastaFin = diasHasta(ahora, ultimoDiaDeLaVentana(ventana));
  return {
    iniciaHoy: hastaInicio === 0,
    terminaManana: hastaFin === 1 && hastaInicio < 1,
    abierta: hastaInicio <= 0 && hastaFin >= 0,
  };
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');
const diaMes = (fecha: Date): string => `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}`;

/** «del 22/10 al 13/11» (o «el 22/10» si dura un día). */
export function textoDeVentana(ventana: VentanaDelCalendario): string {
  const desde = diaMes(ventana.fecha_inicio);
  const hasta = diaMes(ultimoDiaDeLaVentana(ventana));
  return desde === hasta ? `el ${desde}` : `del ${desde} al ${hasta}`;
}

/** «la recuperación del periodo 2» / «la recuperación de fin de año». */
export const etiquetaDeRecuperacion = (tipo: 'PERIODO' | 'ANUAL', periodo?: number | null): string =>
  tipo === 'ANUAL' ? 'la recuperación de fin de año' : `la recuperación del periodo ${periodo ?? '?'}`;
