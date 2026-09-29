import type { ReactNode } from 'react';
import { formatoFechaCalendario, formatoRangoCalendario } from '../../lib/fechas';
import type { Periodo } from '../../types/domain';
import { EstadoPeriodoBadge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface PeriodoCardProps {
  periodo: Periodo;
  semanas?: number;
  /** Botones de gestión (abrir, cerrar, prórroga...): los decide la página según rol y estado. */
  acciones?: ReactNode;
}

/** Tarjeta de un periodo en la línea de tiempo del año lectivo: peso, fechas, ventana de notas y semáforo. */
export function PeriodoCard({ periodo, semanas, acciones }: PeriodoCardProps) {
  const ventana =
    periodo.fecha_apertura_notas || periodo.fecha_cierre_notas
      ? `${formatoFechaCalendario(periodo.fecha_apertura_notas)} – ${formatoFechaCalendario(periodo.fecha_cierre_notas)}`
      : 'Sin ventana definida';

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-h3 text-ink">{periodo.nombre}</h3>
          <EstadoPeriodoBadge value={periodo.estado ?? 'PROGRAMADO'} />
        </div>
        <p className="mt-0.5 text-sm text-muted">{formatoRangoCalendario(periodo.fecha_inicio, periodo.fecha_fin)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-label uppercase tracking-wide text-muted">Peso</dt>
          <dd className="mt-0.5 text-h3 text-primary">{periodo.porcentaje}%</dd>
        </div>
        <div>
          <dt className="text-label uppercase tracking-wide text-muted">Semanas</dt>
          <dd className="mt-0.5 text-h3 text-ink">{semanas ?? '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-label uppercase tracking-wide text-muted">Digitación de notas</dt>
          <dd className="mt-0.5 font-medium text-ink">{ventana}</dd>
        </div>
      </dl>

      {acciones && <div className="mt-auto flex flex-wrap gap-2 pt-1">{acciones}</div>}
    </Card>
  );
}
