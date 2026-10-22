import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// Rematrícula por sede, grado o grupo (M19 → M04): reglas de prioridad y balanceo, y lista de espera. La simulación y la reserva de cupos
// viven en usePromocion (comparten el rollover).

export type CriterioDesempate = 'PROMEDIO_GENERAL' | 'ANTIGUEDAD' | 'SIN_FALTAS_GRAVES';

export const NOMBRES_CRITERIO: Record<CriterioDesempate, { nombre: string; descripcion: string }> = {
  PROMEDIO_GENERAL: { nombre: 'Promedio general del año', descripcion: 'Mayor promedio primero (sale del cierre de promoción).' },
  ANTIGUEDAD: { nombre: 'Antigüedad en el plantel', descripcion: 'Más años matriculado en el colegio primero.' },
  SIN_FALTAS_GRAVES: { nombre: 'Sin faltas graves de convivencia', descripcion: 'Quien no tuvo faltas tipo II o III primero. Solo ordena: el detalle nunca se muestra.' },
};

export interface ConfiguracionRematricula {
  criterios_desempate: Array<{ criterio: CriterioDesempate; activo: boolean }>;
  tolerancia_ocupacion_pct: number;
}

export type EstadoEsperaRematricula = 'EN_ESPERA' | 'ASIGNADA' | 'DESCARTADA';

export interface FilaListaEspera {
  _id: string;
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  estado: EstadoEsperaRematricula;
  posicion: number;
  grado_destino: string;
  grupo_origen: string;
  tipo_ingreso: 'ANTIGUO' | 'REPITENTE';
  motivo: string;
  sede_id: string;
  grupos_con_cupo: Array<{ id: string; nombre: string; libres: number }>;
}

export function useConfiguracionRematricula() {
  return useQuery({
    queryKey: ['rematricula', 'configuracion'],
    queryFn: () => api.get<ConfiguracionRematricula>('/promocion/rematricula/configuracion'),
  });
}

export function useActualizarConfiguracionRematricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfiguracionRematricula) => api.put<ConfiguracionRematricula>('/promocion/rematricula/configuracion', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rematricula', 'configuracion'] });
    },
  });
}

export function useListaEspera(destinoId: string | undefined, sedeId?: string, gradeId?: string) {
  return useQuery({
    queryKey: ['rematricula', 'lista-espera', destinoId, sedeId ?? null, gradeId ?? null],
    queryFn: () => api.get<FilaListaEspera[]>('/promocion/rematricula/lista-espera', { destino_id: destinoId, sede_id: sedeId, grade_id: gradeId }),
    enabled: Boolean(destinoId),
  });
}

function useInvalidarRematricula() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['rematricula'] });
    void queryClient.invalidateQueries({ queryKey: ['promocion', 'rollover'] });
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };
}

export function useAsignarDesdeEspera() {
  const invalidar = useInvalidarRematricula();
  return useMutation({
    mutationFn: ({ id, group_id }: { id: string; group_id: string }) => api.post<{ enrollment_id: string; grupo: string }>(`/promocion/rematricula/lista-espera/${id}/asignar`, { group_id }),
    onSuccess: invalidar,
  });
}

export function useDescartarDeEspera() {
  const invalidar = useInvalidarRematricula();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<{ _id: string; estado: EstadoEsperaRematricula }>(`/promocion/rematricula/lista-espera/${id}/descartar`, { motivo }),
    onSuccess: invalidar,
  });
}
