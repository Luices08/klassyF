import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DocenteCargaResumen, TeacherAssignment, TipoAsignacionDocente } from '../types/domain';

export interface TeacherAssignmentFilters {
  academic_year_id?: string;
  docente_id?: string;
  group_id?: string;
  tipo_asignacion?: TipoAsignacionDocente;
}

export function useTeacherAssignments(filters: TeacherAssignmentFilters, enabled = true) {
  return useQuery({
    queryKey: ['teacher-assignments', filters],
    queryFn: () =>
      api.get<TeacherAssignment[]>('/teacher-assignments', {
        academic_year_id: filters.academic_year_id || undefined,
        docente_id: filters.docente_id || undefined,
        group_id: filters.group_id || undefined,
        tipo_asignacion: filters.tipo_asignacion || undefined,
      }),
    enabled: enabled && Boolean(filters.academic_year_id),
    staleTime: 2 * 60_000,
  });
}

export function useDocentesCargaResumen(academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['teacher-assignments-resumen', academicYearId],
    queryFn: () =>
      api.get<DocenteCargaResumen[]>('/teacher-assignments/docentes-resumen', {
        academic_year_id: academicYearId,
      }),
    enabled: Boolean(academicYearId),
    staleTime: 2 * 60_000,
  });
}

export function useMyTeacherLoad() {
  return useQuery({
    queryKey: ['my-teacher-load'],
    queryFn: () => api.get<TeacherAssignment[]>('/teacher-assignments/my-load'),
    staleTime: 5 * 60_000,
  });
}

export interface CrearTeacherAssignmentInput {
  docente_id: string;
  academic_year_id: string;
  tipo_asignacion: TipoAsignacionDocente;
  group_id?: string | null;
  subject_id?: string | null;
  horas_semanales: number;
  proyecto_nombre?: string;
  observaciones?: string;
}

export function useCrearTeacherAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearTeacherAssignmentInput) =>
      api.post<TeacherAssignment>('/teacher-assignments', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments-resumen'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useEliminarTeacherAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: true; message: string }>(`/teacher-assignments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments-resumen'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export interface LimitesCargaDocente {
  PREESCOLAR: number;
  PRIMARIA: number;
  SECUNDARIA: number;
  MEDIA: number;
}

export function useLimitesCarga() {
  return useQuery({
    queryKey: ['limites-carga'],
    queryFn: () => api.get<LimitesCargaDocente>('/institution/limites-carga'),
    staleTime: 5 * 60_000,
  });
}

export function useActualizarLimitesCarga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<LimitesCargaDocente>) =>
      api.patch<LimitesCargaDocente>('/institution/limites-carga', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['limites-carga'] });
      void queryClient.invalidateQueries({ queryKey: ['teacher-assignments-resumen'] });
    },
  });
}

