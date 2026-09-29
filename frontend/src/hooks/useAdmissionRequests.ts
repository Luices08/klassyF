import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  AdmissionRequest,
  EstadoSolicitud,
  Jornada,
  PreinscripcionDetalle,
  TipoDocumento,
  TipoDocumentoMatricula,
} from '../types/domain';

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
  /** Solo con la solicitud APROBADA. */
  preinscripcion: PreinscripcionDetalle | null;
}

/** El acudiente no tiene sesión: cada consulta y cada acción se autoriza con documento + fecha de nacimiento. */
export interface CredencialesPreinscripcion {
  numero_documento: string;
  fecha_nacimiento: string;
}

/** Consulta pública de estado; corre solo cuando hay credenciales enviadas y se refresca tras cada subida. */
export function useEstadoSolicitud(credenciales: CredencialesPreinscripcion | null) {
  return useQuery({
    queryKey: ['admission-requests', 'status', credenciales],
    queryFn: () =>
      api.get<EstadoSolicitudResultado>('/public/admission-requests/status', { ...(credenciales as CredencialesPreinscripcion) }),
    enabled: credenciales !== null,
    retry: false,
    staleTime: 0,
  });
}

/** Descarga el comprobante de preinscripción en PDF y devuelve el blob URL. */
export function useDescargarComprobante() {
  return useMutation({
    mutationFn: async (credenciales: CredencialesPreinscripcion) => {
      const { url } = await api.downloadBlob('/public/admission-requests/comprobante', {
        method: 'POST',
        body: credenciales,
      });
      return url;
    },
  });
}

export function useSubirDocumentoPreinscripcion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      credenciales,
      tipoDocumento,
      file,
    }: {
      credenciales: CredencialesPreinscripcion;
      tipoDocumento: TipoDocumentoMatricula;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('numero_documento', credenciales.numero_documento);
      formData.append('fecha_nacimiento', credenciales.fecha_nacimiento);
      formData.append('file', file);
      return api.upload<PreinscripcionDetalle>(`/public/admission-requests/documentos/${tipoDocumento}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests', 'status'] });
    },
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
    mutationFn: ({
      id,
      ...cuerpo
    }: {
      id: string;
      group_id: string;
      academic_year_id: string;
      fecha_limite_legalizacion?: string;
    }) => api.patch<AdmissionRequest>(`/admission-requests/${id}/aprobar`, cuerpo),
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
