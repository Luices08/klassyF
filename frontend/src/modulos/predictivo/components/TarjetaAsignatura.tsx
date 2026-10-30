import { Chip, type Tone } from '../../../components/ui/Badge';
import { ChevronRightIcon } from '../../../components/ui/icons';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { NivelDesempeno } from '../../../types/domain';
import type { AsignaturaAnalizada } from '../hooks/usePredictivo';
import { NOMBRE_FUENTE, nota, notaParaEstePeriodo, porcentaje, TONO_DESEMPENO, TONO_RIESGO } from '../lib/presentacion';

const TEXTO_TONO: Record<Tone, string> = { blue: 'text-primary', green: 'text-success', orange: 'text-warning', red: 'text-danger', neutral: 'text-muted' };
const BORDE_TONO: Record<Tone, string> = { blue: 'border-l-primary', green: 'border-l-success', orange: 'border-l-warning', red: 'border-l-danger', neutral: 'border-l-border' };

export function Desempeno({ nivel, etiqueta }: { nivel: NivelDesempeno | null; etiqueta: string | null }) {
  if (!nivel || !etiqueta) return null;
  return <Chip tone={TONO_DESEMPENO[nivel]}>{etiqueta}</Chip>;
}

interface TarjetaAsignaturaProps {
  a: AsignaturaAnalizada;
  conProbabilidad: boolean;
  decimales: number;
  periodoActual: number | null;
  onAbrir: () => void;
}

/**
 * Una asignatura en una tarjeta compacta: la nota que lleva, la probabilidad de perderla (solo personal) y la nota que necesita en el
 * periodo en curso. Las estadísticas y el FODA se ven al abrirla, para que la cuadrícula no se sature.
 */
export function TarjetaAsignatura({ a, conProbabilidad, decimales, periodoActual, onAbrir }: TarjetaAsignaturaProps) {
  const necesita = notaParaEstePeriodo(a.nota_requerida, periodoActual, decimales);
  const tonoRiesgo: Tone = conProbabilidad && a.riesgo ? TONO_RIESGO[a.riesgo] : a.nivel ? TONO_DESEMPENO[a.nivel] : 'neutral';
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`group flex h-full flex-col gap-3 rounded-xl border border-l-4 border-border bg-surface p-4 text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${BORDE_TONO[tonoRiesgo]}`}
      aria-label={`Ver el detalle de ${a.nombre}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate font-semibold text-ink" title={a.nombre}>
          {a.nombre}
        </h4>
        <Desempeno nivel={a.nivel} etiqueta={a.desempeno} />
      </div>

      <div className={`grid gap-3 ${conProbabilidad ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <p className="text-xs text-muted">Nota actual</p>
          <p className="text-h3 text-ink">{a.nota === null ? '—' : nota(a.nota, decimales)}</p>
        </div>
        {conProbabilidad && (
          <div className="text-right">
            <p className="text-xs text-muted">Prob. de perderla</p>
            <p className={`text-h3 ${TEXTO_TONO[tonoRiesgo]}`}>{porcentaje(a.probabilidad)}</p>
          </div>
        )}
      </div>
      {conProbabilidad && a.probabilidad !== null && a.probabilidad !== undefined && (
        <ProgressBar value={a.probabilidad} max={1} tone={tonoRiesgo} label={`Probabilidad de perder ${a.nombre}`} />
      )}

      <div className="rounded-lg bg-soft px-3 py-2">
        <p className="text-xs text-muted">{necesita.etiqueta}</p>
        {necesita.valor !== null ? (
          <p className="text-sm text-body">
            <span className={`text-base font-semibold ${TEXTO_TONO[necesita.tono]}`}>{necesita.valor}</span> · {necesita.detalle}
          </p>
        ) : (
          <p className={`text-sm font-medium ${TEXTO_TONO[necesita.tono]}`}>{necesita.detalle}</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{conProbabilidad && a.probabilidad_fuente ? NOMBRE_FUENTE[a.probabilidad_fuente] : ''}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary">
          Ver detalle
          <ChevronRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </button>
  );
}
