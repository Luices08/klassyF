import {
  EstadoAnticipada,
  ModoNotaPeriodo,
  TIPOS_ANTICIPADA,
  TRATAMIENTOS_NOTAS,
  TipoAnticipada,
  TratamientoNotas,
} from '../constants/promocionAnticipada';
import { finDelDia } from './calendarioAcademico';
import { redondear } from './recuperaciones';

// Funciones puras de la promoción anticipada (M19, fase 6): criterios, ventana, requisitos y trato de las notas de los periodos no cursados.

export interface CriterioDeNotas {
  activo: boolean;
  /** Promedio simple de las asignaturas del periodo de evaluación que se exige. */
  promedio_minimo: number;
  /** Nota mínima en cada asignatura; null = no se exige por asignatura. */
  nota_minima_asignatura: number | null;
  /** Solo para reiniciantes: nota mínima en asignaturas que reprobó el año anterior. null = no se exige. */
  nota_minima_asignaturas_reprobadas?: number | null;
}

export interface PasosExigidos {
  concepto_comision: boolean;
  consentimiento_familia: boolean;
  decision_consejo_directivo: boolean;
}

export interface ConfiguracionAnticipada {
  activa: boolean;
  /** Periodo cuyas notas cerradas se evalúan y último en el que se puede iniciar el trámite. */
  periodo_evaluacion: number;
  /** Días después del cierre de ese periodo en que todavía se puede solicitar. */
  dias_ventana_tras_cierre: number;
  /** Grados excluidos donde el SIEE prohíbe la promoción anticipada. */
  grados_excluidos_ids?: string[];
  rendimiento_excepcional: CriterioDeNotas;
  reiniciantes: CriterioDeNotas;
  exige: PasosExigidos;
  tratamiento_notas: TratamientoNotas;
}

/** Valores de partida; cada colegio los ajusta a su SIEE. */
export const CONFIGURACION_ANTICIPADA_INICIAL: ConfiguracionAnticipada = {
  activa: true,
  periodo_evaluacion: 1,
  dias_ventana_tras_cierre: 30,
  grados_excluidos_ids: [],
  rendimiento_excepcional: { activo: true, promedio_minimo: 4.6, nota_minima_asignatura: 4 },
  reiniciantes: { activo: true, promedio_minimo: 4, nota_minima_asignatura: null, nota_minima_asignaturas_reprobadas: null },
  exige: { concepto_comision: true, consentimiento_familia: true, decision_consejo_directivo: true },
  tratamiento_notas: 'NIVELACION',
};

export function validarConfiguracionAnticipada(c: ConfiguracionAnticipada): string | null {
  if (!Number.isInteger(c.periodo_evaluacion) || c.periodo_evaluacion < 1 || c.periodo_evaluacion > 12) return 'El periodo de evaluación debe estar entre 1 y 12.';
  if (!Number.isInteger(c.dias_ventana_tras_cierre) || c.dias_ventana_tras_cierre < 0 || c.dias_ventana_tras_cierre > 365) return 'La ventana después del cierre del periodo va de 0 a 365 días.';
  for (const [nombre, criterio] of [['rendimiento excepcional', c.rendimiento_excepcional], ['reiniciantes', c.reiniciantes]] as const) {
    if (!(criterio.promedio_minimo > 0)) return `El promedio mínimo de ${nombre} debe ser mayor que cero.`;
    if (criterio.nota_minima_asignatura !== null && !(criterio.nota_minima_asignatura > 0)) return `La nota mínima por asignatura de ${nombre} debe ser mayor que cero o quedar vacía.`;
  }
  if (c.reiniciantes.nota_minima_asignaturas_reprobadas !== null && c.reiniciantes.nota_minima_asignaturas_reprobadas !== undefined) {
    if (!(c.reiniciantes.nota_minima_asignaturas_reprobadas > 0)) {
      return 'La nota mínima en asignaturas reprobadas de reiniciantes debe ser mayor que cero o quedar vacía.';
    }
  }
  if (!TRATAMIENTOS_NOTAS.includes(c.tratamiento_notas)) return 'Tratamiento de notas no válido.';
  return null;
}

export interface NotaDeAsignatura {
  subject_id: string;
  nombre: string;
  nota: number | null;
}

export interface ResultadoCriterio {
  cumple: boolean;
  promedio: number | null;
  motivos: string[];
}

/** Aplica el criterio del colegio a las notas cerradas del periodo de evaluación. Sin todas las notas no se decide (nunca se promedia lo que falta). */
export function evaluarCriterio(
  notas: readonly NotaDeAsignatura[],
  criterio: CriterioDeNotas,
  decimales: number,
  asignaturasReprobadasPreviamente?: ReadonlySet<string>
): ResultadoCriterio {
  if (notas.length === 0) return { cumple: false, promedio: null, motivos: ['El estudiante no tiene asignaturas con notas en el periodo.'] };
  const faltan = notas.filter((n) => n.nota === null);
  if (faltan.length > 0) return { cumple: false, promedio: null, motivos: [`Faltan notas cerradas del periodo en: ${faltan.map((n) => n.nombre).join(', ')}.`] };
  const promedio = redondear(notas.reduce((s, n) => s + (n.nota as number), 0) / notas.length, decimales);
  const motivos: string[] = [];
  if (promedio < criterio.promedio_minimo) motivos.push(`Promedio ${promedio} por debajo del mínimo ${criterio.promedio_minimo}.`);
  if (criterio.nota_minima_asignatura !== null) {
    const bajas = notas.filter((n) => (n.nota as number) < (criterio.nota_minima_asignatura as number));
    if (bajas.length > 0) motivos.push(`Por debajo de ${criterio.nota_minima_asignatura} en: ${bajas.map((n) => n.nombre).join(', ')}.`);
  }
  if (criterio.nota_minima_asignaturas_reprobadas != null && asignaturasReprobadasPreviamente && asignaturasReprobadasPreviamente.size > 0) {
    const reprobadasConNotaBaja = notas.filter(
      (n) =>
        (asignaturasReprobadasPreviamente.has(n.subject_id) || asignaturasReprobadasPreviamente.has(n.nombre.trim().toLowerCase())) &&
        n.nota !== null &&
        (n.nota as number) < (criterio.nota_minima_asignaturas_reprobadas as number)
    );
    if (reprobadasConNotaBaja.length > 0) {
      motivos.push(
        `Por debajo de ${criterio.nota_minima_asignaturas_reprobadas} en asignaturas reprobadas el año anterior: ${reprobadasConNotaBaja.map((n) => `${n.nombre} (${n.nota})`).join(', ')}.`
      );
    }
  }
  return { cumple: motivos.length === 0, promedio, motivos };
}

