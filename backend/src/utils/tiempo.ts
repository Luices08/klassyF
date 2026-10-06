const MS_HORA = 3_600_000;

/** El dia de calendario de hoy en Colombia (UTC-5, sin horario de verano), a medianoche UTC como las demas fechas. */
export function hoyColombia(): Date {
  const hoy = new Date(Date.now() - 5 * MS_HORA);
  hoy.setUTCHours(0, 0, 0, 0);
  return hoy;
}

/** Las fechas de la planilla son dias de calendario: `YYYY-MM-DD` -> medianoche UTC, como el calendario de M05. */
export function fechaDeClase(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** ISO 1=lunes ... 7=domingo, el mismo formato de `JornadaOperativa.dias_habiles`. */
export function diaIso(fecha: Date): number {
  return fecha.getUTCDay() === 0 ? 7 : fecha.getUTCDay();
}
