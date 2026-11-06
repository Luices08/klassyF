import { useState } from 'react';
import { ApiError } from '../../types/api';
import { Alert, errorMessage } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import { useHistorialObservaciones } from '../../hooks/useObservaciones';
import { AccionesObservacion } from './AccionesObservacion';
import { ObservacionesTimeline } from './ObservacionesTimeline';
import { Paginacion } from '../ui/Paginacion';

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
        <Paginacion pagina={pagina} paginas={paginas} onCambiar={setPagina} resumen={`${total} registros`} />
      )}
    </div>
  );
}
