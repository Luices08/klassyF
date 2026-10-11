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

/** Los PDF son de acceso autenticado: se bajan con el token y se guardan con el nombre dado, nunca por URL directa. */
async function descargar(ruta: string, consulta: Record<string, string | number>, nombreArchivo: string): Promise<void> {
  const parametros = new URLSearchParams(Object.entries(consulta).map(([k, v]) => [k, String(v)]));
  const { url } = await api.downloadBlob(`${ruta}?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export const descargarPdfBoletin = (consulta: ReportCardQuery, nombreArchivo: string) =>
  descargar('/reports/report-card/pdf', consulta, nombreArchivo);

export const descargarPdfBoletinesGrupo = (consulta: { group_id: string; academic_year_id: string; periodo: number }, nombreArchivo: string) =>
  descargar('/reports/report-card/grupo/pdf', consulta, nombreArchivo);

/** El PDF del boletín como blob URL, para mostrarlo en la vista previa antes de descargarlo. */
export const cargarPdfBoletin = (consulta: ReportCardQuery) => {
  const parametros = new URLSearchParams(Object.entries(consulta).map(([k, v]) => [k, String(v)]));
  return api.downloadBlob(`/reports/report-card/pdf?${parametros.toString()}`);
};
