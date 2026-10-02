import { useState } from 'react';
import { EstadisticasAsistenciaPanel } from '../components/asistencia/EstadisticasAsistenciaPanel';
import { EstadosAsistenciaPanel } from '../components/asistencia/EstadosAsistenciaPanel';
import { JustificacionesPanel } from '../components/asistencia/JustificacionesPanel';
import { Alert } from '../components/ui/Alert';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { TabPanel, Tabs, type TabItem } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { useAnioDeTrabajo } from '../hooks/useAniosLectivos';

/** Reportes de ausentismo, bandeja de justificaciones y (solo ADMIN) estados de asistencia de la institución. */
export function GestionAsistenciaPage() {
  const { user } = useAuth();
  const { anio, query } = useAnioDeTrabajo();
  const [pestana, setPestana] = useState('estadisticas');

  const esAdmin = user?.rol === 'ADMIN';
  const puedeRevisar = esAdmin || user?.rol === 'COORDINADOR';

  const pestanas: TabItem[] = [
    { key: 'estadisticas', label: 'Estadísticas' },
    { key: 'justificaciones', label: 'Justificaciones' },
    ...(esAdmin ? [{ key: 'estados', label: 'Estados de asistencia' }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestión de asistencia"
        subtitle="Ausentismo por estudiante, grupo, asignatura y periodo; justificaciones con soporte y estados configurables."
      />

      <Tabs items={pestanas} active={pestana} onChange={setPestana} />

      {query.isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : !anio ? (
        <Alert tone="info">Todavía no hay un año lectivo configurado.</Alert>
      ) : (
        <>
          <TabPanel active={pestana} tabKey="estadisticas">
            <EstadisticasAsistenciaPanel anio={anio} />
          </TabPanel>
          <TabPanel active={pestana} tabKey="justificaciones">
            <JustificacionesPanel academicYearId={anio._id} puedeRevisar={puedeRevisar} />
          </TabPanel>
          {esAdmin && (
            <TabPanel active={pestana} tabKey="estados">
              <EstadosAsistenciaPanel />
            </TabPanel>
          )}
        </>
      )}
    </div>
  );
}
