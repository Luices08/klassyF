import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoGrupo, Group } from '../types/domain';

export interface GroupsFilter {
  academic_year_id?: string;
  sede_id?: string;
  grade_id?: string;
  jornada_id?: string;
  estado?: EstadoGrupo;
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
  jornada_id: string;
  nomenclatura: string;
  max_capacity: number;
  /** Salón titular (M10), opcional. */
  aula_id?: string | null;
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => api.post<Group>('/groups', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Un grupo (des)ocupa su aula: el directorio de espacios muestra esa ocupación.
      void queryClient.invalidateQueries({ queryKey: ['espacios'] });
    },
  });
}

export interface ActualizarEstadoGrupoInput {
  groupId: string;
  estado: EstadoGrupo;
}

// Cierra o reactiva un grupo (ACTIVE/CLOSED) sin borrarlo ni tocar sus matriculas.
export function useActualizarEstadoGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, estado }: ActualizarEstadoGrupoInput) =>
      api.patch<Group>(`/groups/${groupId}`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      // Un grupo (des)ocupa su aula: el directorio de espacios muestra esa ocupación.
      void queryClient.invalidateQueries({ queryKey: ['espacios'] });
    },
  });
}

export interface CambiarAulaGrupoInput {
  groupId: string;
  /** null = quitar el salón titular del grupo. */
  aula_id: string | null;
}

/** Reasigna el salón titular de un grupo ya creado (M10: reparaciones locativas, reorganización de aforos). */
export function useCambiarAulaGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, aula_id }: CambiarAulaGrupoInput) =>
      api.raw<{ success: true; data: Group; advertencia: string | null }>(`/groups/${groupId}/aula`, {
        method: 'PATCH',
        body: { aula_id },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['espacios'] });
    },
  });
}
