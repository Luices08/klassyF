import type { PipelineStage } from 'mongoose';
import { integracionDe, IntegracionPeriodo } from './integracionRecuperacion';

/**
 * La nota «efectiva» de un periodo: la que cerró el docente (M12) o, si el estudiante recuperó y el colegio configuró que la recuperación
 * cuenta, la nota resultante de M18. La planilla cerrada nunca se modifica: la recuperación vive aparte y esta regla es la única que las
 * junta, para que el boletín, «Mis notas», el portal del acudiente, la planilla del docente y las estadísticas digan lo mismo.
 */

export interface RecuperacionParaNota {
  nota_resultante: number | null;
  integracion?: Partial<IntegracionPeriodo> | null;
}

/** Una recuperación «solo anotada» (el colegio apagó «cuenta en el boletín») no cambia la nota; una sin resultado tampoco. */
export function recuperacionCuenta(recuperacion: RecuperacionParaNota | null | undefined): recuperacion is RecuperacionParaNota & { nota_resultante: number } {
  return Boolean(recuperacion && recuperacion.nota_resultante !== null && integracionDe(recuperacion.integracion).cuenta_en_boletin);
}

/** La nota del periodo con la recuperación aplicada; sin nota cerrada no hay nota (la recuperación solo existe sobre una cerrada). */
export function notaEfectivaDePeriodo(notaCerrada: number | null, recuperacion: RecuperacionParaNota | null | undefined): number | null {
  if (notaCerrada === null) return null;
  return recuperacionCuenta(recuperacion) ? recuperacion.nota_resultante : notaCerrada;
}

export interface ResumenRecuperacion {
  /** La nota con la que cerró el periodo. */
  nota_original: number;
  /** La nota con la que quedó tras el mejor intento y el efecto que eligió el colegio. */
  nota_resultante: number;
  estado: string;
  /** Falso cuando el colegio configuró que la recuperación solo se anota: la nota efectiva sigue siendo la original. */
  cuenta: boolean;
  detalle: string;
  intentos: number;
  /** Fecha del último intento registrado. */
  fecha: Date | null;
}

interface RecuperacionRegistrada extends RecuperacionParaNota {
  estado: string;
  detalle?: string | null;
  intentos: ReadonlyArray<{ fecha: Date }>;
}

/** Lo que se muestra de una recuperación junto a la nota; null si no hay nada que mostrar (sin recuperación o sin intentos). */
export function resumenDeRecuperacion(notaOriginal: number | null, recuperacion: RecuperacionRegistrada | null | undefined): ResumenRecuperacion | null {
  if (notaOriginal === null || !recuperacion || recuperacion.nota_resultante === null) return null;
  const fechas = recuperacion.intentos.map((i) => i.fecha.getTime());
  return {
    nota_original: notaOriginal,
    nota_resultante: recuperacion.nota_resultante,
    estado: recuperacion.estado,
    cuenta: recuperacionCuenta(recuperacion),
    detalle: recuperacion.detalle ?? '',
    intentos: recuperacion.intentos.length,
    fecha: fechas.length > 0 ? new Date(Math.max(...fechas)) : null,
  };
}

/**
 * La nota final del año de una asignatura: la definitiva ponderada de los periodos o, si la perdió y recuperó al final del año, la nota
 * con la que quedó. Una asignatura aprobada no cambia aunque tenga una recuperación anotada.
 */
export function notaFinalDelAnio(definitiva: number | null, aprobatoria: number, recuperacionAnual: RecuperacionParaNota | null | undefined): number | null {
  if (definitiva === null) return null;
  const perdida = definitiva < aprobatoria;
  return perdida && recuperacionAnual && recuperacionAnual.nota_resultante !== null ? recuperacionAnual.nota_resultante : definitiva;
}

/**
 * Etapas de agregación de Mongo para consultas sobre `CalificacionAsignatura` que necesitan la nota efectiva: dejan en `nota_efectiva` la
 * nota del periodo con la recuperación aplicada (la misma regla de `notaEfectivaDePeriodo`). Van después de filtrar a notas cerradas.
 */
export function etapasNotaEfectiva(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: 'recuperacions',
        let: { clase: '$teacher_assignment_id', estudiante: '$student_id', periodo: '$periodo_numero' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$teacher_assignment_id', '$$clase'] },
                  { $eq: ['$student_id', '$$estudiante'] },
                  { $eq: ['$tipo', 'PERIODO'] },
                  { $eq: ['$periodo_numero', '$$periodo'] },
                  { $ne: ['$nota_resultante', null] },
                  { $ne: ['$integracion.cuenta_en_boletin', false] },
                ],
              },
            },
          },
          { $project: { nota_resultante: 1 } },
          { $limit: 1 },
        ],
        as: '_recuperacion',
      },
    },
    {
      $addFields: {
        nota_efectiva: { $ifNull: [{ $arrayElemAt: ['$_recuperacion.nota_resultante', 0] }, '$resultado.nota_asignatura'] },
      },
    },
  ];
}
