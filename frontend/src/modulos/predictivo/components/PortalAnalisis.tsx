import { Alert, errorMessage } from '../../../components/ui/Alert';
import { Spinner } from '../../../components/ui/Spinner';
import { useAnalisisDeHijo } from '../hooks/usePredictivo';
import { AnalisisEstudiante } from './AnalisisEstudiante';

/** Pestaña del portal del acudiente: el análisis del hijo elegido, igual al que ve el estudiante (FODA y nota que falta, sin porcentajes). */
export function PortalAnalisis({ studentId }: { studentId: string }) {
  const { data, isLoading, isError, error } = useAnalisisDeHijo(studentId);
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) return <Alert tone="info">{errorMessage(error)}</Alert>;
  return <AnalisisEstudiante analisis={data} paraFamilia />;
}
