import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { CategoriaDocumentoMatricula, NivelEducativo, TipoIngreso } from '../types/domain';

export type CondicionRequisito = 'NINGUNA' | 'CON_DISCAPACIDAD' | 'ACUDIENTE_NO_PADRE_MADRE';

export const NOMBRES_CONDICION_REQUISITO: Record<CondicionRequisito, string> = {
  NINGUNA: 'Sin condición',
  CON_DISCAPACIDAD: 'Solo si el estudiante tiene discapacidad (PIAR)',
  ACUDIENTE_NO_PADRE_MADRE: 'Solo si el acudiente no es padre ni madre',
};

export const NOMBRES_CATEGORIA_REQUISITO: Record<CategoriaDocumentoMatricula, string> = {
  IDENTIFICACION_SALUD: 'Identificación y salud',
  TRAYECTORIA_ACADEMICA: 'Trayectoria académica',
  INCLUSION_PIAR: 'Inclusión (PIAR)',
  INSTITUCIONAL: 'Institucional',
};

export interface RequisitoDocumental {
  _id: string;
  clave: string;
  nombre: string;
  indicacion: string;
  categoria: CategoriaDocumentoMatricula;
  obligatorio: boolean;
  niveles: NivelEducativo[];
  grados_numeros: number[];
  tipos_ingreso: TipoIngreso[];
  condicion_especial: CondicionRequisito;
  /** Un módulo del sistema lo aprueba solo (hoy, el paz y salvo del año anterior). */
  aprobacion_automatica: string | null;
  estado: 'activo' | 'inactivo';
  /** Alguna matrícula ya lo tiene en su checklist (no se puede eliminar, solo desactivar). */
  en_uso: boolean;
}

export type DatosRequisito = Pick<RequisitoDocumental, 'nombre' | 'indicacion' | 'categoria' | 'obligatorio' | 'niveles' | 'grados_numeros' | 'tipos_ingreso' | 'condicion_especial'>;

/** El catálogo de documentos que el colegio pide al matricular (M04). */
export function useRequisitosDocumentales(estado?: 'activo' | 'inactivo') {
  return useQuery({
    queryKey: ['requisitos-documentales', estado ?? 'todos'],
    queryFn: () => api.get<RequisitoDocumental[]>('/requisitos-documentales', { estado }),
    staleTime: 60_000,
  });
}

function useCambiaCatalogo<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requisitos-documentales'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'documentos-previstos'] });
    },
  });
}

export const useCrearRequisito = () => useCambiaCatalogo((datos: DatosRequisito) => api.post<RequisitoDocumental>('/requisitos-documentales', datos));
export const useActualizarRequisito = () => useCambiaCatalogo(({ id, datos }: { id: string; datos: DatosRequisito }) => api.put<RequisitoDocumental>(`/requisitos-documentales/${id}`, datos));
export const useCambiarEstadoRequisito = () => useCambiaCatalogo(({ id, estado }: { id: string; estado: 'activo' | 'inactivo' }) => api.patch<RequisitoDocumental>(`/requisitos-documentales/${id}/estado`, { estado }));
export const useEliminarRequisito = () => useCambiaCatalogo((id: string) => api.delete(`/requisitos-documentales/${id}`));
