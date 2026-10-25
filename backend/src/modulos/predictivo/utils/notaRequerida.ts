/**
 * La nota que le falta a una asignatura: cuánto necesita, en promedio, en los periodos que aún no cierran para que la definitiva del año
 * llegue a la aprobatoria. Usa la misma regla que la definitiva (`notaAnual` de M18: promedio por porcentaje de los periodos cursados,
 * los exentos salen y su peso se reparte). Pura. No aprovecha el redondeo de la definitiva: pedir la aprobatoria exacta es lo prudente.
 */
import { NotaDePeriodo, notaAnual } from '../../../utils/recuperaciones';

export interface EscalaRequerida {
  minima: number;
  maxima: number;
  aprobatoria: number;
  decimales: number;
}

export type EstadoNotaRequerida = 'APROBADA' | 'PERDIDA' | 'ASEGURADA' | 'ALCANZABLE' | 'NO_ALCANZA' | 'SIN_DATOS';

export interface NotaRequerida {
  estado: EstadoNotaRequerida;
  /** Nota promedio que necesita en los periodos que faltan (solo con ALCANZABLE). */
  nota: number | null;
  /** La definitiva, cuando ya no falta ningún periodo. */
  definitiva: number | null;
  periodos_restantes: number;
}

const techo = (valor: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.ceil(valor * f - 1e-9) / f;
};

export function notaRequerida(periodos: readonly NotaDePeriodo[], escala: EscalaRequerida): NotaRequerida {
  const cursados = periodos.filter((p) => !p.exento);
  const restantes = cursados.filter((p) => p.nota === null);
  if (cursados.length === 0) return { estado: 'SIN_DATOS', nota: null, definitiva: null, periodos_restantes: 0 };
  if (restantes.length === 0) {
    const definitiva = notaAnual(periodos, escala.decimales);
    if (definitiva === null) return { estado: 'SIN_DATOS', nota: null, definitiva: null, periodos_restantes: 0 };
    return { estado: definitiva >= escala.aprobatoria ? 'APROBADA' : 'PERDIDA', nota: null, definitiva, periodos_restantes: 0 };
  }
  const total = cursados.reduce((s, p) => s + p.porcentaje, 0);
  const pesoRestante = restantes.reduce((s, p) => s + p.porcentaje, 0);
  if (total <= 0 || pesoRestante <= 0) return { estado: 'SIN_DATOS', nota: null, definitiva: null, periodos_restantes: restantes.length };
  const acumulado = cursados.reduce((s, p) => s + (p.nota ?? 0) * p.porcentaje, 0);
  const necesaria = techo((escala.aprobatoria * total - acumulado) / pesoRestante, escala.decimales);
  if (necesaria <= escala.minima) return { estado: 'ASEGURADA', nota: null, definitiva: null, periodos_restantes: restantes.length };
  if (necesaria > escala.maxima) return { estado: 'NO_ALCANZA', nota: null, definitiva: null, periodos_restantes: restantes.length };
  return { estado: 'ALCANZABLE', nota: necesaria, definitiva: null, periodos_restantes: restantes.length };
}
