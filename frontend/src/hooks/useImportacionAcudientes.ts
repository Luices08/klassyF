import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { ClasificacionAcudientes, FilaImportacionAcudientes, ImportacionAcudientes } from '../types/importacionAcudientes';

const BASE = '/guardians/importacion';

/** Sube el archivo y devuelve la simulación (el plan de lo que se haría); no escribe ningún acudiente ni vínculo. */
export function useSimularImportacionAcudientes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, habilitar_portal }: { archivo: File; habilitar_portal: boolean }) => {
      const datos = new FormData();
      datos.append('file', archivo);
      datos.append('habilitar_portal', String(habilitar_portal));
      return api.upload<ImportacionAcudientes>(`${BASE}/simular`, datos);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-acudientes'] }),
  });
}

/** Una importación; mientras se está aplicando en segundo plano se vuelve a pedir sola para mostrar el avance. */
export function useImportacionAcudientes(id: string | null) {
  return useQuery({
    queryKey: ['importacion-acudientes', id],
    queryFn: () => api.get<ImportacionAcudientes>(`${BASE}/${id}`),
    enabled: Boolean(id),
    refetchInterval: (consulta) => (['EN_COLA', 'APLICANDO'].includes(consulta.state.data?.estado ?? '') ? 2000 : false),
  });
}

export function useImportacionesAcudientes() {
  return useQuery({ queryKey: ['importacion-acudientes', 'lista'], queryFn: () => api.get<ImportacionAcudientes[]>(BASE) });
}

export interface FiltroFilasAcudientes {
  clasificacion?: ClasificacionAcudientes;
  search?: string;
  page: number;
}

export function useFilasImportacionAcudientes(id: string | null, filtro: FiltroFilasAcudientes, estado?: string) {
  return useQuery({
    queryKey: ['importacion-acudientes', id, 'filas', filtro, estado],
    queryFn: () =>
      api.raw<{ success: true; data: FilaImportacionAcudientes[]; total: number; page: number; pages: number }>(`${BASE}/${id}/filas`, {
        query: { clasificacion: filtro.clasificacion, search: filtro.search || undefined, page: filtro.page, limit: 25 },
      }),
    enabled: Boolean(id),
    select: (r) => ({ data: r.data, total: r.total, page: r.page, pages: r.pages }),
    placeholderData: (anterior) => anterior,
  });
}

export function useAplicarImportacionAcudientes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm_password }: { id: string; confirm_password: string }) => api.post<ImportacionAcudientes>(`${BASE}/${id}/aplicar`, { confirm_password, confirmo_advertencias: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-acudientes'] }),
  });
}

export function useDescartarImportacionAcudientes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ descartada: boolean }>(`${BASE}/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-acudientes'] }),
  });
}

async function bajar(ruta: string, nombre: string): Promise<void> {
  const { url } = await api.downloadBlob(ruta);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Los archivos se bajan con la sesión (nunca por una dirección directa). */
export const descargarInformeAcudientes = (id: string): Promise<void> => bajar(`${BASE}/${id}/informe`, 'importacion-acudientes.xlsx');
export const descargarPlantillaAcudientes = (formato: 'xlsx' | 'csv'): Promise<void> => bajar(`${BASE}/plantilla?formato=${formato}`, `plantilla-acudientes.${formato}`);

/** Cuando termina de aplicarse, los acudientes y vínculos cambiaron: se refrescan las listas de estudiantes y acudientes. */
export function useRefrescarTrasImportacionAcudientes() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['guardians'] });
  };
}
