import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoDocumentoMatricula, EstadoMatricula, Enrollment, TipoDocumentoMatricula, TipoIngreso } from '../types/domain';

export interface CreateEnrollmentInput {
  student_id: string;
  group_id: string;
  academic_year_id: string;
  tipo_ingreso: TipoIngreso;
  numero_libro?: number;
  estado_inicial?: 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO';
  fecha_limite_compromiso?: string;
  forzar_sobrecupo?: boolean;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos: pasa a la bandeja de orientación (M16). */
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

export function useCreateEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) => api.post<Enrollment>('/enrollments', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });
}

export interface EnrollmentsFilter {
  academic_year_id?: string;
  group_id?: string;
  estado?: EstadoMatricula;
  search?: string;
  page?: number;
  limit?: number;
}

export function useEnrollmentsList(filter: EnrollmentsFilter, enabled = true) {
  return useQuery({
    queryKey: ['enrollments', filter],
    queryFn: () =>
      api.raw<{ success: true; data: Enrollment[]; total: number; page: number; pages: number }>('/enrollments', {
        query: { ...filter },
      }),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
    enabled,
  });
}

export function useEnrollment(id: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => api.get<Enrollment>(`/enrollments/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...cuerpo
    }: {
      id: string;
      estado: EstadoMatricula;
      motivo?: string;
      // Solo al formalizar (PREINSCRITO -> MATRICULADO_*), momento en que se asigna el folio.
      numero_libro?: number;
      fecha_limite_compromiso?: string;
    }) => api.patch<Enrollment>(`/enrollments/${id}/status`, cuerpo),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useCambiarGrupoMatricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, group_id }: { id: string; group_id: string }) =>
      api.patch<Enrollment>(`/enrollments/${id}/grupo`, { group_id }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useCargarDocumentoMatricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoDocumento, file }: { id: string; tipoDocumento: TipoDocumentoMatricula; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<Enrollment>(`/enrollments/${id}/checklist/${tipoDocumento}/upload`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useRevisarDocumentoMatricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tipoDocumento,
      estado,
      comentario,
    }: {
      id: string;
      tipoDocumento: TipoDocumentoMatricula;
      estado: Extract<EstadoDocumentoMatricula, 'APROBADO' | 'RECHAZADO'>;
      comentario?: string;
    }) => api.patch<Enrollment>(`/enrollments/${id}/checklist/${tipoDocumento}/revisar`, { estado, comentario }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useAgregarDocumentoChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tipo_documento,
      nombre_personalizado,
      obligatorio,
    }: {
      id: string;
      tipo_documento: TipoDocumentoMatricula;
      nombre_personalizado?: string;
      obligatorio?: boolean;
    }) => api.post<Enrollment>(`/enrollments/${id}/checklist`, { tipo_documento, nombre_personalizado, obligatorio }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useEliminarDocumentoChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoDocumento }: { id: string; tipoDocumento: TipoDocumentoMatricula }) =>
      api.delete<Enrollment>(`/enrollments/${id}/checklist/${tipoDocumento}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}

export function useSincronizarRequisitosMatricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Enrollment>(`/enrollments/${id}/sincronizar-requisitos`, {}),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', id] });
    },
  });
}

export function useActualizarComentarioDocumento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tipoDocumento,
      comentario,
    }: {
      id: string;
      tipoDocumento: TipoDocumentoMatricula;
      comentario: string | null;
    }) =>
      api.patch<Enrollment>(`/enrollments/${id}/checklist/${tipoDocumento}/comentario`, { comentario }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
    },
  });
}
