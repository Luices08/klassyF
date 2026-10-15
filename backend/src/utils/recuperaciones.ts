import {
  EFECTOS_RECUPERACION,
  EfectoRecuperacion,
  EstadoRecuperacion,
  MAX_INTENTOS_RECUPERACION,
  MOMENTOS_RECUPERACION,
  MomentoRecuperacion,
  TipoRecuperacion,
} from '../constants/recuperaciones';
import { IntegracionPeriodo, INTEGRACION_INICIAL, validarIntegracion } from './integracionRecuperacion';
import { finDelDia, inicioDelDia, PeriodoCalendario, EventoCalendario } from './calendarioAcademico';

/** Funciones puras de M18 (sin Mongoose): la política del colegio, la nota que resulta de recuperar y la ventana de fechas. */

export interface ReglaPeriodo {
  periodo_numero: number;
  aplica: boolean;
  momento: MomentoRecuperacion;
}

export interface PoliticaPeriodo {
  /** Con el modo `NOTA_FINAL` es lo que decide la nota; con los demás modos la nota sale de recalcular las casillas. */
  efecto: EfectoRecuperacion;
  max_intentos: number;
  integracion: IntegracionPeriodo;
}

export interface PoliticaAnual {
  aplica: boolean;
  efecto: EfectoRecuperacion;
  max_intentos: number;
  /** Con más asignaturas perdidas que esto el estudiante no entra a recuperación anual; 0 = sin tope. */
  max_asignaturas_pendientes: number;
}

export interface PoliticaRecuperacion {
  periodos: ReglaPeriodo[];
  periodo: PoliticaPeriodo;
  anual: PoliticaAnual;
  texto_siee: string;
}

/** Punto de partida cuando el colegio aún no configuró nada: todo aplica, al terminar cada periodo. Es editable. */
export function politicaInicial(numerosPeriodos: readonly number[]): PoliticaRecuperacion {
  return {
    periodos: numerosPeriodos.map((periodo_numero) => ({ periodo_numero, aplica: true, momento: 'FIN_PERIODO' as const })),
    periodo: { efecto: 'REEMPLAZA', max_intentos: 1, integracion: { ...INTEGRACION_INICIAL } },
    anual: { aplica: true, efecto: 'LIMITA_A_APROBATORIA', max_intentos: 1, max_asignaturas_pendientes: 0 },
    texto_siee: '',
  };
}

/** Si el año cambió de periodos, conserva las reglas que siguen existiendo y agrega las que faltan con el valor de partida. */
export function ajustarReglasAPeriodos(reglas: readonly ReglaPeriodo[], numerosPeriodos: readonly number[]): ReglaPeriodo[] {
  return numerosPeriodos.map(
    (n) => reglas.find((r) => r.periodo_numero === n) ?? { periodo_numero: n, aplica: true, momento: 'FIN_PERIODO' as const }
  );
}

/**
 * Valida la política contra los periodos del año. El último periodo no tiene «periodo siguiente», así que no puede
 * recuperarse «al iniciar el siguiente»: quien necesite diferirlo usa la recuperación de fin de año.
 */
