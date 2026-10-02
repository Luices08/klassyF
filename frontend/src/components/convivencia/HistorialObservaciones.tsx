import { useState } from 'react';
import { ApiError } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { useCatalogoConvivencia, useHistorialObservaciones, type ObservacionVista } from '../../hooks/useObservaciones';
import { AnularObservacionDrawer } from './AnularObservacionDrawer';
import { ObservacionDrawer } from './ObservacionDrawer';
import { ObservacionesTimeline } from './ObservacionesTimeline';

interface Props {
  studentId: string;
  /** Muestra enmendar/anular; el servidor valida el permiso y el plazo de cada una. */
  conAcciones?: boolean;
}

/** Historial de convivencia de un estudiante (vista derivada del Observador), paginado, con auditoría de lectura. */
export function HistorialObservaciones({ studentId, conAcciones = true }: Props) {
  const [pagina, setPagina] = useState(1);
  const historial = useHistorialObservaciones(studentId, pagina);
  const catalogo = useCatalogoConvivencia();
  const [enmendando, setEnmendando] = useState<ObservacionVista | null>(null);
  const [anulando, setAnulando] = useState<ObservacionVista | null>(null);

  if (historial.isLoading) return <Spinner />;
  if (historial.isError) {
    const sinAcceso = historial.error instanceof ApiError && historial.error.status === 404;
    return (
      <Alert tone={sinAcceso ? 'warning' : 'error'}>
        {sinAcceso ? 'No tienes acceso al observador de este estudiante.' : errorMessage(historial.error)}
      </Alert>
    );
  }

  const { data = [], total = 0, limite = 20 } = historial.data ?? {};
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div className="space-y-4">
      <ObservacionesTimeline
        observaciones={data}
        acciones={
          conAcciones
            ? (obs) =>
                obs.estado === 'ACTIVA' && (
                  <span className="flex gap-2">
                    <Button variant="soft-edit" className="px-3 py-1 text-xs" onClick={() => setEnmendando(obs)}>
                      Enmendar
                    </Button>
                    <Button variant="soft-danger" className="px-3 py-1 text-xs" onClick={() => setAnulando(obs)}>
                      Anular
                    </Button>
                  </span>
                )
            : undefined
        }
      />

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Página {pagina} de {paginas} · {total} registros
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="secondary" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </span>
        </div>
      )}

      {catalogo.data && (
        <ObservacionDrawer
          open={Boolean(enmendando)}
          onClose={() => setEnmendando(null)}
          catalogo={catalogo.data}
          observacion={enmendando ?? undefined}
        />
      )}
      <AnularObservacionDrawer observacion={anulando} onClose={() => setAnulando(null)} />
    </div>
  );
}
