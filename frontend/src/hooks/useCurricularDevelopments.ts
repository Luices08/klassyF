import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { CurricularDevelopment, EstadoDesarrolloCurricular } from '../types/domain';

export interface CurricularDevelopmentsFilter {
  academic_year_id?: string;
  estado?: EstadoDesarrolloCurricular;
  periodo_numero?: number;
  teacher_assignment_id?: string;
  docente_id?: string;
}

export function useCurricularDevelopments(filters: CurricularDevelopmentsFilter = {}, enabled = true) {
  return useQuery({
    queryKey: ['curricular-developments', filters],
    queryFn: () =>
      api.get<CurricularDevelopment[]>('/curricular-developments', {
        academic_year_id: filters.academic_year_id || undefined,
        estado: filters.estado || undefined,
        periodo_numero: filters.periodo_numero || undefined,
        teacher_assignment_id: filters.teacher_assignment_id || undefined,
        docente_id: filters.docente_id || undefined,
      }),
    enabled,
    staleTime: 2 * 60_000,
  });
}

// Mismo prefijo plural 'curricular-developments' que el listado: invalidar ese prefijo basta
// para refrescar ambas cachés sin necesitar una segunda invalidación explícita por separado.
export function useCurricularDevelopment(assignmentId: string | undefined, periodoNumero: number | undefined) {
  return useQuery({
    queryKey: ['curricular-developments', 'por-asignacion', assignmentId, periodoNumero],
    queryFn: () =>
      api.get<CurricularDevelopment | null>(
        `/curricular-developments/assignment/${assignmentId}/periodo/${periodoNumero}`
      ),
    enabled: Boolean(assignmentId && periodoNumero),
    staleTime: 1 * 60_000,
  });
}

export interface GuardarBorradorInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  dba_seleccionados: string[];
  competencias: string;
  contenidos_tematicos: string[];
  ejes_tematicos?: string[];
  actividades_propuestas?: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas?: number;
}

export function useGuardarBorradorCurricular() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GuardarBorradorInput) =>
      api.post<CurricularDevelopment>('/curricular-developments', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curricular-developments'] });
    },
  });
}

export function useEnviarRevisionCurricular() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<CurricularDevelopment>(`/curricular-developments/${id}/submit`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curricular-developments'] });
    },
  });
}

export interface RevisarCurricularInput {
  id: string;
  decision: 'APROBADO' | 'DEVUELTO_OBSERVACIONES';
  observacion?: string;
}

export function useRevisarCurricular() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RevisarCurricularInput) =>
      api.patch<CurricularDevelopment>(`/curricular-developments/${id}/review`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curricular-developments'] });
    },
  });
}

export interface ReabrirCurricularInput {
  id: string;
  motivo: string;
}

/** ADMIN reabre una planeación ya APROBADO (vuelve a DEVUELTO_OBSERVACIONES) con motivo obligatorio. */
export function useReabrirCurricular() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: ReabrirCurricularInput) =>
      api.patch<CurricularDevelopment>(`/curricular-developments/${id}/reabrir`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curricular-developments'] });
    },
  });
}
