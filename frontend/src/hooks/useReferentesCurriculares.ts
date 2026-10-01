import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EbcReferente, EstadoActivo, LineamientoReferente, ReferenteCurricular, TipoReferente } from '../types/domain';

export interface ReferentesFilters {
  grade_id?: string;
  area_id?: string;
  tipo_referente?: TipoReferente;
  grupo_grados?: string;
  organizador?: string;
  q?: string;
  estado?: EstadoActivo;
}

/** Malla de selección de referentes (hoy, en la práctica, DBA filtrados por grado y área). */
export function useReferentes(filters: ReferentesFilters, enabled = true) {
  return useQuery({
    queryKey: ['referentes-curriculares', filters],
    queryFn: () =>
      api.get<ReferenteCurricular[]>('/curriculum/referentes', {
        grade_id: filters.grade_id || undefined,
        area_id: filters.area_id || undefined,
        tipo_referente: filters.tipo_referente || undefined,
        grupo_grados: filters.grupo_grados || undefined,
        organizador: filters.organizador || undefined,
        q: filters.q || undefined,
        estado: filters.estado || undefined,
      }),
    enabled: enabled && Boolean(filters.area_id || filters.grade_id),
    staleTime: 5 * 60_000,
  });
}

export function useOrganizadoresPorArea(areaId: string | undefined, tipoReferente: 'DBA' | 'EBC' = 'DBA') {
  return useQuery({
    queryKey: ['referentes-curriculares', 'organizadores', areaId, tipoReferente],
    queryFn: () =>
      api.get<string[]>(`/curriculum/referentes/organizadores/${areaId}`, { tipo_referente: tipoReferente }),
    enabled: Boolean(areaId),
    staleTime: 10 * 60_000,
  });
}

export interface PanelApoyo {
  ebc: EbcReferente[];
  lineamientos: LineamientoReferente[];
}

/** EBC relacionados y Lineamientos del área (más los transversales) para consultar mientras se selecciona DBA. */
export function usePanelApoyo(areaId: string | undefined, gradeId: string | undefined) {
  return useQuery({
    queryKey: ['referentes-curriculares', 'apoyo', areaId, gradeId],
    queryFn: () => api.get<PanelApoyo>('/curriculum/referentes/apoyo', { area_id: areaId, grade_id: gradeId }),
    enabled: Boolean(areaId && gradeId),
    staleTime: 10 * 60_000,
  });
}