export function validarPolitica(
  politica: PoliticaRecuperacion,
  numerosPeriodos: readonly number[],
  clavesBloques?: readonly string[]
): string | null {
  const ultimo = Math.max(...numerosPeriodos);
  const vistos = new Set<number>();
  for (const regla of politica.periodos) {
    if (!numerosPeriodos.includes(regla.periodo_numero)) return `El año lectivo no tiene el periodo ${regla.periodo_numero}.`;
    if (vistos.has(regla.periodo_numero)) return `El periodo ${regla.periodo_numero} está repetido en la política.`;
    vistos.add(regla.periodo_numero);
    if (!MOMENTOS_RECUPERACION.includes(regla.momento)) return `Momento de recuperación inválido en el periodo ${regla.periodo_numero}.`;
    if (regla.aplica && regla.momento === 'INICIO_SIGUIENTE_PERIODO' && regla.periodo_numero === ultimo) {
      return `El periodo ${ultimo} es el último del año: no tiene periodo siguiente donde recuperarlo. Usa «Al finalizar el periodo» o la recuperación de fin de año.`;
    }
  }
  const faltantes = numerosPeriodos.filter((n) => !vistos.has(n));
  if (faltantes.length > 0) return `Falta definir la regla del periodo ${faltantes.join(', ')}.`;

  for (const [nombre, efecto, intentos] of [
    ['de periodo', politica.periodo.efecto, politica.periodo.max_intentos],
    ['anual', politica.anual.efecto, politica.anual.max_intentos],
  ] as const) {
    if (!EFECTOS_RECUPERACION.includes(efecto)) return `El efecto en la nota de la recuperación ${nombre} no es válido.`;
    if (!Number.isInteger(intentos) || intentos < 1 || intentos > MAX_INTENTOS_RECUPERACION) {
      return `Los intentos de la recuperación ${nombre} deben ser un entero entre 1 y ${MAX_INTENTOS_RECUPERACION}.`;
    }
  }
  const problemaIntegracion = validarIntegracion(politica.periodo.integracion, clavesBloques);
  if (problemaIntegracion) return problemaIntegracion;
  if (!Number.isInteger(politica.anual.max_asignaturas_pendientes) || politica.anual.max_asignaturas_pendientes < 0) {
    return 'El máximo de asignaturas pendientes debe ser un entero mayor o igual a 0.';
  }
  return null;
}

export function reglaDePeriodo(politica: PoliticaRecuperacion, periodoNumero: number): ReglaPeriodo | null {
  return politica.periodos.find((r) => r.periodo_numero === periodoNumero) ?? null;
}

export function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** Una nota por debajo de la aprobatoria es lo que obliga a recuperar. */
export function necesitaRecuperar(nota: number, notaAprobatoria: number): boolean {
  return nota < notaAprobatoria;
}

export interface EntradaNotaTrasRecuperar {
  efecto: EfectoRecuperacion;
  notaOriginal: number;
  notaRecuperacion: number;
  notaAprobatoria: number;
  decimales: number;
}

/** La nota con la que queda el estudiante después de recuperar, según lo que el colegio eligió. Nunca se lanza una nota fuera de [original…]. */
export function notaTrasRecuperar(entrada: EntradaNotaTrasRecuperar): number {
  const { efecto, notaOriginal, notaRecuperacion, notaAprobatoria, decimales } = entrada;
  let nota: number;
  switch (efecto) {
    case 'REEMPLAZA':
      nota = notaRecuperacion;
      break;
    case 'LIMITA_A_APROBATORIA':
      nota = Math.min(notaRecuperacion, notaAprobatoria);
      break;
    case 'PROMEDIA':
      nota = (notaOriginal + notaRecuperacion) / 2;
      break;
    case 'LA_MAYOR':
      nota = Math.max(notaOriginal, notaRecuperacion);
      break;
  }
  return redondear(nota, decimales);
}

/** El mejor intento es el que cuenta (repetir nunca perjudica al estudiante). */
export function mejorNota(notas: readonly number[]): number | null {
  return notas.length === 0 ? null : Math.max(...notas);
}

export function estadoDeRecuperacion(notaResultante: number | null, notaAprobatoria: number): EstadoRecuperacion {
  if (notaResultante === null) return 'PENDIENTE';
  return notaResultante >= notaAprobatoria ? 'SUPERADA' : 'NO_SUPERADA';
}

export interface NotaDePeriodo {
  porcentaje: number;
  /** null = ese periodo aún no tiene nota cerrada. */
  nota: number | null;
}

/** La definitiva del año de una asignatura: promedio de los periodos por su porcentaje. Si falta uno no hay definitiva (no se promedia lo que falta). */
export function notaAnual(periodos: readonly NotaDePeriodo[], decimales: number): number | null {
  if (periodos.length === 0 || periodos.some((p) => p.nota === null)) return null;
  const totalPorcentaje = periodos.reduce((suma, p) => suma + p.porcentaje, 0);
  if (totalPorcentaje <= 0) return null;
  const ponderada = periodos.reduce((suma, p) => suma + (p.nota as number) * p.porcentaje, 0) / totalPorcentaje;
  return redondear(ponderada, decimales);
}

export interface VentanaRecuperacion {
  abierta: boolean;
  /** Por qué no está abierta (o null si lo está). */
  motivo: string | null;
  desde: Date | null;
  hasta: Date | null;
}

