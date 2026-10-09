import { Alert, errorMessage } from '../ui/Alert';
import { TipoActividadChip } from '../ui/Badge';
import type { RevisionCalendario } from '../../hooks/useActividades';

interface AlertasCalendarioProps {
  revision: RevisionCalendario | undefined;
  cargando: boolean;
  error: unknown;
}

/**
 * Alerta temprana de la fecha de entrega (prevención de sobrecarga): lo que el calendario del año lectivo y la carga del
 * grupo dicen de ese día, antes de que el docente guarde.
 */
export function AlertasCalendario({ revision, cargando, error }: AlertasCalendarioProps) {
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (cargando && !revision) return <p className="text-xs text-muted">Revisando el calendario…</p>;
  if (!revision) return null;

  const bloqueos = revision.alertas.filter((a) => a.severidad === 'BLOQUEO');
  const advertencias = revision.alertas.filter((a) => a.severidad === 'ADVERTENCIA');

  return (
    <div className="space-y-2">
      {bloqueos.map((a) => (
        <Alert key={a.codigo} tone="error">
          {a.mensaje}
        </Alert>
      ))}
      {advertencias.map((a) => (
        <Alert key={a.codigo} tone="warning">
          {a.mensaje}
        </Alert>
      ))}
      {revision.alertas.length === 0 && <p className="text-xs text-success">Sin choques con el calendario ni con la carga del grupo.</p>}

      {revision.carga_del_dia.length > 0 && (
        <div className="rounded-lg bg-soft p-3">
          <p className="mb-2 text-xs font-semibold text-body">Lo que el grupo ya tiene ese día</p>
          <ul className="space-y-1.5">
            {revision.carga_del_dia.map((c, i) => (
              <li key={`${c.titulo}-${i}`} className="flex flex-wrap items-center gap-2 text-xs text-body">
                <TipoActividadChip value={c.tipo} />
                <span className="font-medium">{c.asignatura}</span>
                <span className="text-muted">· {c.titulo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
