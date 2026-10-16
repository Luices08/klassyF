import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Rol } from '../types/api';

export type EstadoPazYSalvo = 'CARGADO' | 'CONFIRMADO' | 'RECHAZADO';
export type FiltroEstadoPazYSalvo = 'SIN_CARGAR' | EstadoPazYSalvo;

export const NOMBRES_ESTADO_PAZ_Y_SALVO: Record<FiltroEstadoPazYSalvo, string> = {
  SIN_CARGAR: 'Sin cargar',
  CARGADO: 'Por confirmar',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'No confirmado',
};

/** Lo que el servidor permite a quien consulta: la pantalla solo lo refleja. */
export interface PermisoPazYSalvo {
  ver: boolean;
  cargar: boolean;
  confirmar: boolean;
  revocar: boolean;
  motivo: string | null;
}

export interface FilaPazYSalvo {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  group_id: string | null;
  grupo: string | null;
  paz_y_salvo_id: string | null;
  estado: FiltroEstadoPazYSalvo;
  tiene_archivo: boolean;
  cargado_por: string | null;
  cargado_por_rol: Rol | null;
  fecha_carga: string | null;
  revisado_por: string | null;
  revisado_por_rol: Rol | null;
  fecha_revision: string | null;
  observacion: string | null;
}

export interface ResumenPazYSalvo {
  total: number;
  sin_cargar: number;
  cargado: number;
  confirmado: number;
  rechazado: number;
}

export interface FiltroPazYSalvo {
  academic_year_id?: string;
  group_id?: string;
  estado?: FiltroEstadoPazYSalvo;
  search?: string;
  page?: number;
  limit?: number;
}

export function usePazYSalvo(filtro: FiltroPazYSalvo) {
  return useQuery({
    queryKey: ['paz-y-salvo', filtro],
    queryFn: () =>
      api.raw<{ success: true; data: FilaPazYSalvo[]; total: number; page: number; pages: number; resumen: ResumenPazYSalvo; puede: PermisoPazYSalvo }>(
        '/paz-y-salvo',
        { query: { ...filtro } }
      ),
    enabled: Boolean(filtro.academic_year_id),
  });
}

function useInvalidarPazYSalvo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['paz-y-salvo'] });
    // Confirmar o quitar el paz y salvo puede aprobar o devolver el documento en matrículas del año siguiente.
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  };
}

export function useCargarPazYSalvo() {
  const invalidar = useInvalidarPazYSalvo();
  return useMutation({
    mutationFn: ({ studentId, anioId, file }: { studentId: string; anioId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload(`/paz-y-salvo/estudiantes/${studentId}/anios/${anioId}/archivo`, form);
    },
    onSuccess: invalidar,
  });
}

export function useRevisarPazYSalvo() {
  const invalidar = useInvalidarPazYSalvo();
  return useMutation({
    mutationFn: ({ studentId, anioId, ...cuerpo }: { studentId: string; anioId: string; estado: 'CONFIRMADO' | 'RECHAZADO'; observacion?: string }) =>
      api.patch(`/paz-y-salvo/estudiantes/${studentId}/anios/${anioId}`, cuerpo),
    onSuccess: invalidar,
  });
}

/** El soporte se baja con sesión (nunca por URL directa). */
export async function abrirArchivoPazYSalvo(id: string): Promise<void> {
  const { url } = await api.downloadBlob(`/paz-y-salvo/${id}/archivo`);
  window.open(url, '_blank');
}
