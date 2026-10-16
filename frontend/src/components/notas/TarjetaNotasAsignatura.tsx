import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatoDiaCorto } from '../../lib/actividades';
import type { AsignaturaDeMisNotas, CasillaDeMisNotas } from '../../hooks/useNotas';
import { Chip, DesempenoBadge, EstadoEntregaBadge, TipoActividadChip } from '../ui/Badge';
import { Card } from '../ui/Card';

export const formatoNota = (nota: number | null): string => (nota === null ? '—' : nota.toFixed(2));

/** Rojo solo cuando la nota está por debajo de la aprobatoria del colegio; el resto va en el color de título. */
export const colorDeNota = (nota: number | null, aprobatoria: number): string => (nota !== null && aprobatoria > 0 && nota < aprobatoria ? 'text-danger' : 'text-ink');

interface TarjetaNotasAsignaturaProps {
  asignatura: AsignaturaDeMisNotas;
  aprobatoria: number;
  /** El texto se dirige a la familia (portal del acudiente) en lugar de al estudiante. */
  paraFamilia?: boolean;
}

const AVISO_PRESENCIAL = 'Es una tarea presencial: se trabaja y se califica en clase, no hay nada que entregar en la plataforma.';

/**
 * Una casilla de nota. En «Mis notas» el estudiante toca una actividad virtual y va a su página; una tarea presencial no tiene
 * página (se trabaja en clase), así que solo explica que no hay nada que entregar.
 */
function FilaCasilla({ casilla, aprobatoria, enlazar }: { casilla: CasillaDeMisNotas; aprobatoria: number; enlazar: boolean }) {
  const [aviso, setAviso] = useState(false);
  const esActividad = enlazar && casilla.tipo === 'ACTIVIDAD';
  const titulo =
    esActividad && casilla.requiere_entrega ? (
      <Link to={`/mis-actividades/${casilla.id}`} className="text-sm font-medium text-primary hover:underline">
        {casilla.titulo}
      </Link>
    ) : esActividad ? (
      <button type="button" aria-expanded={aviso} onClick={() => setAviso((v) => !v)} className="text-sm font-medium text-ink hover:underline">
        {casilla.titulo}
      </button>
    ) : (
      <span className="text-sm font-medium text-ink">{casilla.titulo}</span>
    );

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {titulo}
            {casilla.tipo_actividad && <TipoActividadChip value={casilla.tipo_actividad} />}
            {casilla.entrega && casilla.nota === null && <EstadoEntregaBadge value={casilla.entrega} />}
          </div>
          <p className="text-xs text-muted">
            Pesa {casilla.peso_efectivo}% del bloque
            {casilla.fecha_entrega ? ` · entrega ${formatoDiaCorto(casilla.fecha_entrega)}` : ''}
          </p>
        </div>
        <span className={`text-sm font-semibold ${casilla.nota === null ? 'text-muted' : colorDeNota(casilla.nota, aprobatoria)}`}>
          {casilla.nota === null ? 'Sin calificar' : formatoNota(casilla.nota)}
        </span>
      </div>
      {aviso && <p className="mt-1.5 rounded-lg bg-soft px-3 py-2 text-xs text-muted">{AVISO_PRESENCIAL}</p>}
    </li>
  );
}

/** Una asignatura con sus bloques del molde y la nota de cada casilla (el estudiante en «Mis notas» y el acudiente en el portal). */
export function TarjetaNotasAsignatura({ asignatura, aprobatoria, paraFamilia = false }: TarjetaNotasAsignaturaProps) {
  const definitiva = asignatura.estado === 'CERRADO' || asignatura.estado === 'DEFINITIVO';
  const docente = asignatura.asignacion?.docente;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ink">{asignatura.asignacion?.asignatura?.nombre ?? 'Asignatura'}</h2>
          {docente && (
            <p className="text-sm text-muted">
              {docente.nombre} {docente.apellido}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {asignatura.desempeno && <DesempenoBadge value={asignatura.desempeno} />}
          <Chip tone={definitiva ? 'blue' : 'orange'}>{definitiva ? 'Nota final' : asignatura.nota_asignatura === null ? 'Sin notas aún' : 'Provisional'}</Chip>
          <span className={`text-h2 ${colorDeNota(asignatura.nota_asignatura, aprobatoria)}`}>{formatoNota(asignatura.nota_asignatura)}</span>
        </div>
      </div>
      {asignatura.parcial && (
        <p className="mt-2 text-xs text-muted">
          Esta nota se calcula con lo calificado hasta ahora; puede cambiar cuando {paraFamilia ? 'el docente' : 'tu docente'} califique el resto.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {asignatura.bloques.map((bloque) => (
          <div key={bloque.clave} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 rounded-t-lg bg-primary-soft px-4 py-2">
              <p className="text-sm font-semibold text-ink">
                {bloque.nombre} <span className="font-normal text-muted">· vale {bloque.porcentaje}% de la nota</span>
              </p>
              <p className={`text-sm font-semibold ${colorDeNota(bloque.nota, aprobatoria)}`}>{formatoNota(bloque.nota)}</p>
            </div>
            {bloque.casillas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">{paraFamilia ? 'El docente' : 'Tu docente'} aún no ha registrado notas en este bloque.</p>
            ) : (
              <ul className="divide-y divide-border">
                {bloque.casillas.map((casilla) => (
                  <FilaCasilla key={casilla.id} casilla={casilla} aprobatoria={aprobatoria} enlazar={!paraFamilia} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
