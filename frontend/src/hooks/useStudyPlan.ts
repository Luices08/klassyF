import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  AsignaturaGrado,
  AsignaturaPersonalizadaGrupo,
  MetodoCalculoEvaluacion,
  PonderacionAsignatura,
  StudyPlan,
} from '../types/domain';

export function useStudyPlan(institucionId: string | undefined, academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['study-plan', institucionId, academicYearId],
    queryFn: () =>
      api.get<StudyPlan | null>('/curriculum/study-plan', {
        institucion_id: institucionId,
        academic_year_id: academicYearId,
      }),
    enabled: Boolean(institucionId && academicYearId),
    staleTime: 60_000,
  });
}

function invalidateStudyPlan(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['study-plan'] });
}

export interface ConfigurarAsignaturasGradoInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  asignaturas: AsignaturaGrado[];
}

export function useConfigurarAsignaturasGrado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigurarAsignaturasGradoInput) =>
      api.post<StudyPlan>('/curriculum/study-plan/asignaturas-grado', input),
    onSuccess: () => invalidateStudyPlan(queryClient),
  });
}

export interface ConfigurarAsignaturasMultiplesGradosInput {
  institucion_id: string;
  academic_year_id: string;
  grados: {
    grade_id: string;
    asignaturas: AsignaturaGrado[];
  }[];
}

export function useConfigurarAsignaturasMultiplesGrados() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigurarAsignaturasMultiplesGradosInput) =>
      api.post<StudyPlan>('/curriculum/study-plan/asignaturas-grados', input),
    onSuccess: () => invalidateStudyPlan(queryClient),
  });
}

export interface ConfigurarEvaluacionAreaInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  area_id: string;
  metodo_calculo: MetodoCalculoEvaluacion;
  asignaturas: PonderacionAsignatura[];
}

export function useConfigurarEvaluacionArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigurarEvaluacionAreaInput) =>
      api.post<StudyPlan>('/curriculum/study-plan/evaluacion-area', input),
    onSuccess: () => invalidateStudyPlan(queryClient),
  });
}

export interface ConfigurarDistribucionGrupoInput {
  institucion_id: string;
  academic_year_id: string;
  grade_id: string;
  group_id: string;
  intensidades_personalizadas: AsignaturaPersonalizadaGrupo[];
  asignaturas_agregadas: AsignaturaPersonalizadaGrupo[];
}

export function useConfigurarDistribucionGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigurarDistribucionGrupoInput) =>
      api.post<StudyPlan>('/curriculum/study-plan/distribucion-grupo', input),
    onSuccess: () => invalidateStudyPlan(queryClient),
  });
}

export interface CrearPlanDesdeAnioAnteriorInput {
  institucion_id: string;
  academic_year_id: string;
  academic_year_id_anterior: string;
}

export function useCrearPlanDesdeAnioAnterior() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearPlanDesdeAnioAnteriorInput) =>
      api.post<StudyPlan>('/curriculum/study-plan/copiar-anio-anterior', input),
    onSuccess: () => invalidateStudyPlan(queryClient),
  });
}

export interface LimitesHorasPlanEstudios {
  PREESCOLAR: number;
  PRIMARIA: number;
  SECUNDARIA: number;
  MEDIA: number;
}

/** Tope de horas semanales del Plan de Estudios por nivel (configuración institucional, antes quemado a 30). */
export function useLimitesHorasPlan() {
  return useQuery({
    queryKey: ['limites-horas-plan'],
    queryFn: () => api.get<LimitesHorasPlanEstudios>('/institution/limites-horas-plan'),
    staleTime: 5 * 60_000,
  });
}

export function useActualizarLimitesHorasPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<LimitesHorasPlanEstudios>) =>
      api.patch<LimitesHorasPlanEstudios>('/institution/limites-horas-plan', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['limites-horas-plan'] });
    },
  });
}
