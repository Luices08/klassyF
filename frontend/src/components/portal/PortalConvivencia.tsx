import { useConvivenciaDelHijo } from '../../hooks/usePortal';
import { ObservadorFamilia } from '../convivencia/ObservadorFamilia';
import { Alert, errorMessage } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';

/** Lo que la institución deja ver de la convivencia del estudiante: observaciones visibles y faltas (de las graves, solo que hay un caso y su estado). */
export function PortalConvivencia({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useConvivenciaDelHijo(studentId);
  return (
    <div className="space-y-4">
      {isLoading && <Spinner />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && <ObservadorFamilia registros={data} paraFamilia />}
      <p className="text-xs text-muted">Cada consulta del observador queda registrada por tratarse de datos de un menor de edad.</p>
    </div>
  );
}
