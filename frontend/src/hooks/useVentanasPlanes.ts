import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { VentanasAnio } from '../types/domain';

/** Cuándo abre y hasta cuándo se radican los planes de aula de cada periodo: la configurada o, donde no se tocó, la sugerida. */
export function useVentanasPlanes(anioId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['ventanas-planes', anioId],
    queryFn: () => api.get<VentanasAnio>('/planeacion/ventanas', { academic_year_id: anioId }),
    enabled: enabled && Boolean(anioId),
    staleTime: 60_000,
  });
}

export interface ConfigurarVentanaInput {
  academic_year_id: string;
  numero: number;
  /** Día 'YYYY-MM-DD'. `null` vuelve a la fecha sugerida; omitirlo la deja como está. */
  fecha_apertura?: string | null;
  fecha_limite?: string | null;
}

/** Coordinación y administración ajustan la ventana de un periodo sin tocar las fechas del periodo (esas son del año lectivo). */
export function useConfigurarVentanaPlanes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ academic_year_id, numero, ...cuerpo }: ConfigurarVentanaInput) =>
      api.put<VentanasAnio>(`/planeacion/ventanas/${academic_year_id}/periodos/${numero}`, cuerpo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ventanas-planes'] });
      // La ventana decide si el docente puede cargar y qué etiqueta de plazo lleva su plan.
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}
