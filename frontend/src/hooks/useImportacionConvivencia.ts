import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { ProcesoConvivencia } from '../lib/columnasImportacion';

export interface ResultadoImportacionConvivencia {
  lote_id: string;
  proceso: ProcesoConvivencia;
  formato: 'xlsx' | 'csv';
  filas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
}

export interface ErrorFilaImportacion {
  fila: number;
  mensaje: string;
}

export interface LoteImportacion {
  _id: string;
  proceso: ProcesoConvivencia;
  archivo_nombre: string;
  formato: 'xlsx' | 'csv';
  filas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  estado: 'ACTIVO' | 'ANULADO';
  createdAt: string;
  anulacion: { motivo: string; observaciones_anuladas: number } | null;
}

/** Los catálogos y las observaciones cambian al cargar; el lote nuevo se ve en el listado. */
function useInvalidarTrasCarga() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['observaciones'] });
    void queryClient.invalidateQueries({ queryKey: ['importacion'] });
  };
}

export function useImportarConvivencia() {
  const invalidar = useInvalidarTrasCarga();
  return useMutation({
    mutationFn: ({ proceso, archivo }: { proceso: ProcesoConvivencia; archivo: File }) => {
      const formData = new FormData();
      formData.append('archivo', archivo);
      return api.upload<ResultadoImportacionConvivencia>(`/observaciones/importacion/${proceso}`, formData);
    },
    onSuccess: invalidar,
  });
}

export function useLotesImportacion(habilitado = true) {
  return useQuery({
    queryKey: ['importacion', 'lotes'],
    queryFn: () => api.get<LoteImportacion[]>('/observaciones/importacion/lotes'),
    enabled: habilitado,
  });
}

export function useAnularLoteImportacion() {
  const invalidar = useInvalidarTrasCarga();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.post<LoteImportacion>(`/observaciones/importacion/lotes/${id}/anulacion`, { motivo }),
    onSuccess: invalidar,
  });
}

/** La plantilla se baja con sesión (nunca por una URL pública). */
export async function descargarPlantillaConvivencia(proceso: ProcesoConvivencia, formato: 'xlsx' | 'csv', grupoId?: string): Promise<void> {
  const parametros = new URLSearchParams({ formato });
  if (grupoId) parametros.set('group_id', grupoId);
  const { url } = await api.downloadBlob(`/observaciones/importacion/plantilla/${proceso}?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `plantilla-${proceso}.${formato}`;
  enlace.click();
  URL.revokeObjectURL(url);
}
