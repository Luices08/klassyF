import type { Tone } from '../../../components/ui/Badge';
import type { AnalisisEstudiante, AsignaturaAnalizada, EstadoModelo, NivelRiesgo, NotaRequerida } from '../hooks/usePredictivo';

/** Textos y tonos del módulo predictivo; aparte de los componentes para que la vista del personal y la de la familia digan lo mismo. */

export const TONO_RIESGO: Record<NivelRiesgo, Tone> = { BAJO: 'green', MEDIO: 'orange', ALTO: 'red' };
export const NOMBRE_RIESGO: Record<NivelRiesgo, string> = { BAJO: 'Riesgo bajo', MEDIO: 'Riesgo medio', ALTO: 'Riesgo alto' };

export const NOMBRE_ESTADO_MODELO: Record<EstadoModelo, string> = {
  PENDIENTE: 'En cola',
  EN_CURSO: 'Entrenando',
  LISTO: 'Pasó la prueba',
  RECHAZADO: 'No pasó la prueba',
  FALLIDO: 'Falló',
};
export const TONO_ESTADO_MODELO: Record<EstadoModelo, Tone> = { PENDIENTE: 'neutral', EN_CURSO: 'blue', LISTO: 'green', RECHAZADO: 'orange', FALLIDO: 'red' };

export const porcentaje = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);

export const nota = (v: number, decimales: number): string => v.toFixed(decimales);

/** Lo que le falta para aprobar la asignatura, dicho para la familia y el estudiante (sin probabilidades). */
export function textoNotaRequerida(nr: NotaRequerida, decimales: number): { texto: string; tono: Tone } {
  switch (nr.estado) {
    case 'APROBADA':
      return { texto: `Aprobada${nr.definitiva !== null ? ` con ${nota(nr.definitiva, decimales)}` : ''}`, tono: 'green' };
    case 'ASEGURADA':
      return { texto: 'Ya tiene la nota para aprobar', tono: 'green' };
    case 'ALCANZABLE':
      return {
        texto: `Necesita ${nr.nota === null ? '—' : nota(nr.nota, decimales)} en promedio en ${nr.periodos_restantes === 1 ? 'el periodo que falta' : `los ${nr.periodos_restantes} periodos que faltan`}`,
        tono: 'blue',
      };
    case 'NO_ALCANZA':
      return { texto: 'Ya no alcanza la aprobatoria con las notas: queda la recuperación', tono: 'red' };
    case 'PERDIDA':
      return { texto: `Perdida${nr.definitiva !== null ? ` con ${nota(nr.definitiva, decimales)}` : ''}: queda la recuperación`, tono: 'red' };
    default:
      return { texto: 'Aún sin notas cerradas', tono: 'neutral' };
  }
}

/** Con qué se hizo el análisis: los periodos cerrados o, recién abierto el año, el año anterior. */
export function textoCorte(a: Pick<AnalisisEstudiante, 'corte' | 'total_periodos'>): string {
  if (a.corte === 0) return 'Periodo recién abierto: se analiza con lo que pasó el año anterior.';
  if (a.corte >= a.total_periodos) return `Con los ${a.total_periodos} periodos ya cerrados.`;
  return `Con ${a.corte === 1 ? 'el periodo 1 cerrado' : `los periodos 1 a ${a.corte} cerrados`} de ${a.total_periodos}.`;
}

const URGENCIA: Record<NotaRequerida['estado'], number> = { NO_ALCANZA: 0, PERDIDA: 1, ALCANZABLE: 2, SIN_DATOS: 3, ASEGURADA: 4, APROBADA: 5 };

/** Primero lo que necesita atención: el personal por probabilidad; la familia por lo que falta y la nota. */
export function ordenarAsignaturas(asignaturas: AsignaturaAnalizada[], conProbabilidad: boolean): AsignaturaAnalizada[] {
  return [...asignaturas].sort((a, b) => {
    if (conProbabilidad && (a.probabilidad ?? -1) !== (b.probabilidad ?? -1)) return (b.probabilidad ?? -1) - (a.probabilidad ?? -1);
    const u = URGENCIA[a.nota_requerida.estado] - URGENCIA[b.nota_requerida.estado];
    if (u !== 0) return u;
    if ((a.nota ?? 99) !== (b.nota ?? 99)) return (a.nota ?? 99) - (b.nota ?? 99);
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
