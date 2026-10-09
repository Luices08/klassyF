import { useState } from 'react';
import { ImpresionPlanilla } from '../../components/notas/ImpresionPlanilla';
import { MoldePlanilla } from '../../components/notas/MoldePlanilla';
import { Alert, errorMessage } from '../../components/ui/Alert';
import { EstadoAnioLectivoBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';

const PESTANAS = [
  { key: 'molde', label: 'Molde de la nota' },
  { key: 'impresion', label: 'Impresión y firmas' },
];

/**
 * Creador de planillas (M12/M21, CU-ADM-04): el administrador define UNA VEZ cómo se divide el 100% de la nota en bloques y
 * cuántas casillas admite cada uno; esa es la plantilla de planilla que usa toda la institución el resto del año (y se copia
 * al año siguiente). Los docentes llenan las casillas con sus actividades y notas, y les ponen peso dentro del bloque.
 * La segunda pestaña es solo presentación (encabezado, columnas calculadas y firmas del PDF y del Excel).
 */
export function CreadorPlanillasPage() {
  const { anio: porDefecto, anios, query } = useAnioDeTrabajo();
  const [elegido, setElegido] = useState('');
  const [pestana, setPestana] = useState('molde');

  const anio = anios.find((a) => a._id === elegido) ?? porDefecto;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Creador de planillas"
        subtitle="Divide el 100% de la nota en bloques y fija cuántas casillas admite cada uno. Es la planilla que usan todos los docentes del colegio."
      />

      {query.isLoading && (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      )}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {!query.isLoading && !query.isError && !anio && (
        <Alert tone="info">Aún no hay un año lectivo. Crea uno en «Año lectivo» y vuelve aquí para definir el molde de la planilla.</Alert>
      )}

      {anio && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div className="min-w-[260px]">
                <Select label="Año lectivo" value={anio._id} onChange={(e) => setElegido(e.target.value)}>
                  {anios.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.nombre || `Año lectivo ${a.year}`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="pb-1">
                <EstadoAnioLectivoBadge value={anio.estado} />
              </div>
            </div>
          </Card>

          <Tabs items={PESTANAS} active={pestana} onChange={setPestana} />
          <TabPanel active={pestana} tabKey="molde">
            <MoldePlanilla anio={anio} />
          </TabPanel>
          <TabPanel active={pestana} tabKey="impresion">
            <ImpresionPlanilla />
          </TabPanel>
        </>
      )}
    </div>
  );
}
