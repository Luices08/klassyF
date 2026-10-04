import { useNavigate } from 'react-router-dom';
import { Alert, errorMessage } from '../ui/Alert';
import { EstadoExpedienteBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { NOMBRES_TIPO_EXPEDIENTE, useExpedientes } from '../../hooks/useInclusion';

/**
 * Educación inclusiva en la ficha 360° del estudiante (pestaña «Observador y bienestar»): solo el estado y el acceso al
 * expediente. Lo clínico no se muestra aquí; se abre en el expediente, que decide el acceso por rol y sede.
 */
export function InclusionResumen({ numeroDocumento }: { numeroDocumento: string }) {
  const navigate = useNavigate();
  const lista = useExpedientes({ q: numeroDocumento }, 1);
  const expedientes = (lista.data?.data ?? []).filter((x) => x.estudiante.numero_documento === numeroDocumento);

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Educación inclusiva (PIAR / plan de apoyo)</h3>
      {lista.isLoading && <Spinner />}
      {lista.isError && <Alert tone="error">{errorMessage(lista.error)}</Alert>}
      {lista.data && expedientes.length === 0 && <p className="text-sm text-muted">Sin expediente de inclusión. Las solicitudes de apoyo se atienden en el módulo de Inclusión.</p>}
      <ul className="space-y-2">
        {expedientes.map((x) => (
          <li key={x._id} className="flex items-center justify-between gap-3 rounded-lg bg-soft px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              {x.tipo ? NOMBRES_TIPO_EXPEDIENTE[x.tipo] : 'Expediente'} · {x.grado} {x.grupo}
              <EstadoExpedienteBadge value={x.estado} />
            </span>
            <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => navigate(`/inclusion/expedientes/${x._id}`)}>
              Abrir
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
