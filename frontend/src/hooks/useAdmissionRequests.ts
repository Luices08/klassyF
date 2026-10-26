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
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
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
  /** Solo con el cupo reservado o en espera (prematrícula). */
  reserva?: ReservaPublica | null;
  posicion_espera?: number | null;
}

export interface ReservaPublica {
  grado: string;
  sede: string;
  jornada: string;
  anio: number | null;
  fecha_limite_matricula: string | null;
  /** Pasó el último día para matricular: el cupo ya no está apartado. */
  vencida: boolean;
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
  academic_year_id?: string;
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

/** Inscripción en el mostrador: la misma solicitud, con el documento y el parentesco del acudiente. */
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

/** Recibe (o reemplaza) un documento de la solicitud mientras esté en trámite. */
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
    mutationFn: ({ id, tipoDocumento }: { id: string; tipoDocumento: string }) => api.delete<AdmissionRequest>(`/admission-requests/${id}/documentos/${tipoDocumento}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

// --- Prematrícula: ventana del año y cupos reservados por grado, sede y jornada ---

export interface VentanaPrematricula {
  desde: string;
  hasta: string;
  fecha_limite_matricula: string | null;
  abierta: boolean;
}

export interface FilaDeCupos {
  grado: { id: string; nombre: string; numero: number };
  sede: { id: string; nombre: string };
  jornada: { id: string; nombre: string };
  capacidad: number;
  ocupados: number;
  reservados: number;
  en_espera: number;
  /** capacidad − ocupados − reservados; negativo si se aprobaron más de los que cabían. */
  libres: number;
}

export interface VistaDeCupos {
  anio: { id: string; year: number; estado: string };
  ventana: VentanaPrematricula | null;
  filas: FilaDeCupos[];
  reservas_vencidas: number;
}

export function useCuposPrematricula(anioId: string | undefined) {
  return useQuery({
    queryKey: ['admission-requests', 'cupos', anioId],
    queryFn: () => api.get<VistaDeCupos>('/admission-requests/cupos', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
  });
}

export function useVentanaPrematricula(anioId: string | undefined) {
  return useQuery({
    queryKey: ['admission-requests', 'ventana', anioId],
    queryFn: () => api.get<VentanaPrematricula | null>(`/admission-requests/prematricula/${anioId}`),
    enabled: Boolean(anioId),
  });
}

export function useGuardarVentanaPrematricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ anioId, ...cuerpo }: { anioId: string; desde: string; hasta: string; fecha_limite_matricula: string | null }) =>
      api.put<VentanaPrematricula>(`/admission-requests/prematricula/${anioId}`, cuerpo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
  });
}

/** Reserva cupo en un grado, sede y jornada, o la manda a la lista de espera si no cabe (el aviso dice por qué). */
export function useReservarCupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...cuerpo }: { id: string; sede_id: string; jornada_id: string }) => {
      const r = await api.raw<{ success: true; data: AdmissionRequest; aviso: string | null; posicion_espera: number | null }>(`/admission-requests/${id}/reservar-cupo`, { method: 'POST', body: cuerpo });
      return { solicitud: r.data, aviso: r.aviso, posicion_espera: r.posicion_espera };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admission-requests'] });
    },
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
