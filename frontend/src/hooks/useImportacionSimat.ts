import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { ClasificacionSimat, FilaImportacionSimat, ImportacionSimat, OpcionesSimulacionSimat } from '../types/importacionSimat';

const BASE = '/enrollments/importacion-simat';

/** Sube el archivo y devuelve la simulación (el plan de lo que se haría); no escribe ningún estudiante ni matrícula. */
export function useSimularImportacionSimat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, opciones }: { archivo: File; opciones: OpcionesSimulacionSimat }) => {
      const datos = new FormData();
      datos.append('file', archivo);
      datos.append('reincorporar_retirados', String(opciones.reincorporar_retirados));
      datos.append('autorizacion_datos_salud', String(opciones.autorizacion_datos_salud));
      datos.append('cupo_por_defecto', String(opciones.cupo_por_defecto));
      datos.append('dias_compromiso', String(opciones.dias_compromiso));
      return api.upload<ImportacionSimat>(`${BASE}/simular`, datos);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-simat'] }),
  });
}

/** Una importación; mientras se está aplicando en segundo plano se vuelve a pedir sola para mostrar el avance. */
export function useImportacionSimat(id: string | null) {
  return useQuery({
    queryKey: ['importacion-simat', id],
    queryFn: () => api.get<ImportacionSimat>(`${BASE}/${id}`),
    enabled: Boolean(id),
    refetchInterval: (consulta) => (['EN_COLA', 'APLICANDO'].includes(consulta.state.data?.estado ?? '') ? 2000 : false),
  });
}

export function useImportacionesSimat() {
  return useQuery({ queryKey: ['importacion-simat', 'lista'], queryFn: () => api.get<ImportacionSimat[]>(BASE) });
}

export interface FiltroFilasSimat {
  clasificacion?: ClasificacionSimat;
  search?: string;
  page: number;
}

export function useFilasImportacionSimat(id: string | null, filtro: FiltroFilasSimat, estado?: string) {
  return useQuery({
    queryKey: ['importacion-simat', id, 'filas', filtro, estado],
    queryFn: () =>
      api.raw<{ success: true; data: FilaImportacionSimat[]; total: number; page: number; pages: number }>(`${BASE}/${id}/filas`, {
        query: { clasificacion: filtro.clasificacion, search: filtro.search || undefined, page: filtro.page, limit: 25 },
      }),
    enabled: Boolean(id),
    select: (r) => ({ data: r.data, total: r.total, page: r.page, pages: r.pages }),
    placeholderData: (anterior) => anterior,
  });
}

export function useAplicarImportacionSimat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm_password }: { id: string; confirm_password: string }) => api.post<ImportacionSimat>(`${BASE}/${id}/aplicar`, { confirm_password, confirmo_advertencias: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-simat'] }),
  });
}

export function useDescartarImportacionSimat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ descartada: boolean }>(`${BASE}/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['importacion-simat'] }),
  });
}

/** El informe se baja con la sesión (nunca por una dirección directa). */
export async function descargarInformeSimat(id: string): Promise<void> {
  const { url } = await api.downloadBlob(`${BASE}/${id}/informe`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'importacion-simat.xlsx';
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Cuando termina de aplicarse, las matrículas, estudiantes y cupos cambiaron: se refrescan las listas. */
export function useRefrescarTrasImportacion() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };
}
