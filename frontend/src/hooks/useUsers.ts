import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Rol } from '../types/api';
import type { TipoDocumento, User } from '../types/domain';

export function useUsers(filter: { rol?: Rol; estado?: 'activo' | 'inactivo' } = {}, enabled = true) {
  return useQuery({
    queryKey: ['users', filter],
    queryFn: () => api.get<User[]>('/users', filter),
    enabled,
  });
}

export interface CreateUserInput {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  password: string;
  rol: Rol;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>('/users', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
