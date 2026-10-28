import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// Reglas de balanceo de la rematrícula (M19 → M04). La simulación y el registro de matrículas viven en usePromocion.

export type CriterioDesempate = 'PROMEDIO_GENERAL' | 'ANTIGUEDAD' | 'SIN_FALTAS_GRAVES';

export const NOMBRES_CRITERIO: Record<CriterioDesempate, { nombre: string; descripcion: string }> = {
  PROMEDIO_GENERAL: { nombre: 'Promedio general del año', descripcion: 'Mayor promedio primero (sale del cierre de promoción).' },
  ANTIGUEDAD: { nombre: 'Antigüedad en el plantel', descripcion: 'Más años matriculado en el colegio primero.' },
  SIN_FALTAS_GRAVES: { nombre: 'Sin faltas graves de convivencia', descripcion: 'Quien no tuvo faltas tipo II o III primero. Solo ordena: el detalle nunca se muestra.' },
};

export interface ConfiguracionRematricula {
  criterios_desempate: Array<{ criterio: CriterioDesempate; activo: boolean }>;
  tolerancia_ocupacion_pct: number;
}

export function useConfiguracionRematricula() {
  return useQuery({
    queryKey: ['rematricula', 'configuracion'],
    queryFn: () => api.get<ConfiguracionRematricula>('/promocion/rematricula/configuracion'),
  });
}

export function useActualizarConfiguracionRematricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfiguracionRematricula) => api.put<ConfiguracionRematricula>('/promocion/rematricula/configuracion', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rematricula', 'configuracion'] });
    },
  });
}
