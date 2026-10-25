import { createHash } from 'crypto';
import { MESES_MAXIMOS_ENTRE_SESIONES_ORDINARIAS } from '../constants/convivencia';

export interface Quorum {
  total_miembros: number;
  presentes: number;
  porcentaje_requerido: number;
  alcanzado: boolean;
}

/** Hay quórum si los presentes son, al menos, el porcentaje requerido de los miembros (y al menos uno). */
export function calcularQuorum(total: number, presentes: number, porcentaje: number): Quorum {
  return {
    total_miembros: total,
    presentes,
    porcentaje_requerido: porcentaje,
    alcanzado: total > 0 && presentes > 0 && presentes * 100 >= total * porcentaje,
  };
}

/**
 * Quórum para deliberar un caso: quien está recusado (implicado o con conflicto de interés) no cuenta ni como miembro ni
 * como presente, aunque haya asistido a la sesión (RN-15-11).
 */
export function quorumDeCaso(asistentes: { miembro_id: string; asistio: boolean }[], recusados: string[], porcentaje: number): Quorum {
  const aparta = new Set(recusados);
  const quienesDeliberan = asistentes.filter((a) => !aparta.has(a.miembro_id));
  return calcularQuorum(quienesDeliberan.length, quienesDeliberan.filter((a) => a.asistio).length, porcentaje);
}

export interface SesionParaPeriodicidad {
  tipo: string;
  fecha: Date;
  estado: string;
}

export interface PeriodicidadComite {
  /** Fecha de la última sesión ordinaria con acta firmada. */
  ultima_ordinaria: Date | null;
  /** La próxima sesión ordinaria ya convocada, si la hay. */
  proxima_programada: Date | null;
  /** Fecha desde la cual se incumple el mínimo de la norma (la última sesión, o el inicio del año si no hubo ninguna, más dos meses). */
  limite: Date | null;
  vencida: boolean;
  meses_maximos: number;
}

const sumarMeses = (fecha: Date, meses: number) => new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + meses, fecha.getUTCDate()));

/**
 * Si el comité cumple la periodicidad mínima de la norma (una sesión ordinaria cada dos meses, Decreto 1965 art. 23). Cuenta desde la última ordinaria o, si aún no hubo
 * ninguna, desde el inicio del año lectivo. Una sesión ya convocada para más adelante no «salva» el plazo: se informa como `proxima_programada`.
 */
export function periodicidadDelComite(sesiones: readonly SesionParaPeriodicidad[], hoy: Date, inicioAnio: Date | null): PeriodicidadComite {
  const ordinarias = sesiones.filter((s) => s.tipo === 'ORDINARIA' && s.estado !== 'ANULADA');
  const realizadas = ordinarias.filter((s) => s.estado === 'FIRMADA' && s.fecha.getTime() <= hoy.getTime()).map((s) => s.fecha.getTime());
  const futuras = ordinarias.filter((s) => s.estado !== 'FIRMADA' && s.fecha.getTime() > hoy.getTime()).map((s) => s.fecha.getTime());
  const ultima = realizadas.length > 0 ? new Date(Math.max(...realizadas)) : null;
  const proxima = futuras.length > 0 ? new Date(Math.min(...futuras)) : null;
  const referencia = ultima ?? inicioAnio;
  const limite = referencia ? sumarMeses(referencia, MESES_MAXIMOS_ENTRE_SESIONES_ORDINARIAS) : null;
  return {
    ultima_ordinaria: ultima,
    proxima_programada: proxima,
    limite,
    vencida: limite !== null && hoy.getTime() > limite.getTime(),
    meses_maximos: MESES_MAXIMOS_ENTRE_SESIONES_ORDINARIAS,
  };
}

/** JSON con las claves ordenadas: el mismo contenido da siempre la misma cadena, sin importar el orden de los campos. */
export function serializacionEstable(valor: unknown): string {
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map(serializacionEstable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    const claves = Object.keys(objeto)
      .filter((k) => objeto[k] !== undefined)
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${serializacionEstable(objeto[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
}

/** Huella SHA-256 del contenido del acta al firmarla: cualquier cambio posterior en la base se detecta recalculándola. */
export function hashDeActa(contenido: unknown): string {
  return createHash('sha256').update(serializacionEstable(contenido)).digest('hex');
}
