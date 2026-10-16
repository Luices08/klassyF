import { EstadoActividadEstudiante, MAX_INTENTOS_ENTREGA } from '../constants/actividades';
import type { IEscalaEvaluacion } from '../models/academicYear.model';
import { VentanaEntrega } from './actividades';
import { escalaEfectiva, resolverDesempeno } from './escalaEvaluacion';

/**
 * Reglas puras de las entregas de M11: qué intento cuenta, por qué un estudiante no puede entregar y el análisis estadístico de
 * una actividad. Se prueban sin base de datos; los servicios solo traen los datos y las aplican.
 */

export interface IntentoDeEntrega {
  numero: number;
  fecha_entrega: Date;
}

/**
 * El intento que cuenta: el que el docente eligió como válido; si no eligió ninguno, el último (con un solo intento no hay nada
 * que elegir). `null` = el estudiante no ha entregado.
 */
export function intentoConsiderado<T extends IntentoDeEntrega>(intentos: readonly T[], valido: number | null | undefined): T | null {
  if (intentos.length === 0) return null;
  if (valido != null) return intentos.find((i) => i.numero === valido) ?? null;
  return intentos.reduce((ultimo, i) => (i.numero > ultimo.numero ? i : ultimo));
}

/** Con más de un intento el docente tiene que escoger cuál califica; con uno (o ninguno) no hay nada que decidir. */
export function requiereElegirIntento(intentos: readonly IntentoDeEntrega[], valido: number | null | undefined): boolean {
  return intentos.length > 1 && valido == null;
}

export interface EntradaBloqueoEntrega {
  requiere_entrega: boolean;
  cerrada: boolean;
  estado: EstadoActividadEstudiante;
  intentos: number;
  permite_multiples_entregas: boolean;
  /** Texto de por qué el periodo no admite entregas (cerrado, o cerrado para el grupo); null si las admite. */
  motivo_periodo: string | null;
  ventana: VentanaEntrega;
}

/**
 * Por qué un estudiante no puede entregar ahora (null = puede). Es el único lugar que lo decide: lo usan la bandeja del estudiante
 * para explicarlo y el servidor para rechazar, así que nunca dicen cosas distintas. El plazo personal de un acceso especial abre la
 * actividad cerrada manualmente y vencida, pero no un periodo cerrado ni una nota ya puesta.
 */
export function motivoSinEntrega(entrada: EntradaBloqueoEntrega): string | null {
  const { ventana } = entrada;
  if (!entrada.requiere_entrega) return 'Esta actividad no recibe entregas digitales: tu docente la califica en clase.';
  if (entrada.estado === 'CALIFICADA') return 'La actividad ya fue calificada.';
  if (entrada.motivo_periodo) return entrada.motivo_periodo;
  if (entrada.cerrada && !ventana.acceso_especial) return 'El docente cerró esta actividad.';
  if (!ventana.abierta) return ventana.motivo;
  if (entrada.intentos > 0 && !entrada.permite_multiples_entregas) return 'Ya entregaste esta actividad. Solo se permite una entrega.';
  if (entrada.intentos >= MAX_INTENTOS_ENTREGA) return `Llegaste al máximo de ${MAX_INTENTOS_ENTREGA} entregas para esta actividad.`;
  return null;
}

// --- Análisis estadístico ---

export interface FilaDeAnalisis {
  entrego: boolean;
  estado: EstadoActividadEstudiante;
  nota: number | null;
  con_retraso: boolean;
  intentos: number;
}

export interface AnalisisActividad {
  total_estudiantes: number;
  /** Con entrega registrada (no cuenta a quien solo tiene nota puesta por el docente). */
  entregaron: number;
  sin_entregar: number;
  con_retraso: number;
  con_varios_intentos: number;
  calificados: number;
  por_calificar: number;
  porcentaje_entrega: number;
  porcentaje_calificado: number;
  notas: {
    promedio: number;
    mediana: number;
    minima: number;
    maxima: number;
    aprueban: number;
    pierden: number;
    porcentaje_aprueban: number;
  } | null;
  /** Cuántos estudiantes cayeron en cada nivel de la escala del colegio. */
  distribucion: Array<{ nivel: string; etiqueta: string; cantidad: number; aprobatorio: boolean }>;
}

