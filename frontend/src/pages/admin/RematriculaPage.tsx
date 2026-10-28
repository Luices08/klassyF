import { useState } from 'react';
import { RematriculaGrupoPanel } from '../../components/rematricula/RematriculaGrupoPanel';
import { ReglasRematriculaPanel } from '../../components/rematricula/ReglasRematriculaPanel';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';

/** Rematrícula de fin de año (M19 → M04) por sede, grado o grupo: simulación, confirmación y balanceo de salones. */
export function RematriculaPage() {
  const { user } = useAuth();
  const [pestana, setPestana] = useState('rematricula');
  const esAdmin = user?.rol === 'ADMIN';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rematrícula de fin de año"
        subtitle="Paso masivo al año siguiente tras el dictamen de promoción: matricula directamente en definitivo a promovidos y repitentes con Libro y Folio correlativo."
      />
      <Tabs
        items={[
          { key: 'rematricula', label: 'Rematrícula masiva' },
          { key: 'reglas', label: 'Configuración de aforo y balanceo' },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      {pestana === 'rematricula' && <RematriculaGrupoPanel puedeEjecutar={esAdmin || user?.rol === 'SECRETARIA'} />}
      {pestana === 'reglas' && <ReglasRematriculaPanel puedeEditar={esAdmin} />}
    </div>
  );
}
