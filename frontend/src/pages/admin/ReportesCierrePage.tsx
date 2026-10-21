import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InformeFinalPanel } from '../../components/reportes/InformeFinalPanel';
import { LibroCalificacionesPanel } from '../../components/reportes/LibroCalificacionesPanel';
import { ListadosPanel } from '../../components/reportes/ListadosPanel';
import { SabanaPanel } from '../../components/reportes/SabanaPanel';
import { SimatPanel } from '../../components/reportes/SimatPanel';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';

const PESTANAS = [
  { key: 'sabana', label: 'Sábana de calificaciones' },
  { key: 'informe-final', label: 'Informe final del año' },
  { key: 'listados', label: 'Listados de cierre' },
  { key: 'simat', label: 'Cierre para SIMAT' },
  { key: 'libro', label: 'Libro de calificaciones' },
];

/** M33: reportes de cierre anual. Ninguno guarda datos propios: se arman al descargar con lo que ya registran los demás módulos. */
export function ReportesCierrePage() {
  const { user } = useAuth();
  const { anio } = useAnioDeTrabajo();
  // Orientación solo entra al balance de inclusión (dentro de «Listados de cierre»); el resto es de administración, coordinación y secretaría.
  const pestanas = user?.rol === 'ORIENTADOR' ? PESTANAS.filter((p) => p.key === 'listados') : PESTANAS;
  // `?pestana=` deja que otras pantallas (los dashboards) abran la pestaña que necesitan; sin él abre la sábana, como siempre.
  const [params] = useSearchParams();
  const [elegida, setPestana] = useState(params.get('pestana') ?? 'sabana');
  const pestana = pestanas.some((p) => p.key === elegida) ? elegida : (pestanas[0]?.key ?? 'listados');
  return (
    <div className="space-y-4">
      <PageHeader title="Reportes de cierre anual" subtitle="Informes del final de los periodos y del año escolar para docentes, comisiones y archivo." />
      <Tabs items={pestanas} active={pestana} onChange={setPestana} />
      {pestana === 'sabana' && <SabanaPanel anioPorDefecto={anio?._id} />}
      {pestana === 'informe-final' && <InformeFinalPanel anioPorDefecto={anio?._id} />}
      {pestana === 'listados' && <ListadosPanel anioPorDefecto={anio?._id} />}
      {pestana === 'simat' && <SimatPanel anioPorDefecto={anio?._id} />}
      {pestana === 'libro' && <LibroCalificacionesPanel anioPorDefecto={anio?._id} />}
    </div>
  );
}
