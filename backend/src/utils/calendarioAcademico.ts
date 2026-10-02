import { SEMANAS_MINIMAS_ANIO_LECTIVO } from '../constants/anioLectivo';
import { TIPOS_EVENTO_NO_LECTIVO, TipoEventoCalendario } from '../constants/enums';

/**
 * Funciones puras del calendario academico (M05). Las fechas de calendario
 * (inicio/fin de periodo, recesos, ventanas de notas) se guardan a medianoche
 * UTC del dia elegido (lo que produce `new Date('YYYY-MM-DD')`); por eso los
 * "dias" aqui se recorren en UTC y solo al comparar contra "ahora" se corrige
 * al horario de Colombia.
 */

const MS_DIA = 86_400_000;
// Colombia no tiene horario de verano: UTC-5 todo el año.
const OFFSET_COLOMBIA_MS = 5 * 3_600_000;

export interface RangoFechas {
  fecha_inicio: Date;
  fecha_fin: Date;
}

export interface PeriodoCalendario extends RangoFechas {
  numero: number;
  fecha_apertura_notas?: Date | null;
  fecha_cierre_notas?: Date | null;
}

export interface EventoCalendario extends RangoFechas {
  tipo: TipoEventoCalendario;
  nombre: string;
  periodo_numero?: number | null;
  fecha_limite_resultados?: Date | null;
}

export interface CalendarioSede {
  sede_id: { toString(): string };
  periodos: PeriodoCalendario[];
}

export interface CalendarioValidable extends RangoFechas {
  periodos: readonly PeriodoCalendario[];
  eventos: readonly EventoCalendario[];
  calendarios_sede: readonly CalendarioSede[];
}

/** Instante en que empieza el dia de calendario `fecha` en Colombia. */
export function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getTime() + OFFSET_COLOMBIA_MS);
}

/** Ultimo instante del dia de calendario `fecha` en Colombia (el cierre es inclusivo). */
export function finDelDia(fecha: Date): Date {
  return new Date(fecha.getTime() + MS_DIA + OFFSET_COLOMBIA_MS - 1);
}

function enRango(dia: number, rango: RangoFechas): boolean {
  return dia >= rango.fecha_inicio.getTime() && dia <= rango.fecha_fin.getTime();
}

/** Dentro de un receso, vacaciones o jornada de desarrollo institucional. */
export function hayEventoNoLectivo(dia: Date, eventos: readonly EventoCalendario[]): boolean {
  const t = dia.getTime();
  return eventos.some((e) => TIPOS_EVENTO_NO_LECTIVO.includes(e.tipo) && enRango(t, e));
}

/**
 * Un dia es lectivo si es de lunes a viernes y no cae dentro de un receso,
 * vacaciones o jornada de desarrollo institucional. M13 (asistencia) lo usa
 * para no exigir lista ni contar inasistencias en dias no lectivos.
 */
export function esDiaLectivo(dia: Date, eventos: readonly EventoCalendario[]): boolean {
  const diaSemana = dia.getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !hayEventoNoLectivo(dia, eventos);
}

function contarDiasLectivos(rango: RangoFechas, eventos: readonly EventoCalendario[]): number {
  let dias = 0;
  for (let t = rango.fecha_inicio.getTime(); t <= rango.fecha_fin.getTime(); t += MS_DIA) {
    if (esDiaLectivo(new Date(t), eventos)) dias += 1;
  }
  return dias;
}

const redondear1 = (n: number): number => Math.round(n * 10) / 10;

export interface ResumenSemanas {
  semanas_minimas: number;
  semanas_lectivas: number;
  semanas_faltantes: number;
  cumple_minimo: boolean;
  semanas_por_periodo: Array<{ numero: number; semanas: number }>;
}

/**
 * Semanas de trabajo academico efectivo: dias lectivos de cada periodo
 * (lunes a viernes, sin recesos/vacaciones/desarrollo institucional) / 5.
 */
export function calcularResumenSemanas(
  periodos: readonly PeriodoCalendario[],
  eventos: readonly EventoCalendario[]
): ResumenSemanas {
  const dias = periodos.map((p) => ({ numero: p.numero, dias: contarDiasLectivos(p, eventos) }));
  const totalSemanas = redondear1(dias.reduce((sum, d) => sum + d.dias, 0) / 5);

  return {
    semanas_minimas: SEMANAS_MINIMAS_ANIO_LECTIVO,
    semanas_lectivas: totalSemanas,
    semanas_faltantes: Math.max(0, redondear1(SEMANAS_MINIMAS_ANIO_LECTIVO - totalSemanas)),
    cumple_minimo: totalSemanas >= SEMANAS_MINIMAS_ANIO_LECTIVO,
    semanas_por_periodo: dias.map((d) => ({ numero: d.numero, semanas: redondear1(d.dias / 5) })),
  };
}

/**
 * Periodos tal como aplican a una sede: los del calendario institucional,
 * reemplazando fechas y ventana de notas por las de la sede cuando esta tiene
 * un calendario propio para ese numero de periodo (herencia por defecto).
 */
