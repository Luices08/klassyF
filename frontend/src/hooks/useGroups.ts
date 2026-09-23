import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Group, Jornada } from '../types/domain';

export interface GroupsFilter {
  academic_year_id?: string;
  sede_id?: string;
  grade_id?: string;
  jornada?: Jornada;
  [key: string]: string | undefined;
}

export function useGroups(filter: GroupsFilter = {}) {
  return useQuery({
    queryKey: ['groups', filter],
    queryFn: () => api.get<Group[]>('/groups', filter),
    enabled: Boolean(filter.academic_year_id),
  });
}

export interface CreateGroupInput {
  sede_id: string;
  academic_year_id: string;
  grade_id: string;
  jornada: Jornada;
  nomenclatura: string;
  cupo_maximo: number;
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => api.post<Group>('/groups', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