interface EntradaVentana {
  tipo: TipoRecuperacion;
  periodoNumero: number;
  momento: MomentoRecuperacion;
  periodos: readonly PeriodoCalendario[];
  eventos: readonly EventoCalendario[];
  ahora: Date;
}

const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/**
 * Decide si hoy se pueden registrar resultados. La ventana sale del calendario del año (M05: eventos `RECUPERACION_PERIODO` o
 * `RECUPERACION_FINAL`), no de un número quemado, y debe coincidir con el momento que eligió el colegio: una ventana que empieza
 * antes del periodo siguiente es «al finalizar el periodo»; la que empieza con él o después es «al iniciar el siguiente».
 */
export function evaluarVentana(entrada: EntradaVentana): VentanaRecuperacion {
  const { tipo, periodoNumero, momento, periodos, eventos, ahora } = entrada;
  const cerrada = (motivo: string): VentanaRecuperacion => ({ abierta: false, motivo, desde: null, hasta: null });

  const tipoEvento = tipo === 'PERIODO' ? 'RECUPERACION_PERIODO' : 'RECUPERACION_FINAL';
  let candidatos = eventos.filter((e) => e.tipo === tipoEvento);
  if (tipo === 'PERIODO') candidatos = candidatos.filter((e) => e.periodo_numero === periodoNumero);
  const que = tipo === 'PERIODO' ? `la recuperación del periodo ${periodoNumero}` : 'la recuperación de fin de año';
  if (candidatos.length === 0) {
    return cerrada(`El calendario del año lectivo no tiene definida la ventana de ${que}. Créala en «Año lectivo» como evento.`);
  }

  if (tipo === 'PERIODO') {
    const siguiente = periodos.find((p) => p.numero === periodoNumero + 1);
    if (momento === 'INICIO_SIGUIENTE_PERIODO' && !siguiente) {
      return cerrada(`El periodo ${periodoNumero} no tiene periodo siguiente donde recuperarlo.`);
    }
    if (siguiente) {
      const coincide = (e: EventoCalendario): boolean =>
        momento === 'INICIO_SIGUIENTE_PERIODO'
          ? e.fecha_inicio.getTime() >= siguiente.fecha_inicio.getTime()
          : e.fecha_inicio.getTime() < siguiente.fecha_inicio.getTime();
      const coherentes = candidatos.filter(coincide);
      if (coherentes.length === 0) {
        return cerrada(
          `La ventana de ${que} en el calendario no coincide con lo configurado (${
            momento === 'INICIO_SIGUIENTE_PERIODO' ? 'al iniciar el periodo siguiente' : 'al finalizar el periodo'
          }). Ajusta las fechas del evento o la política.`
        );
      }
      candidatos = coherentes;
    }
  }

  const abiertas = candidatos.filter((e) => {
    const desde = inicioDelDia(e.fecha_inicio).getTime();
    const hasta = finDelDia(e.fecha_limite_resultados ?? e.fecha_fin).getTime();
    return ahora.getTime() >= desde && ahora.getTime() <= hasta;
  });
  const e = abiertas[0];
  if (e) {
    return { abierta: true, motivo: null, desde: e.fecha_inicio, hasta: e.fecha_limite_resultados ?? e.fecha_fin };
  }

  const proxima = candidatos
    .filter((e) => inicioDelDia(e.fecha_inicio).getTime() > ahora.getTime())
    .sort((a, b) => a.fecha_inicio.getTime() - b.fecha_inicio.getTime())[0];
  if (proxima) {
    return {
      abierta: false,
      motivo: `La ${que.replace(/^la /, '')} abre el ${dia(proxima.fecha_inicio)}.`,
      desde: proxima.fecha_inicio,
      hasta: proxima.fecha_limite_resultados ?? proxima.fecha_fin,
    };
  }
  const ultima = [...candidatos].sort((a, b) => b.fecha_fin.getTime() - a.fecha_fin.getTime())[0] as EventoCalendario;
  const limite = ultima.fecha_limite_resultados ?? ultima.fecha_fin;
  return { abierta: false, motivo: `La ventana de ${que} cerró el ${dia(limite)}.`, desde: ultima.fecha_inicio, hasta: limite };
}
