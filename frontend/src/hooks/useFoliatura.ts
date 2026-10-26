import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export type EsquemaFoliatura = 'ANUAL' | 'CONTINUO';

/** Cómo numera el colegio su Libro de Matrícula y cuál será el próximo folio. */
export interface VistaFoliatura {
  esquema: EsquemaFoliatura;
  mascara: string;
  capacidad_por_libro: number | null;
  libro_actual: number | null;
  ultimo_folio: number;
  /** false = valores de partida que nadie con permiso ha revisado. */
  confirmada: boolean;
  hay_folios_emitidos: boolean;
  total_emitidos: number;
  anio_de_referencia: number;
  siguiente: { libro: number; folio: number; codigo: string };
}

export interface CambiosFoliatura {
  esquema: EsquemaFoliatura;
  mascara: string;
  capacidad_por_libro: number | null;
  libro_actual: number;
  ultimo_folio: number;
  motivo?: string;
}

export function useFoliatura() {
  return useQuery({
    queryKey: ['foliatura'],
    queryFn: () => api.get<VistaFoliatura>('/foliatura'),
  });
}

export function useActualizarFoliatura() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosFoliatura) => api.put<VistaFoliatura>('/foliatura', cambios),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['foliatura'] });
    },
  });
}
