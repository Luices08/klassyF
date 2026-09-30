import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DBABankItem, TipoReferente } from '../types/domain';

export interface DbaBankFilters {
  grade_id?: string;
  area_id?: string;
  tipo_referente?: TipoReferente;
  organizador?: string;
  q?: string;
}

export function useDbaBank(filters: DbaBankFilters, enabled = true) {
  return useQuery({
    queryKey: ['dba-bank', filters],
    queryFn: () =>
      api.get<DBABankItem[]>('/curriculum/dba-bank', {
        grade_id: filters.grade_id || undefined,
        area_id: filters.area_id || undefined,
        tipo_referente: filters.tipo_referente || undefined,
        organizador: filters.organizador || undefined,
        q: filters.q || undefined,
      }),
    enabled: enabled && Boolean(filters.area_id || filters.grade_id),
    staleTime: 5 * 60_000,
  });
}

export function useOrganizadoresPorArea(areaId: string | undefined) {
  return useQuery({
    queryKey: ['dba-organizadores', areaId],
    queryFn: () => api.get<string[]>(`/curriculum/dba-bank/organizadores/${areaId}`),
    enabled: Boolean(areaId),
    staleTime: 10 * 60_000,
  });
}
