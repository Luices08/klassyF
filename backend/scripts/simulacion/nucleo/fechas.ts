/**
 * Fechas como las guarda el sistema: un día de calendario es medianoche UTC y una hora del día es hora de Colombia (UTC-5).
 */
const DIA_MS = 86_400_000;
const DESFASE_COLOMBIA_MS = 5 * 3_600_000;

/** «MM-DD» del año dado, a medianoche UTC. */
export function diaDelAnio(anio: number, mesDia: string): Date {
  const [mes, dia] = mesDia.split('-').map(Number);
  if (!mes || !dia) throw new Error(`Fecha «${mesDia}» inválida: se espera MM-DD.`);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * DIA_MS);
}

/** Un día de calendario a la hora «HH:MM» de Colombia, como instante. */
export function aLaHora(dia: Date, horaMinuto: string): Date {
  const [h, m] = horaMinuto.split(':').map(Number);
  return new Date(dia.getTime() + DESFASE_COLOMBIA_MS + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

/** 1 = lunes … 7 = domingo. */
export function diaIso(dia: Date): number {
  const d = dia.getUTCDay();
  return d === 0 ? 7 : d;
}

export function isoDia(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function pascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** El lunes siguiente (o el mismo día si ya es lunes): Ley 51 de 1983, «Ley Emiliani». */
function alLunes(fecha: Date): Date {
  const iso = diaIso(fecha);
  return iso === 1 ? fecha : sumarDias(fecha, 8 - iso);
}

export interface Festivo {
  fecha: Date;
  nombre: string;
}

/** Festivos nacionales de Colombia. */
export function festivosColombia(anio: number): Festivo[] {
  const p = pascua(anio);
  const fijo = (md: string, nombre: string): Festivo => ({ fecha: diaDelAnio(anio, md), nombre });
  const trasladable = (md: string, nombre: string): Festivo => ({ fecha: alLunes(diaDelAnio(anio, md)), nombre });
  return [
    fijo('01-01', 'Año Nuevo'),
    trasladable('01-06', 'Reyes Magos'),
    trasladable('03-19', 'San José'),
    { fecha: sumarDias(p, -3), nombre: 'Jueves Santo' },
    { fecha: sumarDias(p, -2), nombre: 'Viernes Santo' },
    fijo('05-01', 'Día del Trabajo'),
    { fecha: sumarDias(p, 43), nombre: 'Ascensión del Señor' },
    { fecha: sumarDias(p, 64), nombre: 'Corpus Christi' },
    { fecha: sumarDias(p, 71), nombre: 'Sagrado Corazón' },
    trasladable('06-29', 'San Pedro y San Pablo'),
    fijo('07-20', 'Independencia'),
    fijo('08-07', 'Batalla de Boyacá'),
    trasladable('08-15', 'Asunción de la Virgen'),
    trasladable('10-12', 'Día de la Raza'),
    trasladable('11-01', 'Todos los Santos'),
    trasladable('11-11', 'Independencia de Cartagena'),
    fijo('12-08', 'Inmaculada Concepción'),
    fijo('12-25', 'Navidad'),
  ].sort((x, y) => x.fecha.getTime() - y.fecha.getTime());
}

/** Lunes a viernes de la Semana Santa (receso escolar habitual). */
export function semanaSanta(anio: number): { inicio: Date; fin: Date } {
  const p = pascua(anio);
  return { inicio: sumarDias(p, -6), fin: sumarDias(p, -2) };
}
