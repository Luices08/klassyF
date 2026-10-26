import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoDocumentoMatricula, EstadoMatricula, Enrollment, EstudiantePorGrado, SituacionEstudianteMatricula, TipoDocumentoMatricula, TipoIngreso } from '../types/domain';

export interface CreateEnrollmentInput {
  student_id: string;
  group_id: string;
  academic_year_id: string;
  tipo_ingreso: TipoIngreso;
  estado_inicial?: 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO';
  documentacion_completa?: boolean;
  /** Claves de los documentos que secretaría tuvo en la mano: el estado (definitiva o condicional) lo decide el servidor con esto. */
  documentos_entregados?: string[];
  fecha_limite_compromiso?: string;
  forzar_sobrecupo?: boolean;
  /** Confirma la reincorporación de quien estaba RETIRADO o INACTIVO en su expediente. */
  reingreso?: boolean;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos: pasa a la bandeja de orientación (M16). */
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
  /** `Grade.numero` del último grado aprobado según el certificado: para quien no tiene historial en el sistema. */
  ultimo_grado_aprobado?: number | null;
  /** Por qué se matricula en un grado distinto al que indica su historial o su certificado. */
  motivo_grado?: string;
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

/** Todos los estudiantes con su situación frente a la matrícula del año: alimenta los filtros del formulario de matrícula. */
export function useSituacionEstudiantes(anioId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'estudiantes-situacion', anioId],
    queryFn: () => api.get<SituacionEstudianteMatricula[]>('/enrollments/estudiantes-situacion', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
  });
}

/**
 * Los mismos estudiantes de `useSituacionEstudiantes` con el grado donde les toca matricularse. Comparte la clave `['enrollments', ...]`, así una
 * matrícula nueva la refresca; es la fuente del formulario de matrícula y de la lista «Por grado».
 */
export function useEstudiantesPorGrado(anioId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'estudiantes-por-grado', anioId],
    queryFn: () => api.get<EstudiantePorGrado[]>('/enrollments/estudiantes-por-grado', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
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
      // Solo al formalizar (PREINSCRITO -> MATRICULADO_*); el libro y el folio los asigna la configuración del Libro de Matrícula.
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
    // `aprobar` = «ya verifiqué el original»: el documento queda aprobado y no pasa a la bandeja de revisión.
    mutationFn: ({ id, tipoDocumento, file, aprobar }: { id: string; tipoDocumento: TipoDocumentoMatricula; file: File; aprobar?: boolean }) => {
      const formData = new FormData();
      formData.append('aprobar', aprobar ? 'true' : 'false');
      formData.append('file', file);
      return api.upload<Enrollment>(`/enrollments/${id}/checklist/${tipoDocumento}/upload`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-revisar'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-digitalizar'] });
    },
  });
}

/** «Tengo el original en la mano»: aprueba sin archivo uno o varios documentos (queda por digitalizar); `verificado: false` deshace una marca por error. */
export function useMarcarVerificacionFisica() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipos, verificado = true }: { id: string; tipos: string[]; verificado?: boolean }) =>
      api.patch<Enrollment>(`/enrollments/${id}/checklist/verificacion-fisica`, { tipos, verificado }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
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
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-revisar'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-digitalizar'] });
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
      /** Clave de un documento del catálogo; sin ella se agrega uno adicional con `nombre_personalizado`. */
      tipo_documento?: TipoDocumentoMatricula;
      nombre_personalizado?: string;
      obligatorio?: boolean;
    }) => api.post<Enrollment>(`/enrollments/${id}/checklist`, { tipo_documento, nombre_personalizado, obligatorio }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', variables.id] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-revisar'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-digitalizar'] });
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
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-revisar'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-digitalizar'] });
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
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-revisar'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-por-digitalizar'] });
    },
  });
}

export interface DocumentoPorRevisar {
  enrollment_id: string;
  estado_matricula: EstadoMatricula;
  tipo_ingreso: TipoIngreso;
  tipo_documento: TipoDocumentoMatricula;
  nombre_personalizado: string | null;
  obligatorio?: boolean;
  fecha_carga: string | null;
  cargado_por_tipo?: 'FAMILIA' | 'PERSONAL' | null;
  cargado_por_nombre?: string | null;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string | null;
}

export function useDocumentosPorRevisar(filter: { academic_year_id?: string; group_id?: string; subido_por?: 'FAMILIA' | 'PERSONAL'; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['enrollments', 'documentos-por-revisar', filter],
    queryFn: () =>
      api.raw<{ success: true; data: DocumentoPorRevisar[]; total: number; page: number; pages: number }>('/enrollments/documentos-por-revisar', {
        query: { ...filter },
      }),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
    enabled: Boolean(filter.academic_year_id),
  });
}

/** Un documento verificado en físico al matricular que todavía no tiene archivo en el sistema. */
export interface DocumentoPorDigitalizar {
  enrollment_id: string;
  estado_matricula: EstadoMatricula;
  tipo_ingreso: TipoIngreso;
  tipo_documento: TipoDocumentoMatricula;
  nombre_personalizado: string | null;
  obligatorio?: boolean;
  fecha_verificacion_fisica: string;
  verificado_por_nombre?: string | null;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string | null;
}

export function useDocumentosPorDigitalizar(filter: { academic_year_id?: string; group_id?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['enrollments', 'documentos-por-digitalizar', filter],
    queryFn: () =>
      api.raw<{ success: true; data: DocumentoPorDigitalizar[]; total: number; page: number; pages: number }>('/enrollments/documentos-por-digitalizar', {
        query: { ...filter },
      }),
    select: (res) => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
    enabled: Boolean(filter.academic_year_id),
  });
}

export interface DocumentoPrevisto {
  tipo_documento: TipoDocumentoMatricula;
  nombre: string;
  indicacion: string;
  categoria: string;
  obligatorio: boolean;
  /** El paz y salvo del año anterior ya confirmado: el sistema lo aprueba al matricular, no hay nada que marcar como entregado. */
  ya_cubierto?: boolean;
}

/** Los documentos que se le pedirán al estudiante según el grado del grupo y su tipo de ingreso (mismo cálculo que al crear la matrícula). */
export function useDocumentosPrevistos(params: { group_id?: string; /** Sin grupo (una inscripción): el grado del que se piden. */ grade_id?: string; tipo_ingreso: TipoIngreso; student_id?: string }) {
  return useQuery({
    queryKey: ['enrollments', 'documentos-previstos', params],
    queryFn: () => api.get<DocumentoPrevisto[]>('/enrollments/documentos-previstos', { ...params }),
    enabled: Boolean(params.tipo_ingreso),
  });
}
