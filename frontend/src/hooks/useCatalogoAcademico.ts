import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Area, EstadoActivo, NivelEducativo, Subject, TipoAsignatura } from '../types/domain';

export function useAreas(institucionId: string | undefined) {
  return useQuery({
    queryKey: ['areas', institucionId],
    queryFn: () => api.get<Area[]>('/curriculum/areas', { institucion_id: institucionId }),
    enabled: Boolean(institucionId),
    staleTime: 5 * 60_000,
  });
}

export interface CrearAreaInput {
  institucion_id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
}

export function useCrearArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearAreaInput) => api.post<Area>('/curriculum/areas', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['areas'] });
    },
  });
}

export interface ActualizarAreaInput {
  id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
}

export function useActualizarArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ActualizarAreaInput) => api.patch<Area>(`/curriculum/areas/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['areas'] });
    },
  });
}

export function useActualizarEstadoArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<Area>(`/curriculum/areas/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['areas'] });
    },
  });
}

export interface SubjectsFilter {
  area_id?: string;
  estado?: EstadoActivo;
  nivel_educativo?: NivelEducativo;
  [key: string]: string | undefined;
}

export function useSubjects(filter: SubjectsFilter = {}) {
  return useQuery({
    queryKey: ['subjects', filter],
    queryFn: () => api.get<Subject[]>('/curriculum/subjects', filter),
    staleTime: 5 * 60_000,
  });
}

export interface CrearSubjectInput {
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
}

export function useCrearSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearSubjectInput) => api.post<Subject>('/curriculum/subjects', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}

export interface ActualizarSubjectInput {
  id: string;
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
}

export function useActualizarSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ActualizarSubjectInput) => api.patch<Subject>(`/curriculum/subjects/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}

export function useActualizarEstadoSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<Subject>(`/curriculum/subjects/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}
