import { useMemo, useState } from 'react';
import { useAnioDeTrabajo } from './useAniosLectivos';
import { useCampuses } from './useCatalogs';
import type { FiltrosDashboard } from './useDashboard';
import { useInstitution } from './useInstitution';

/**
 * Los filtros de un dashboard: año (el de trabajo por defecto), sede y periodo. Sin sede se mide toda la institución y sin periodo cada bloque elige el
 * que le corresponde. `filtros` es `null` mientras no se sepa el año, así ningún bloque consulta antes de tiempo.
 */
export function useFiltrosDashboard() {
  const { anio: anioDeTrabajo, anios } = useAnioDeTrabajo();
  const institucion = useInstitution();
  const sedes = useCampuses(institucion.data?._id);
  const [anioId, setAnioId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [periodo, setPeriodo] = useState('');

  const anioElegido = anios.find((a) => a._id === anioId) ?? anioDeTrabajo;
  const filtros = useMemo<FiltrosDashboard | null>(
    () => (anioElegido ? { academic_year_id: anioElegido._id, ...(sedeId ? { sede_id: sedeId } : {}), ...(periodo ? { periodo_numero: Number(periodo) } : {}) } : null),
    [anioElegido, sedeId, periodo]
  );
  return { filtros, anio: anioElegido, anios, sedes: sedes.data ?? [], sedeId, periodo, setAnioId, setSedeId, setPeriodo };
}
