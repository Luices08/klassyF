import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DatosLiderArea, EstadoActivo, LiderArea } from '../types/domain';

/** Los líderes de un área (o de todas): quién responde por el plan de área de qué nivel, jornada y sede. */
export function useLideresArea(filtro: { area_id?: string; incluir_inactivos?: boolean } = {}, enabled = true) {
  return useQuery({
    queryKey: ['lideres-area', filtro],
    queryFn: () => api.get<LiderArea[]>('/planeacion/lideres-area', { area_id: filtro.area_id, incluir_inactivos: filtro.incluir_inactivos ? 'true' : undefined }),
    enabled,
    staleTime: 60_000,
  });
}

/** Designar, cambiar o quitar un líder cambia quién puede cargar el plan y qué bloquea la activación del año. */
function useInvalidarLideres() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['lideres-area'] });
    void queryClient.invalidateQueries({ queryKey: ['planes-area'] });
    void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
  };
}

export function useCrearLiderArea() {
  const invalidar = useInvalidarLideres();
  return useMutation({
    mutationFn: ({ area_id, ...datos }: DatosLiderArea & { area_id: string }) => api.post<LiderArea>('/planeacion/lideres-area', { area_id, ...datos }),
    onSuccess: invalidar,
  });
}

export function useActualizarLiderArea() {
  const invalidar = useInvalidarLideres();
  return useMutation({
    mutationFn: ({ id, ...cambios }: { id: string } & Partial<DatosLiderArea> & { estado?: EstadoActivo }) => api.patch<LiderArea>(`/planeacion/lideres-area/${id}`, cambios),
    onSuccess: invalidar,
  });
}

/** Sin planes cargados se elimina; con planes queda inactivo (el plan cuelga de él). */
export function useQuitarLiderArea() {
  const invalidar = useInvalidarLideres();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ eliminado: boolean; desactivado: boolean }>(`/planeacion/lideres-area/${id}`),
    onSuccess: invalidar,
  });
}
