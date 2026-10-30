import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { CatalogoHistorial, FiltrosHistorial, HistorialMatricula, PaginaHistorial } from '../types/historial';

/** Quita los filtros vacíos: así la clave de la consulta no cambia por un texto en blanco. */
const limpios = (f: FiltrosHistorial) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')) as FiltrosHistorial;

export function useHistorial(filtros: FiltrosHistorial, page: number) {
  const consulta = limpios(filtros);
  return useQuery({
    queryKey: ['historial', consulta, page],
    queryFn: () => api.raw<{ success: true } & PaginaHistorial>('/audit-logs', { query: { ...consulta, page, limit: 25 } }),
    select: (res): PaginaHistorial => ({ data: res.data, total: res.total, page: res.page, pages: res.pages }),
    placeholderData: (anterior) => anterior,
  });
}

export function useCatalogoHistorial() {
  return useQuery({
    queryKey: ['historial', 'catalogo'],
    queryFn: () => api.get<CatalogoHistorial>('/audit-logs/catalogo'),
    staleTime: Infinity,
  });
}

export function useHistorialMatricula(enrollmentId: string | undefined) {
  return useQuery({
    // Bajo 'enrollments': toda mutación de la matrícula ya invalida ese prefijo, así el historial se refresca solo.
    queryKey: ['enrollments', enrollmentId, 'historial'],
    queryFn: () => api.get<HistorialMatricula>(`/enrollments/${enrollmentId}/historial`),
    enabled: Boolean(enrollmentId),
  });
}

export function useExportarHistorial() {
  return useMutation({
    mutationFn: (filtros: FiltrosHistorial) => descargarHistorial(limpios(filtros), `historial-de-acciones-${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
}

async function descargarHistorial(filtros: FiltrosHistorial, nombreArchivo: string): Promise<void> {
  const parametros = new URLSearchParams(filtros as Record<string, string>);
  const { url } = await api.downloadBlob(`/audit-logs/excel?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
