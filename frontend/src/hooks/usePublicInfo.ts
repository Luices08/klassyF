import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { PublicGrade, PublicInstitutionInfo } from '../types/domain';

export function usePublicInstitutionInfo() {
  return useQuery({
    queryKey: ['public', 'institution-info'],
    queryFn: () => api.get<PublicInstitutionInfo>('/public/institution-info'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePublicGrades() {
  return useQuery({
    queryKey: ['public', 'grades'],
    queryFn: () => api.get<PublicGrade[]>('/public/grades'),
    staleTime: 5 * 60_000,
  });
}
