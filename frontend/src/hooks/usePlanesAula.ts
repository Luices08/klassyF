import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { BandejaPlanesAula, DetallePlanAula, EstadoPlanVista, MisPlanesAula, PlanDeAsignacion } from '../types/domain';
import type { RevisarPlanInput } from './usePlanesArea';

/** Las tarjetas del docente: una por asignatura y grado que dicta, con sus periodos ya resueltos por el servidor. */
export function useMisPlanesAula(anioId: string | undefined) {
  return useQuery({
    queryKey: ['planes-aula', 'mios', anioId],
    queryFn: () => api.get<MisPlanesAula>('/planeacion/planes-aula/mios', { academic_year_id: anioId }),
    enabled: Boolean(anioId),
    staleTime: 60_000,
  });
}

export interface FiltroBandejaPlanesAula {
  academic_year_id?: string;
  periodo_numero?: number;
  area_id?: string;
  grade_id?: string;
  docente_id?: string;
  estado?: EstadoPlanVista | '';
}

/** Cobertura para coordinación: lo esperado (docente × asignatura × grado × periodo) frente a lo radicado. */
export function useBandejaPlanesAula(filtro: FiltroBandejaPlanesAula) {
  return useQuery({
    queryKey: ['planes-aula', 'bandeja', filtro],
    queryFn: () =>
      api.get<BandejaPlanesAula>('/planeacion/planes-aula', {
        academic_year_id: filtro.academic_year_id,
        periodo_numero: filtro.periodo_numero || undefined,
        area_id: filtro.area_id || undefined,
        grade_id: filtro.grade_id || undefined,
        docente_id: filtro.docente_id || undefined,
        estado: filtro.estado || undefined,
      }),
    enabled: Boolean(filtro.academic_year_id),
    staleTime: 60_000,
  });
}

export function usePlanAula(id: string | undefined) {
  return useQuery({
    queryKey: ['planes-aula', 'detalle', id],
    queryFn: () => api.get<DetallePlanAula>(`/planeacion/planes-aula/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** El plan de aula de una clase en un periodo: el visor del formulario de actividades y su compuerta. */
export function usePlanDeAsignacion(asignacionId: string | undefined, periodo: number | undefined) {
  return useQuery({
    queryKey: ['planes-aula', 'de-asignacion', asignacionId, periodo],
    queryFn: () => api.get<PlanDeAsignacion>('/planeacion/planes-aula/de-asignacion', { teacher_assignment_id: asignacionId, periodo_numero: periodo }),
    enabled: Boolean(asignacionId && periodo),
    staleTime: 30_000,
  });
}

/** El PDF de una versión (la última si no se indica), pedido con la sesión. */
export const cargarArchivoPlanAula = (id: string, version?: number) =>
  api.downloadBlob(`/planeacion/planes-aula/${id}/archivo${version ? `?version=${version}` : ''}`);

export interface RadicarPlanAulaInput {
  academic_year_id: string;
  periodo_numero: number;
  subject_id: string;
  grade_id: string;
  titulo: string;
  descripcion: string;
  archivo: File;
}

export function useRadicarPlanAula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, ...datos }: RadicarPlanAulaInput) => {
      const form = new FormData();
      form.append('file', archivo);
      for (const [clave, valor] of Object.entries(datos)) form.append(clave, String(valor));
      return api.upload<DetallePlanAula>('/planeacion/planes-aula', form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}

/** Adoptar el plan aprobado del docente anterior: queda habilitado al instante, sin cola de revisión. */
export function useAdoptarPlanAula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planOrigenId: string) => api.post<DetallePlanAula>('/planeacion/planes-aula/adoptar', { plan_origen_id: planOrigenId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}

export function useRevisarPlanAula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cuerpo }: RevisarPlanInput) => api.patch<DetallePlanAula>(`/planeacion/planes-aula/${id}/revision`, cuerpo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}

/** Solo el ADMIN reabre un plan aprobado, con motivo. */
export function useReabrirPlanAula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.patch<DetallePlanAula>(`/planeacion/planes-aula/${id}/reabrir`, { motivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['planes-aula'] });
    },
  });
}
