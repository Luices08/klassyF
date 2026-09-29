import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoActivo, Guardian, Parentesco, StudentGuardianRelation, TipoDocumento } from '../types/domain';

export function useGuardiansSearch(search: string, enabled = true) {
  return useQuery({
    queryKey: ['guardians', { search }],
    queryFn: () => api.get<Guardian[]>('/guardians', { search, limit: 10 }),
    enabled: enabled && search.length > 0,
  });
}

export function useStudentGuardians(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', studentId, 'guardians'],
    queryFn: () => api.get<StudentGuardianRelation[]>(`/users/${studentId}/guardians`),
    enabled: Boolean(studentId),
  });
}

export interface VincularAcudienteInput {
  studentId: string;
  guardian_id?: string;
  tipo_documento?: TipoDocumento;
  numero_documento?: string;
  nombre?: string;
  apellido?: string;
  telefono_principal?: string;
  telefono_secundario?: string;
  email?: string;
  ocupacion?: string;
  direccion?: string;
  parentesco: Parentesco;
  es_principal?: boolean;
  autorizado_retiro?: boolean;
}

export function useVincularAcudiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, ...input }: VincularAcudienteInput) =>
      api.post<StudentGuardianRelation>(`/users/${studentId}/guardians`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['students', variables.studentId, 'guardians'] });
      void queryClient.invalidateQueries({ queryKey: ['students', 'ficha360', variables.studentId] });
    },
  });
}

export function useActualizarVinculo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      relationId,
      ...patch
    }: {
      studentId: string;
      relationId: string;
      parentesco?: Parentesco;
      es_principal?: boolean;
      autorizado_retiro?: boolean;
    }) => api.patch<StudentGuardianRelation>(`/users/${studentId}/guardians/${relationId}`, patch),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['students', variables.studentId, 'guardians'] });
      void queryClient.invalidateQueries({ queryKey: ['students', 'ficha360', variables.studentId] });
    },
  });
}

export function useDesvincularAcudiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, relationId }: { studentId: string; relationId: string }) =>
      api.delete<null>(`/users/${studentId}/guardians/${relationId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['students', variables.studentId, 'guardians'] });
      void queryClient.invalidateQueries({ queryKey: ['students', 'ficha360', variables.studentId] });
    },
  });
}

export function useActualizarAcudiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      nombre?: string;
      apellido?: string;
      telefono_principal?: string;
      telefono_secundario?: string;
      email?: string;
      ocupacion?: string;
      direccion?: string;
    }) => api.patch<Guardian>(`/guardians/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guardians'] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useActualizarEstadoAcudiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<Guardian>(`/guardians/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    },
  });
}
