import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DetallePlanArea, FilaPlanArea } from '../types/domain';

/** Una fila por líder de área del año (y una «sin líder» por lo que nadie cubre): el estado de su plan y si bloquea la activación del año. */
export function usePlanesArea(anioId: string | undefined) {
  return useQuery({
    queryKey: ['planes-area', 'listado', anioId],
    queryFn: () => api.get<FilaPlanArea[]>('/planeacion/planes-area', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
    staleTime: 60_000,
  });
}

export function usePlanArea(id: string | undefined) {
  return useQuery({
    queryKey: ['planes-area', 'detalle', id],
    queryFn: () => api.get<DetallePlanArea>(`/planeacion/planes-area/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** El PDF de una versión (la última si no se indica), pedido con la sesión. */
export const cargarArchivoPlanArea = (id: string, version?: number) =>
  api.downloadBlob(`/planeacion/planes-area/${id}/archivo${version ? `?version=${version}` : ''}`);

export interface RadicarPlanAreaInput {
  academic_year_id: string;
  /** El líder que carga el plan (lo que cubre: nivel, jornada y sedes). */
  lider_area_id: string;
  titulo: string;
  descripcion: string;
  archivo: File;
}

export function useRadicarPlanArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, ...datos }: RadicarPlanAreaInput) => {
      const form = new FormData();
      form.append('file', archivo);
      for (const [clave, valor] of Object.entries(datos)) form.append(clave, valor);
      return api.upload<DetallePlanArea>('/planeacion/planes-area', form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-area'] });
    },
  });
}

export interface RevisarPlanInput {
  id: string;
  decision: 'APROBADO' | 'DEVUELTO';
  comentario?: string;
}

export function useRevisarPlanArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cuerpo }: RevisarPlanInput) => api.patch<DetallePlanArea>(`/planeacion/planes-area/${id}/revision`, cuerpo),
    onSuccess: () => {
      // Aprobar o reabrir un plan de área habilita o frena los planes de aula de esa área.
      void queryClient.invalidateQueries({ queryKey: ['planes-area'] });
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}

/** Solo el ADMIN reabre un plan aprobado, con motivo. */
export function useReabrirPlanArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.patch<DetallePlanArea>(`/planeacion/planes-area/${id}/reabrir`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-area'] });
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}
