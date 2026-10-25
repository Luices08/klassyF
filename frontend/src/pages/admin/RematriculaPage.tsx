import { useState } from 'react';
import { ListaEsperaPanel } from '../../components/rematricula/ListaEsperaPanel';
import { RematriculaGrupoPanel } from '../../components/rematricula/RematriculaGrupoPanel';
import { ReglasRematriculaPanel } from '../../components/rematricula/ReglasRematriculaPanel';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';

/** Rematrícula de fin de año (M19 → M04) por sede, grado o grupo: simulación, confirmación, lista de espera y reglas de prioridad. */
export function RematriculaPage() {
  const { user } = useAuth();
  const [pestana, setPestana] = useState('rematricula');
  const esAdmin = user?.rol === 'ADMIN';

  return (
    <div className="space-y-4">
      <PageHeader title="Rematrícula de fin de año" subtitle="Proyecta la matrícula del año siguiente por sede, grado o grupo, sin esperar a que todos los grupos terminen sus recuperaciones." />
      <Tabs
        items={[
          { key: 'rematricula', label: 'Rematrícula' },
          { key: 'espera', label: 'Lista de espera' },
          { key: 'reglas', label: 'Reglas de prioridad' },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      {pestana === 'rematricula' && <RematriculaGrupoPanel puedeEjecutar={esAdmin || user?.rol === 'SECRETARIA'} />}
      {pestana === 'espera' && <ListaEsperaPanel puedeResolver={esAdmin || user?.rol === 'COORDINADOR'} />}
      {pestana === 'reglas' && <ReglasRematriculaPanel puedeEditar={esAdmin} />}
    </div>
  );
}
