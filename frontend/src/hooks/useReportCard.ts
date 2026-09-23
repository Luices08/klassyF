import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { ReportCard } from '../types/reportCard';

export interface ReportCardQuery {
  student_id: string;
  academic_year_id: string;
  periodo: number;
  [key: string]: string | number;
}

export function useReportCard(query: ReportCardQuery | null) {
  return useQuery({
    queryKey: ['report-card', query],
    queryFn: () => api.get<ReportCard>('/reports/report-card', query ?? undefined),
    enabled: query !== null && Boolean(query.student_id && query.academic_year_id && query.periodo),
  });
}
