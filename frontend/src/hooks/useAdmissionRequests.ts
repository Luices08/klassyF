import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  AdmissionRequest,
  EstadoSolicitud,
  Jornada,
  Parentesco,
  PreinscripcionDetalle,
  TipoDocumento,
  TipoDocumentoMatricula,
} from '../types/domain';

// --- Sitio público (sin autenticar) ---

export interface AnioOferta {
  id: string;
  year: number;
  estado: string;
  es_siguiente: boolean;
}

export interface OfertaDeAdmision {
  anios_disponibles?: AnioOferta[];
  anio: { id: string; year: number } | null;
  oferta: Array<{ grado: { id: string; nombre: string; numero: number }; sede: { id: string; nombre: string }; jornada: Jornada }>;
}

/** La oferta del año elegido en el formulario; sin año, la del año de admisión por defecto. */
export function useOfertaDeAdmision(anioId?: string) {
  return useQuery({
    queryKey: ['public', 'oferta-admision', anioId ?? null],
    queryFn: () => api.get<OfertaDeAdmision>(`/public/admission-requests/oferta${anioId ? `?academic_year_id=${anioId}` : ''}`),
    staleTime: 60_000,
  });
}

export interface SolicitarCupoInput {
  primer_nombre: string;
  segundo_nombre?: string;
  primer_apellido: string;
  segundo_apellido?: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string;
  grado_deseado_id: string;
  sede_deseada_id?: string;
  jornada_deseada?: Jornada;
  academic_year_id?: string;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_tipo_documento?: TipoDocumento;
  acudiente_numero_documento?: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones?: string;
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

export function useSolicitarCupo() {
  return useMutation({
    mutationFn: (input: FormData | SolicitarCupoInput) => {
      if (input instanceof FormData) {
        return api.upload<AdmissionRequest>('/public/admission-requests', input);
      }
      return api.post<AdmissionRequest>('/public/admission-requests', input);
    },
  });
}

export interface EstadoSolicitudResultado {
  estado: EstadoSolicitud;
  fecha_solicitud: string;
  motivo_rechazo: string | null;
  academic_year: {
    id: string;
    year: number;
    es_anio_siguiente: boolean;
  } | null;
  grado: { id: string; nombre: string } | null;
  matricula: {
    folio_matricula: string | null;
    numero_libro: number | null;
    numero_folio: number | null;
    estado: string;
    grupo_nombre: string | null;
  } | null;
  documentos?: Array<{ tipo_documento: string; fecha_carga: string; nombre_original?: string | null }>;
  preinscripcion?: PreinscripcionDetalle | null;
  reserva?: { grado: string; sede: string; jornada: string; anio: number | null; fecha_limite_matricula: string | null; vencida: boolean } | null;
  posicion_espera?: number | null;
}

export interface CredencialesPreinscripcion {
  numero_documento: string;
  fecha_nacimiento: string;
}

/** Consulta pública de estado contextual por año y documento. */
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
  academic_year_id?: string;
  grade_id?: string;
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

export interface InscripcionInput extends SolicitarCupoInput {
  acudiente_tipo_documento: TipoDocumento;
  acudiente_numero_documento: string;
  acudiente_parentesco?: Parentesco;
}

export function useRegistrarInscripcion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InscripcionInput) => api.post<AdmissionRequest>('/admission-requests', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

export function useSubirDocumentoSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoDocumento, file }: { id: string; tipoDocumento: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<AdmissionRequest>(`/admission-requests/${id}/documentos/${tipoDocumento}`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

export function useQuitarDocumentoSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoDocumento }: { id: string; tipoDocumento: string }) =>
      api.delete<AdmissionRequest>(`/admission-requests/${id}/documentos/${tipoDocumento}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

// --- Disponibilidad limpia de cupos (Capacidad Total | Matriculados Reales | Solicitudes en Espera | Cupos Libres) ---

export interface FilaDisponibilidadCupos {
  grado: { id: string; nombre: string; numero: number };
  sede: { id: string; nombre: string };
  jornada: { id: string; nombre: string };
  capacidad_total: number;
  matriculados_reales: number;
  solicitudes_espera: number;
  cupos_libres: number;
}

export interface DisponibilidadCuposVista {
  anio: { id: string; year: number; estado: string };
  filas: FilaDisponibilidadCupos[];
  totales: {
    capacidad_total: number;
    matriculados_reales: number;
    solicitudes_espera: number;
    cupos_libres: number;
  };
}

export function useDisponibilidadCupos(anioId: string | undefined) {
  return useQuery({
    queryKey: ['admission-requests', 'cupos', anioId],
    queryFn: () => api.get<DisponibilidadCuposVista>('/admission-requests/cupos', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
  });
}
export const useCuposPrematricula = useDisponibilidadCupos;

export function useAdmitirSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<AdmissionRequest>(`/admission-requests/${id}/admitir`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

export interface AprobarYMatricularParams {
  id: string;
  group_id: string;
  academic_year_id: string;
  trae_todos: 'SI' | 'NO';
  fecha_limite_compromiso?: string;
}

export function useAprobarSolicitud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cuerpo }: AprobarYMatricularParams) =>
      api.patch<AdmissionRequest>(`/admission-requests/${id}/aprobar`, cuerpo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
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
