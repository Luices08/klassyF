import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Campus, Grade } from '../types/domain';

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
