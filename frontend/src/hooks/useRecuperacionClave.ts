import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Rol } from '../types/api';

export type VistaSolicitudClave = 'PENDIENTES' | 'ATENDIDAS';

export interface SolicitudClave {
  _id: string;
  estado: 'PENDIENTE' | 'ATENDIDA' | 'RECHAZADA';
  nota: string | null;
  createdAt: string;
  atendida_en: string | null;
  atendida_por: string | null;
  motivo_rechazo: string | null;
  usuario: { _id: string; nombre: string; apellido: string; numero_documento: string; roles: Rol[]; grupo: string | null };
}

/** Pantalla pública de «Olvidé mi contraseña»: deja la solicitud para la secretaría; la respuesta es la misma exista o no el documento. */
export function useSolicitarRecuperacionClave() {
  return useMutation({
    mutationFn: (input: { numero_documento: string; nota?: string }) => api.post<{ mensaje: string }>('/public/recuperacion-clave', input),
  });
}

export function useSolicitudesClave(vista: VistaSolicitudClave) {
  return useQuery({
    queryKey: ['solicitudes-clave', vista],
    queryFn: () => api.get<SolicitudClave[]>('/recuperacion-clave', { vista }),
    refetchInterval: 60_000,
  });
}

export function useAprobarSolicitudClave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ password_temporal: string }>(`/recuperacion-clave/${id}/aprobar`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['solicitudes-clave'] });
    },
  });
}

export function useRechazarSolicitudClave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) => api.post<null>(`/recuperacion-clave/${id}/rechazar`, { motivo: motivo || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['solicitudes-clave'] });
    },
  });
}
