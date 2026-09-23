import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Campus, Grade, Jornada, JornadaOperativa } from '../types/domain';

export function useGrades() {
  return useQuery({
    queryKey: ['grades'],
    queryFn: () => api.get<Grade[]>('/grades'),
    staleTime: 5 * 60_000,
  });
}

export function useCampuses(institucionId: string | undefined) {
  return useQuery({
    queryKey: ['campuses', institucionId],
    queryFn: () => api.get<Campus[]>('/campuses', { institucion_id: institucionId }),
    enabled: Boolean(institucionId),
    staleTime: 5 * 60_000,
  });
}

export interface CrearSedeInput {
  institucion_id: string;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
}

export function useCrearSede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearSedeInput) => api.post<Campus>('/campuses', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campuses'] });
    },
  });
}

export function useJornadas(sedeId: string | undefined) {
  return useQuery({
    queryKey: ['jornadas', sedeId],
    queryFn: () => api.get<JornadaOperativa[]>('/shifts', { sede_id: sedeId }),
    enabled: Boolean(sedeId),
    staleTime: 5 * 60_000,
  });
}

export interface CrearJornadaInput {
  sede_id: string;
  nombre: Jornada;
}

export function useCrearJornada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearJornadaInput) => api.post<JornadaOperativa>('/shifts', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jornadas'] });
    },
  });
}