const redondear = (valor: number, decimales = 2): number => Number(valor.toFixed(decimales));
const porcentaje = (parte: number, total: number): number => (total === 0 ? 0 : redondear((parte / total) * 100, 1));

export function analizarEntregas(filas: readonly FilaDeAnalisis[], escalaGuardada: IEscalaEvaluacion | null): AnalisisActividad {
  const escala = escalaEfectiva(escalaGuardada);
  const total = filas.length;
  const entregaron = filas.filter((f) => f.entrego).length;
  const calificadas = filas.filter((f) => typeof f.nota === 'number');
  const notas = calificadas.map((f) => f.nota as number).sort((a, b) => a - b);

  const niveles = escala.rangos.map((r) => ({ nivel: r.nivel as string, etiqueta: r.etiqueta, cantidad: 0, aprobatorio: r.es_aprobatorio }));
  for (const nota of notas) {
    // Una nota fuera de la escala (datos anteriores a un cambio de escala) cae en el nivel del extremo en vez de romper el análisis.
    const { nivel } = resolverDesempeno(Math.min(Math.max(nota, escala.nota_minima), escala.nota_maxima), escala);
    const fila = niveles.find((n) => n.nivel === nivel);
    if (fila) fila.cantidad += 1;
  }

  let resumen: AnalisisActividad['notas'] = null;
  if (notas.length > 0) {
    const mitad = Math.floor(notas.length / 2);
    const mediana = notas.length % 2 === 0 ? ((notas[mitad - 1] as number) + (notas[mitad] as number)) / 2 : (notas[mitad] as number);
    const aprueban = notas.filter((n) => n >= escala.nota_aprobatoria).length;
    resumen = {
      promedio: redondear(notas.reduce((suma, n) => suma + n, 0) / notas.length),
      mediana: redondear(mediana),
      minima: notas[0] as number,
      maxima: notas[notas.length - 1] as number,
      aprueban,
      pierden: notas.length - aprueban,
      porcentaje_aprueban: porcentaje(aprueban, notas.length),
    };
  }

  return {
    total_estudiantes: total,
    entregaron,
    sin_entregar: total - entregaron,
    con_retraso: filas.filter((f) => f.con_retraso).length,
    con_varios_intentos: filas.filter((f) => f.intentos > 1).length,
    calificados: calificadas.length,
    // Lo que ya entregaron y todavía no tiene nota: el trabajo pendiente del docente.
    por_calificar: filas.filter((f) => f.entrego && typeof f.nota !== 'number').length,
    porcentaje_entrega: porcentaje(entregaron, total),
    porcentaje_calificado: porcentaje(calificadas.length, total),
    notas: resumen,
    distribucion: niveles,
  };
}

// --- Cambios a una actividad ya publicada ---

/** Campos que se comparan para decir qué cambió; el estudiante ve los nombres, nunca los valores. */
export const ETIQUETAS_CAMPOS_ACTIVIDAD: Record<string, string> = {
  titulo: 'el título',
  descripcion: 'la descripción',
  contenido_html: 'la descripción',
  tipo: 'el tipo',
  fecha_apertura: 'la fecha de publicación',
  fecha_entrega: 'la fecha límite',
  requiere_entrega: 'si recibe entrega digital',
  formatos_permitidos: 'los formatos de entrega',
  permite_entrega_tardia: 'la entrega tardía',
  permite_multiples_entregas: 'las entregas múltiples',
  adjuntos: 'los archivos adjuntos',
  videos: 'los videos',
};

export function camposModificados(campos: readonly string[]): string[] {
  return [...new Set(campos.map((c) => ETIQUETAS_CAMPOS_ACTIVIDAD[c]).filter((e): e is string => Boolean(e)))];
}
