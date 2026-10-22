import type { ResumenRecuperacion } from '../../hooks/useNotas';
import { formatoDiaCorto } from '../../lib/actividades';
import { Chip } from '../ui/Badge';

const formato = (n: number): string => n.toFixed(2);

/** Chip de la recuperación para el encabezado de la asignatura: superada, o intentada sin superarla. */
export function ChipRecuperacion({ recuperacion }: { recuperacion: ResumenRecuperacion }) {
  if (!recuperacion.cuenta) return <Chip tone="neutral">Recuperación anotada</Chip>;
  return recuperacion.estado === 'SUPERADA' ? <Chip tone="green">Recuperada</Chip> : <Chip tone="orange">Recuperación no superada</Chip>;
}

/**
 * La nota anterior y la nueva de una asignatura que se recuperó. El estudiante y su familia ven los dos valores: la planilla cerrada del
 * docente no cambia, así que la nota anterior sigue siendo parte de la historia.
 */
export function FranjaRecuperacion({ recuperacion, paraFamilia }: { recuperacion: ResumenRecuperacion; paraFamilia: boolean }) {
  const quien = paraFamilia ? 'su hijo' : 'tú';
  const intentos = `${recuperacion.intentos} ${recuperacion.intentos === 1 ? 'intento' : 'intentos'}`;
  return (
    <div className="mt-3 rounded-lg bg-soft px-3 py-2 text-xs text-body">
      <p>
        <span className="font-semibold text-ink">Recuperación:</span> nota anterior {formato(recuperacion.nota_original)} → recuperación {formato(recuperacion.nota_resultante)} ·{' '}
        {intentos}
        {recuperacion.fecha ? ` · último registro ${formatoDiaCorto(recuperacion.fecha)}` : ''}.
      </p>
      {!recuperacion.cuenta && (
        <p className="mt-1 text-muted">
          La recuperación quedó anotada, pero el colegio la deja solo como registro: la nota que vale para {quien} sigue siendo {formato(recuperacion.nota_original)}.
        </p>
      )}
      {recuperacion.cuenta && recuperacion.detalle && <p className="mt-1 text-muted">{recuperacion.detalle}</p>}
    </div>
  );
}
