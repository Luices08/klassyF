import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Area, Campus, EstadoActivo, Grade, Jornada, JornadaOperativa } from '../types/domain';

export function useGrades(estado?: EstadoActivo) {
  return useQuery({
    queryKey: ['grades', estado ?? 'all'],
    queryFn: () => api.get<Grade[]>('/grades', { estado }),
    staleTime: 5 * 60_000,
  });
}

export function useActualizarEstadoGrado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<Grade>(`/grades/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grades'] });
    },
  });
}

/** Áreas académicas (M06): las usa M10 para restringir un espacio a ciertas áreas. */
export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get<Area[]>('/curriculum/areas'),
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
  telefono?: string;
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

export interface ActualizarSedeInput {
  id: string;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  telefono?: string;
}

export function useActualizarSede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ActualizarSedeInput) => api.patch<Campus>(`/campuses/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campuses'] });
    },
  });
}

export function useActualizarEstadoSede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<Campus>(`/campuses/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campuses'] });
    },
  });
}

export function useEliminarSede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/campuses/${id}`),
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
  hora_inicio: string;
  hora_fin: string;
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
