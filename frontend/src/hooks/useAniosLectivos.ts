import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  AcademicYear,
  Calendario,
  EstadoPeriodoAcademico,
  PeriodoSede,
  Prorroga,
  TipoEventoCalendario,
  VerificacionCierre,
} from '../types/domain';

/** Todos los años de la institucion (más reciente primero), con resumen de semanas. Lo consumen todos los roles. */
export function useAniosLectivos() {
  return useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get<AcademicYear[]>('/academic-years'),
    staleTime: 60_000,
  });
}

export interface PeriodoInput {
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_apertura_notas: string | null;
  fecha_cierre_notas: string | null;
}

export interface DatosAnioInput {
  nombre: string;
  calendario: Calendario;
  fecha_inicio: string;
  fecha_fin: string;
  periodos: PeriodoInput[];
}

export interface CrearAnioInput extends DatosAnioInput {
  year: number;
  copiar_grupos_de_id?: string;
}

// Toda mutación del año o de su calendario refresca el prefijo 'academic-years' (lista, prórrogas, cierre).
function useInvalidarAnios() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['academic-years'] });
  };
}

export function useCrearAnio() {
  const invalidar = useInvalidarAnios();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearAnioInput) =>
      api.post<AcademicYear & { grupos_copiados: number }>('/academic-years', input),
    onSuccess: (_anio, input) => {
      invalidar();
      if (input.copiar_grupos_de_id) void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useActualizarAnio() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ id, ...input }: DatosAnioInput & { id: string }) =>
      api.patch<AcademicYear>(`/academic-years/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useActivarAnio() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: (id: string) => api.patch<AcademicYear>(`/academic-years/${id}/activar`),
    onSuccess: invalidar,
  });
}

export function useVerificacionCierre(anioId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['academic-years', anioId, 'cierre'],
    queryFn: () => api.get<VerificacionCierre>(`/academic-years/${anioId}/cierre`),
    enabled: enabled && Boolean(anioId),
    // El resultado depende del momento (recuperaciones vigentes): siempre fresco al abrir el paso 1.
    staleTime: 0,
  });
}

export function useCerrarAnio() {
  const invalidar = useInvalidarAnios();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; confirm_password: string; confirmar_year: number }) =>
      api.post<AcademicYear>(`/academic-years/${id}/cerrar`, input),
    onSuccess: () => {
      invalidar();
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useCambiarEstadoPeriodo() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({
      anioId,
      numero,
      estado,
      motivo,
    }: {
      anioId: string;
      numero: number;
      estado: EstadoPeriodoAcademico;
      motivo?: string;
    }) => api.patch<AcademicYear>(`/academic-years/${anioId}/periodos/${numero}/estado`, { estado, motivo }),
    onSuccess: invalidar,
  });
}

export interface EventoInput {
  tipo: TipoEventoCalendario;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_numero: number | null;
  fecha_limite_resultados: string | null;
}

export function useCrearEvento() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, ...input }: EventoInput & { anioId: string }) =>
      api.post<AcademicYear>(`/academic-years/${anioId}/eventos`, input),
    onSuccess: invalidar,
  });
}

export function useActualizarEvento() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, eventoId, ...input }: EventoInput & { anioId: string; eventoId: string }) =>
      api.patch<AcademicYear>(`/academic-years/${anioId}/eventos/${eventoId}`, input),
    onSuccess: invalidar,
  });
}

export function useEliminarEvento() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, eventoId }: { anioId: string; eventoId: string }) =>
      api.delete<AcademicYear>(`/academic-years/${anioId}/eventos/${eventoId}`),
    onSuccess: invalidar,
  });
}

export function useGuardarCalendarioSede() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, sedeId, periodos }: { anioId: string; sedeId: string; periodos: PeriodoSede[] }) =>
      api.put<AcademicYear>(`/academic-years/${anioId}/sedes/${sedeId}/calendario`, { periodos }),
    onSuccess: invalidar,
  });
}

export function useQuitarCalendarioSede() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, sedeId }: { anioId: string; sedeId: string }) =>
      api.delete<AcademicYear>(`/academic-years/${anioId}/sedes/${sedeId}/calendario`),
    onSuccess: invalidar,
  });
}

export function useProrrogas(anioId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['academic-years', anioId, 'prorrogas'],
    queryFn: () => api.get<Prorroga[]>(`/academic-years/${anioId}/prorrogas`),
    enabled: enabled && Boolean(anioId),
  });
}

export interface OtorgarProrrogaInput {
  anioId: string;
  periodo_numero: number;
  docente_id: string | null;
  group_id: string | null;
  hasta: string;
  justificacion: string;
}

export function useOtorgarProrroga() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, ...input }: OtorgarProrrogaInput) =>
      api.post<Prorroga>(`/academic-years/${anioId}/prorrogas`, input),
    onSuccess: invalidar,
  });
}

export function useRevocarProrroga() {
  const invalidar = useInvalidarAnios();
  return useMutation({
    mutationFn: ({ anioId, prorrogaId }: { anioId: string; prorrogaId: string }) =>
      api.patch<Prorroga>(`/academic-years/${anioId}/prorrogas/${prorrogaId}/revocar`),
    onSuccess: invalidar,
  });
}
