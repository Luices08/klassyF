import { useState } from 'react';
import { CierreGrupoPanel } from '../../components/promocion/CierreGrupoPanel';
import { PoliticaPromocionPanel } from '../../components/promocion/PoliticaPromocionPanel';
import { RolloverPanel } from '../../components/promocion/RolloverPanel';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useAnioDeTrabajo } from '../../hooks/useAniosLectivos';

/**
 * M19: promoción y cierre del año. La política es el SIEE del colegio (la define el administrador), el cierre se simula y se confirma
 * por grupo, y el paso al año siguiente reserva cupo con pre-matrículas.
 */
export function PromocionPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMIN';
  const { anio } = useAnioDeTrabajo();
  const [pestana, setPestana] = useState('cierre');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Promoción y cierre del año"
        subtitle={anio ? `Año lectivo ${anio.year}. Las reglas son las del SIEE del colegio; nada se decide con valores fijos.` : 'Las reglas son las del SIEE del colegio.'}
      />
      <Tabs
        items={[
          { key: 'cierre', label: 'Cierre por grupo' },
          { key: 'siguiente', label: 'Año siguiente' },
          { key: 'politica', label: 'Política del colegio' },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      {pestana === 'cierre' && <CierreGrupoPanel anioId={anio?._id} anioEstado={anio?.estado} puedeCerrar={esAdmin} />}
      {pestana === 'siguiente' && <RolloverPanel puedeEjecutar={esAdmin} />}
      {pestana === 'politica' && <PoliticaPromocionPanel academicYearId={anio?._id} puedeEditar={esAdmin && anio?.estado !== 'CERRADO'} />}
    </div>
  );
}
