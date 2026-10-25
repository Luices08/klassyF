import { Alert, errorMessage } from '../../../components/ui/Alert';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Spinner } from '../../../components/ui/Spinner';
import { AnalisisEstudiante } from '../components/AnalisisEstudiante';
import { useMiAnalisis } from '../hooks/usePredictivo';

/** El estudiante ve su propio análisis (solo con matrícula activa): lo que le falta en cada asignatura y su FODA, sin porcentajes. */
export function MiAnalisisPage() {
  const { data, isLoading, isError, error } = useMiAnalisis();
  return (
    <div className="space-y-4">
      <PageHeader title="Mi análisis" subtitle="Cómo vas en cada asignatura, qué nota te falta para aprobar y en qué enfocarte." />
      {isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {isError && <Alert tone="info">{errorMessage(error)}</Alert>}
      {data && <AnalisisEstudiante analisis={data} paraFamilia />}
    </div>
  );
}
