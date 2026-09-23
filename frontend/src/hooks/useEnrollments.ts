import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Enrollment, EstadoMatricula } from '../types/domain';

export interface CreateEnrollmentInput {
  student_id: string;
  group_id: string;
  academic_year_id: string;
}

export function useCreateEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) => api.post<Enrollment>('/enrollments', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoMatricula }) =>
      api.patch<Enrollment>(`/enrollments/${id}/status`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