export const criterioDe = (c: ConfiguracionAnticipada, tipo: TipoAnticipada): CriterioDeNotas => (tipo === 'REINICIANTE' ? c.reiniciantes : c.rendimiento_excepcional);

export const esTipoAnticipada = (valor: string): valor is TipoAnticipada => (TIPOS_ANTICIPADA as readonly string[]).includes(valor);

/** Se puede solicitar hasta `dias_ventana_tras_cierre` días después de que termina el periodo de evaluación (cierre inclusivo, hora de Colombia). */
export function ventanaAbierta(periodoFin: Date, diasTrasCierre: number, ahora: Date): boolean {
  return ahora.getTime() <= finDelDia(periodoFin).getTime() + diasTrasCierre * 86_400_000;
}

export interface AvanceDelTramite {
  concepto_favorable: boolean | null;
  consentimiento_otorgado: boolean | null;
  decision_aprobada: boolean | null;
}

/** Lo que aún falta para poder emitir la resolución, según los pasos que el colegio exige. Vacío = lista. */
export function requisitosPendientes(exige: PasosExigidos, avance: AvanceDelTramite): string[] {
  const faltan: string[] = [];
  if (exige.concepto_comision && avance.concepto_favorable !== true) faltan.push('Concepto favorable de la Comisión de Evaluación y Promoción.');
  if (exige.consentimiento_familia && avance.consentimiento_otorgado !== true) faltan.push('Consentimiento de los padres o acudiente.');
  if (exige.decision_consejo_directivo && avance.decision_aprobada !== true) faltan.push('Aprobación del Consejo Directivo.');
  return faltan;
}

/** Un trámite cerrado (rechazado, anulado o aplicado) no admite más pasos. */
export const tramiteAbierto = (estado: EstadoAnticipada): boolean => estado === 'SOLICITADA' || estado === 'LISTA_PARA_RESOLUCION';

export interface AsignaturaNueva {
  subject_id: string;
  nombre: string;
}

export interface NotaPeriodoResuelta {
  subject_id: string;
  nombre: string;
  modo: ModoNotaPeriodo;
  /** Solo en COPIADA: la nota de la misma asignatura en el grado de origen. */
  nota: number | null;
  /** Por qué una asignatura quedó en nivelación aunque el tratamiento era copiar. */
  motivo: string;
}

/**
 * Resuelve, asignatura por asignatura del grado nuevo, qué pasa con los periodos no cursados.
 * En COPIAR_EQUIVALENTES, la asignatura que no existía en el grado de origen (o no tenía nota cerrada) exige nivelación solo para ella.
 */
export function planDeNotasNoCursadas(tratamiento: TratamientoNotas, nuevas: readonly AsignaturaNueva[], origen: readonly NotaDeAsignatura[]): NotaPeriodoResuelta[] {
  const deOrigen = new Map(origen.map((o) => [o.subject_id, o]));
  return nuevas.map((n): NotaPeriodoResuelta => {
    const base = { subject_id: n.subject_id, nombre: n.nombre };
    if (tratamiento === 'DEJAR_SIN_NOTA') return { ...base, modo: 'SIN_NOTA', nota: null, motivo: '' };
    if (tratamiento === 'NIVELACION') return { ...base, modo: 'NIVELACION', nota: null, motivo: '' };
    const equivalente = deOrigen.get(n.subject_id);
    if (!equivalente) return { ...base, modo: 'NIVELACION', nota: null, motivo: 'Asignatura sin equivalente en el grado de origen.' };
    if (equivalente.nota === null) return { ...base, modo: 'NIVELACION', nota: null, motivo: 'La asignatura de origen no tiene nota cerrada para copiar.' };
    return { ...base, modo: 'COPIADA', nota: equivalente.nota, motivo: '' };
  });
}

export interface PeriodoPonderado {
  numero: number;
  porcentaje: number;
}

/**
 * Los periodos que entran al promedio anual de un estudiante: los que no se dejaron sin nota. Quitar un periodo no exige tocar los porcentajes:
 * la definitiva anual normaliza por la suma de los que quedan, así el porcentaje del periodo omitido se reparte entre los restantes en
 * proporción a su propio peso.
 */
export function periodosParaPromediar(periodos: readonly PeriodoPonderado[], omitidos: ReadonlySet<number>): PeriodoPonderado[] {
  return periodos.filter((p) => !omitidos.has(p.numero));
}
