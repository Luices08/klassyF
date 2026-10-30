import { useSearchParams } from 'react-router-dom';
import { Alert, errorMessage } from '../../../components/ui/Alert';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Spinner } from '../../../components/ui/Spinner';
import { TabPanel, Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../../context/AuthContext';
import { AnalisisEstudiante } from '../components/AnalisisEstudiante';
import { BuscadorEstudiante } from '../components/BuscadorEstudiante';
import { PanelModelos } from '../components/PanelModelos';
import { useAnalisisDeEstudiante } from '../hooks/usePredictivo';

function AnalisisElegido({ studentId }: { studentId: string | null }) {
  const { data, isLoading, isError, error } = useAnalisisDeEstudiante(studentId);
  if (!studentId) {
    return (
      <Card>
        <p className="text-sm text-muted">Busca a un estudiante para ver cómo va, qué le falta en cada asignatura y su FODA.</p>
      </Card>
    );
  }
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return <AnalisisEstudiante analisis={data} />;
}

/**
 * Análisis predictivo del personal (administración, coordinación, convivencia, orientación y docentes buscan a cualquier estudiante con
 * matrícula activa). El ADMIN además entrena la IA y elige la versión en uso. El estudiante elegido y la pestaña viven en la URL.
 */
export function PredictivoPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const esAdmin = user?.rol === 'ADMIN';
  const pestana = esAdmin && params.get('pestana') === 'modelos' ? 'modelos' : 'analisis';
  const studentId = params.get('estudiante');
  const cambiar = (cambios: Record<string, string>) => {
    const siguiente: Record<string, string> = { pestana, ...(studentId ? { estudiante: studentId } : {}), ...cambios };
    setParams(siguiente, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Análisis predictivo" subtitle="Riesgo de perder cada asignatura, nota que falta y FODA del estudiante, calculados en el servidor del colegio." />
      {esAdmin && (
        <Tabs
          items={[
            { key: 'analisis', label: 'Análisis de estudiantes' },
            { key: 'modelos', label: 'Entrenar la IA' },
          ]}
          active={pestana}
          onChange={(key) => cambiar({ pestana: key })}
        />
      )}
      <TabPanel active={pestana} tabKey="analisis">
        <div className="space-y-4">
          <div className="max-w-xl">
            <BuscadorEstudiante seleccionado={studentId} onElegir={(id) => cambiar({ estudiante: id })} />
          </div>
          <AnalisisElegido studentId={studentId} />
        </div>
      </TabPanel>
      {esAdmin && (
        <TabPanel active={pestana} tabKey="modelos">
          <PanelModelos />
        </TabPanel>
      )}
    </div>
  );
}
