import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Espacio, EstadoEspacio, RecursoEspacio, TipoEspacio } from '../types/domain';

export interface EspaciosFilter {
  sede_id?: string;
  tipo_espacio?: TipoEspacio;
  estado?: EstadoEspacio;
  /** Año lectivo de los grupos que se reportan como asignados a cada espacio. */
  academic_year_id?: string;
  [key: string]: string | undefined;
}

export function useEspacios(filter: EspaciosFilter = {}, enabled = true) {
  return useQuery({
    queryKey: ['espacios', filter],
    queryFn: () => api.get<Espacio[]>('/espacios', filter),
    enabled,
  });
}

export interface EspacioInput {
  nombre: string;
  tipo_espacio: TipoEspacio;
  capacidad: number;
  piso_bloque: string | null;
  recursos: RecursoEspacio[];
  computadores_operativos: number;
  areas_exclusivas: string[];
  admite_grupos_simultaneos: boolean;
}

// Los grupos muestran el nombre y aforo de su aula: cualquier cambio del espacio refresca ambos listados.
function useInvalidarEspacios() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['espacios'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };
}

export function useCrearEspacio() {
  const invalidar = useInvalidarEspacios();
  return useMutation({
    mutationFn: (input: EspacioInput & { sede_id: string }) => api.post<Espacio>('/espacios', input),
    onSuccess: invalidar,
  });
}

export function useActualizarEspacio() {
  const invalidar = useInvalidarEspacios();
  return useMutation({
    mutationFn: ({ id, ...input }: EspacioInput & { id: string }) => api.patch<Espacio>(`/espacios/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoEspacio() {
  const invalidar = useInvalidarEspacios();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoEspacio }) =>
      api.patch<Espacio>(`/espacios/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarEspacio() {
  const invalidar = useInvalidarEspacios();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/espacios/${id}`),
    onSuccess: invalidar,
  });
}
