/**
 * Las fechas de calendario del año lectivo (inicio/fin de periodo, recesos, ventanas de notas) el
 * backend las guarda a medianoche UTC del día elegido. Se formatean en UTC: con la zona horaria local
 * de Colombia (UTC-5) `toLocaleDateString()` mostraría el día anterior.
 */
const FORMATO_CALENDARIO = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatoFechaCalendario(iso: string | null | undefined): string {
  return iso ? FORMATO_CALENDARIO.format(new Date(iso)) : '—';
}

export function formatoRangoCalendario(inicio: string, fin: string): string {
  return `${formatoFechaCalendario(inicio)} – ${formatoFechaCalendario(fin)}`;
}

/** Días que faltan para que termine (hora Colombia, UTC-5) el día de calendario `iso`; 0 = vence hoy, negativo = ya venció. */
export function diasHastaFinDelDia(iso: string): number {
  const finDelDia = new Date(iso).getTime() + 86_400_000 + 5 * 3_600_000;
  return Math.ceil((finDelDia - Date.now()) / 86_400_000) - 1;
}

/** Valor para <input type="date">: 'YYYY-MM-DD' (los primeros 10 caracteres del ISO en UTC). */
export function aInputFecha(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** Instantes reales (vencimiento de una prórroga): sí van en hora local. */
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export function formatoFechaHora(iso: string): string {
  return FORMATO_FECHA_HORA.format(new Date(iso));
}

/** Valor para <input type="datetime-local"> (hora local, sin zona) de un instante dado. */
export function aInputFechaHora(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Fecha, en hora local, de un instante registrado por el sistema (creación, emisión…); no es una fecha de calendario del año lectivo. */
export function formatoFechaLocal(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('es-CO') : '—';
}
