import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { RolInvolucrado, TipoSituacion } from './useObservaciones';

export const ESTADOS_REMISION = ['PENDIENTE', 'EN_ATENCION', 'ATENDIDA'] as const;
export type EstadoRemision = (typeof ESTADOS_REMISION)[number];
export const NOMBRES_ESTADO_REMISION: Record<EstadoRemision, string> = {
  PENDIENTE: 'Pendiente',
  EN_ATENCION: 'En atención',
  ATENDIDA: 'Atendida',
};

export interface AtencionOrientacion {
  _id: string;
  fecha: string;
  por_nombre: string | null;
  /** null cuando la escribió otro orientador: es confidencial de quien la hizo. */
  descripcion: string | null;
}

export interface RemisionOrientacion {
  _id: string;
  estado: EstadoRemision;
  caso_codigo: string;
  tipo_situacion: TipoSituacion;
  hechos: string;
  rol: RolInvolucrado;
  origen: 'MEDIDA' | 'PASO' | 'MANUAL';
  origen_detalle: string;
  student_id: string;
  estudiante: string;
  numero_documento: string;
  grupo: string;
  createdAt: string;
  atendida: string | null;
  atenciones: AtencionOrientacion[];
}

function useInvalidarRemisiones() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['orientacion'] });
  };
}

export function useBandejaRemisiones(estado: EstadoRemision | '', pagina: number) {
  return useQuery({
    queryKey: ['orientacion', 'remisiones', estado, pagina],
    queryFn: () =>
      api.raw<{ success: true; data: RemisionOrientacion[]; total: number; pagina: number; limite: number }>('/orientacion/remisiones', {
        query: { pagina, limite: 20, ...(estado ? { estado } : {}) },
      }),
    select: (res) => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useRemisionOrientacion(id: string | null) {
  return useQuery({
    queryKey: ['orientacion', 'remision', id],
    queryFn: () => api.get<RemisionOrientacion>(`/orientacion/remisiones/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useRegistrarAtencion() {
  const invalidar = useInvalidarRemisiones();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string; fecha: string; descripcion: string }) =>
      api.post<RemisionOrientacion>(`/orientacion/remisiones/${id}/atenciones`, datos),
    onSuccess: invalidar,
  });
}

export function useMarcarAtendida() {
  const invalidar = useInvalidarRemisiones();
  return useMutation({
    mutationFn: (id: string) => api.post<RemisionOrientacion>(`/orientacion/remisiones/${id}/atendida`, {}),
    onSuccess: invalidar,
  });
}
