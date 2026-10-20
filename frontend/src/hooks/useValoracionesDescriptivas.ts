import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export type NivelValoracion = 'INICIADO' | 'EN_PROCESO' | 'ALCANZADO';

export const NOMBRES_NIVEL_VALORACION: Record<NivelValoracion, string> = { INICIADO: 'Iniciado', EN_PROCESO: 'En proceso', ALCANZADO: 'Alcanzado' };
export const MIN_CARACTERES_DESCRIPTOR = 10;

export interface ValoracionDescriptiva {
  nivel: NivelValoracion;
  fortalezas: string;
  recomendaciones: string;
}

export interface FilaPlanillaDescriptiva {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  valoracion: ValoracionDescriptiva | null;
}

export interface PlanillaDescriptiva {
  asignatura: string;
  grupo: string;
  periodo_numero: number;
  editable: boolean;
  motivo_no_editable: string | null;
  filas: FilaPlanillaDescriptiva[];
}

/** La planilla cualitativa de una clase de Preescolar (Decreto 2247/1997): nivel de avance y descriptor por estudiante, sin notas numéricas. */
export function usePlanillaDescriptiva(asignacionId: string | undefined, periodo: number | undefined) {
  return useQuery({
    queryKey: ['valoraciones-descriptivas', 'planilla', asignacionId, periodo],
    queryFn: () => api.get<PlanillaDescriptiva>('/valoraciones-descriptivas/planilla', { teacher_assignment_id: asignacionId, periodo_numero: periodo }),
    enabled: Boolean(asignacionId && periodo),
    staleTime: 15_000,
  });
}

export function useGuardarValoraciones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { teacher_assignment_id: string; periodo_numero: number; valoraciones: Array<ValoracionDescriptiva & { student_id: string }> }) => api.put<{ guardadas: number }>('/valoraciones-descriptivas/planilla', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['valoraciones-descriptivas'] });
    },
  });
}

/** El informe descriptivo de un estudiante en un periodo (PDF), con la sesión del usuario. */
export const descargarInformeDescriptivo = (studentId: string, anioId: string, periodo: number) =>
  api.downloadBlob(`/valoraciones-descriptivas/informe/pdf?student_id=${studentId}&academic_year_id=${anioId}&periodo_numero=${periodo}`);
