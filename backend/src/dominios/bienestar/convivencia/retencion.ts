/** Fecha antes de la cual un registro ya cumplió su plazo de conservación (a medianoche UTC, como las demás fechas de calendario). */
export function fechaLimiteRetencion(anios: number, hoy: Date): Date {
  const limite = new Date(hoy);
  limite.setUTCFullYear(limite.getUTCFullYear() - anios);
  return limite;
}
