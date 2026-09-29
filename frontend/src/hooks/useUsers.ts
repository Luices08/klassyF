import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Rol } from '../types/api';
import type { EstadoActivo, TipoDocumento, User } from '../types/domain';

/** Forma original: lista completa (sin paginar), usada por selects de estudiante en otros modulos. */
export function useUsers(filter: { rol?: Rol; estado?: EstadoActivo } = {}, enabled = true) {
  return useQuery({
    queryKey: ['users', filter],
    queryFn: () => api.get<User[]>('/users', filter),
    enabled,
  });
}

export interface UsersFilter {
  rol?: Rol;
  roles?: Rol[] | string;
  estado?: EstadoActivo;
  sede_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UsersPageResult {
  data: User[];
  total: number;
  page: number;
  pages: number;
}

/** Version paginada (M02) para la tabla de administracion de Usuarios: pasa page/limit explicitos. */
export function useUsersPaginados(filter: UsersFilter) {
  const query: Record<string, string | number | undefined | null> = {
    ...filter,
    roles: Array.isArray(filter.roles)
      ? filter.roles.length > 0
        ? filter.roles.join(',')
        : undefined
      : filter.roles,
  };
  return useQuery({
    queryKey: ['users', filter],
    queryFn: () =>
      api.raw<{ success: true; data: User[]; total: number; page: number; pages: number }>('/users', {
        query,
      }),
    select: (res): UsersPageResult => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
  });
}

export interface CreateUserInput {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  telefono?: string;
  password: string;
  rol: Rol;
  sedes_ids?: string[];
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

export interface UpdateUserInput {
  id: string;
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  telefono?: string;
  rol: Rol;
  sedes_ids?: string[];
  /** Si se llena, resetea la contraseña del usuario; nunca se lee la anterior (esta hasheada). */
  password?: string;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput) => api.patch<User>(`/users/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useActualizarEstadoUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado, motivo }: { id: string; estado: EstadoActivo; motivo?: string }) =>
      api.patch<User>(`/users/${id}/estado`, { estado, motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useEliminarUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useResetearPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<{ password_temporal: string }>(`/users/${id}/reset-password`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useCerrarSesiones() {
  return useMutation({
    mutationFn: (id: string) => api.patch<null>(`/users/${id}/cerrar-sesiones`, {}),
  });
}

export interface ImportacionResultado {
  total_filas: number;
  creados: number;
  fallidos: number;
  errores: Array<{ fila: number; numero_documento?: string; motivo: string }>;
}

export function useBulkImportUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<ImportacionResultado>('/users/bulk-import', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// --- Mi Cuenta (autoservicio) ---

export function useMe() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api.get<User>('/users/me'),
  });
}

export interface UpdateMeInput {
  telefono?: string;
  foto_url?: string | null;
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api.patch<User>('/users/me', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}

export function useCambiarMiPassword() {
  return useMutation({
    mutationFn: (input: { password_actual: string; password_nueva: string }) =>
      api.patch<{ token: string }>('/users/me/password', input),
  });
}
