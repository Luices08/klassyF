import { useState } from 'react';
import { ApiError } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { useHistorialObservaciones } from '../../hooks/useObservaciones';
import { AccionesObservacion } from './AccionesObservacion';
import { ObservacionesTimeline } from './ObservacionesTimeline';

interface Props {
  studentId: string;
  /** Muestra las acciones (enmendar, anular, compromisos…); el servidor valida el permiso y el plazo de cada una. */
  conAcciones?: boolean;
}

/** Historial de convivencia de un estudiante (vista derivada del Observador), paginado, con auditoría de lectura. */
export function HistorialObservaciones({ studentId, conAcciones = true }: Props) {
  const [pagina, setPagina] = useState(1);
  const historial = useHistorialObservaciones(studentId, pagina);

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
        acciones={conAcciones ? (obs) => <AccionesObservacion observacion={obs} /> : undefined}
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
    </div>
  );
}
