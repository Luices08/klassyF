import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { AdmissionRequest, EstadoSolicitud, Jornada, TipoDocumento } from '../types/domain';

// --- Sitio publico (sin autenticar) ---

export interface SolicitarCupoInput {
  nombre_aspirante: string;
  apellido_aspirante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string;
  grado_deseado_id: string;
  sede_deseada_id?: string;
  jornada_deseada?: Jornada;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones?: string;
}

export function useSolicitarCupo() {
  return useMutation({
    mutationFn: (input: SolicitarCupoInput) => api.post<AdmissionRequest>('/public/admission-requests', input),
  });
}

export interface EstadoSolicitudResultado {
  estado: EstadoSolicitud;
  fecha_solicitud: string;
  motivo_rechazo: string | null;
}

export function useConsultarEstadoSolicitud() {
  return useMutation({
    mutationFn: (input: { numero_documento: string; fecha_nacimiento: string }) =>
      api.get<EstadoSolicitudResultado>('/public/admission-requests/status', input),
  });
}

// --- Panel interno (secretaria/coordinacion/admin) ---

export interface AdmissionRequestsFilter {
  estado?: EstadoSolicitud;
  search?: string;
  page?: number;
  limit?: number;
}

export function useAdmissionRequestsList(filter: AdmissionRequestsFilter) {
  return useQuery({
    queryKey: ['admission-requests', filter],
    queryFn: () =>
      api.raw<{ success: true; data: AdmissionRequest[]; total: number; page: number; pages: number }>(
        '/admission-requests',
        { query: { ...filter } }
      ),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
  });
}

export function useAprobarSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, group_id, academic_year_id }: { id: string; group_id: string; academic_year_id: string }) =>
      api.patch<AdmissionRequest>(`/admission-requests/${id}/aprobar`, { group_id, academic_year_id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useRechazarSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.patch<AdmissionRequest>(`/admission-requests/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}