export function periodosEfectivos<P extends PeriodoCalendario>(
  periodos: readonly P[],
  calendarioSede?: CalendarioSede | null
): PeriodoCalendario[] {
  return periodos.map((p) => {
    const propio = calendarioSede?.periodos.find((c) => c.numero === p.numero);
    return {
      numero: p.numero,
      fecha_inicio: propio?.fecha_inicio ?? p.fecha_inicio,
      fecha_fin: propio?.fecha_fin ?? p.fecha_fin,
      fecha_apertura_notas: propio ? (propio.fecha_apertura_notas ?? null) : (p.fecha_apertura_notas ?? null),
      fecha_cierre_notas: propio ? (propio.fecha_cierre_notas ?? null) : (p.fecha_cierre_notas ?? null),
    };
  });
}

export interface VentanaNotas {
  apertura: Date | null;
  cierre: Date | null;
}

/** Instantes exactos entre los que se admiten notas; null = sin limite en ese extremo. */
export function ventanaNotas(periodo: PeriodoCalendario): VentanaNotas {
  return {
    apertura: periodo.fecha_apertura_notas ? inicioDelDia(periodo.fecha_apertura_notas) : null,
    cierre: periodo.fecha_cierre_notas ? finDelDia(periodo.fecha_cierre_notas) : null,
  };
}

function formatoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function validarPeriodos(
  etiqueta: string,
  periodos: readonly PeriodoCalendario[],
  anio: RangoFechas
): string | null {
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);

  for (const p of ordenados) {
    if (p.fecha_fin < p.fecha_inicio) return `${etiqueta}: el periodo ${p.numero} termina antes de empezar.`;
    if (!enRango(p.fecha_inicio.getTime(), anio) || !enRango(p.fecha_fin.getTime(), anio)) {
      return `${etiqueta}: el periodo ${p.numero} debe quedar dentro del año lectivo (${formatoFecha(anio.fecha_inicio)} a ${formatoFecha(anio.fecha_fin)}).`;
    }
    if (p.fecha_apertura_notas && p.fecha_cierre_notas && p.fecha_cierre_notas < p.fecha_apertura_notas) {
      return `${etiqueta}: en el periodo ${p.numero} el cierre de notas es anterior a la apertura.`;
    }
  }

  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1] as PeriodoCalendario;
    const actual = ordenados[i] as PeriodoCalendario;
    if (actual.fecha_inicio <= anterior.fecha_fin) {
      return `${etiqueta}: el periodo ${actual.numero} empieza antes de que termine el periodo ${anterior.numero}.`;
    }
  }

  return null;
}

/**
 * Coherencia cronologica del calendario de un año lectivo. Devuelve el primer
 * error encontrado (en español, listo para mostrar) o null si es valido.
 */
export function validarCalendario(calendario: CalendarioValidable): string | null {
  const anio: RangoFechas = { fecha_inicio: calendario.fecha_inicio, fecha_fin: calendario.fecha_fin };
  if (anio.fecha_fin < anio.fecha_inicio) return 'El año lectivo termina antes de empezar.';

  const numeros = calendario.periodos.map((p) => p.numero).sort((a, b) => a - b);
  if (numeros.some((n, i) => n !== i + 1)) {
    return 'Los periodos deben numerarse de forma consecutiva desde 1 sin repetir.';
  }

  const errorGlobal = validarPeriodos('Calendario institucional', calendario.periodos, anio);
  if (errorGlobal) return errorGlobal;

  const sedesVistas = new Set<string>();
  for (const cs of calendario.calendarios_sede) {
    const sedeId = cs.sede_id.toString();
    if (sedesVistas.has(sedeId)) return 'Una sede no puede tener dos calendarios propios en el mismo año lectivo.';
    sedesVistas.add(sedeId);

    if (cs.periodos.some((p) => !numeros.includes(p.numero))) {
      return 'El calendario de una sede incluye un periodo que no existe en el año lectivo.';
    }
    const errorSede = validarPeriodos('Calendario de la sede', periodosEfectivos(calendario.periodos, cs), anio);
    if (errorSede) return errorSede;
  }

  for (const e of calendario.eventos) {
    if (e.fecha_fin < e.fecha_inicio) return `"${e.nombre}" termina antes de empezar.`;
    if (!enRango(e.fecha_inicio.getTime(), anio) || !enRango(e.fecha_fin.getTime(), anio)) {
      return `"${e.nombre}" debe quedar dentro del año lectivo.`;
    }
    if (e.tipo === 'RECUPERACION_PERIODO' && (!e.periodo_numero || !numeros.includes(e.periodo_numero))) {
      return `"${e.nombre}" es una recuperación de periodo y requiere un periodo existente.`;
    }
    if (e.fecha_limite_resultados && e.fecha_limite_resultados < e.fecha_fin) {
      return `"${e.nombre}": el plazo para registrar resultados no puede ser anterior al fin de la ventana.`;
    }
  }

  return null;
}
