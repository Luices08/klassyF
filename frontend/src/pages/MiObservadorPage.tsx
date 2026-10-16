import { ObservadorFamilia } from '../components/convivencia/ObservadorFamilia';
import { Alert, errorMessage } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { useMiObservador } from '../hooks/useObservaciones';

/** El estudiante ve solo lo suyo: las observaciones que su institución marcó como visibles y sus faltas (de las graves, solo que hay un caso). */
export function MiObservadorPage() {
  const observador = useMiObservador();

  return (
    <div className="space-y-4">
      <PageHeader title="Mi observador" subtitle="Las observaciones y faltas que tus docentes registraron sobre ti." />
      {observador.isLoading && <Spinner />}
      {observador.isError && <Alert tone="error">{errorMessage(observador.error)}</Alert>}
      {observador.data && <ObservadorFamilia registros={observador.data} />}
    </div>
  );
}
