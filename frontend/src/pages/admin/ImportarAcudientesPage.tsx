import { useNavigate } from 'react-router-dom';
import { ImportacionAcudientes } from '../../components/estudiantes/ImportacionAcudientes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { ArrowLeftIcon } from '../../components/ui/icons';

export function ImportarAcudientesPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Importar acudientes"
        subtitle="Carga masiva de acudientes y su vínculo con los estudiantes que ya están registrados."
        action={
          <Button variant="secondary" onClick={() => navigate('/admin/students')}>
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a estudiantes
          </Button>
        }
      />
      <ImportacionAcudientes />
    </div>
  );
}
