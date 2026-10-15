import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DocumentoReferencia } from '../types/domain';

export interface FiltroDocumentosReferencia {
  area_id?: string;
  grade_id?: string;
}

/** Los PDF de apoyo (DBA, estándares, lineamientos) por área y grados: coordinación los administra y los docentes los consultan. */
export function useDocumentosReferencia(filtro: FiltroDocumentosReferencia = {}, enabled = true) {
  return useQuery({
    queryKey: ['documentos-referencia', filtro],
    queryFn: () =>
      api.get<DocumentoReferencia[]>('/planeacion/documentos-referencia', {
        area_id: filtro.area_id || undefined,
        grade_id: filtro.grade_id || undefined,
      }),
    enabled,
    staleTime: 2 * 60_000,
  });
}

/** El PDF se pide con la sesión (nunca por URL directa) y lo consume `VistaPreviaPdf`/`PanelDocumentosPdf`. */
export const cargarArchivoDocumento = (id: string) => api.downloadBlob(`/planeacion/documentos-referencia/${id}/archivo`);

export interface DatosDocumentoReferencia {
  titulo: string;
  descripcion: string;
  area_id: string;
  grados_ids: string[];
}

function formulario(datos: DatosDocumentoReferencia, archivo: File): FormData {
  const form = new FormData();
  form.append('file', archivo);
  form.append('titulo', datos.titulo);
  form.append('descripcion', datos.descripcion);
  form.append('area_id', datos.area_id);
  // Una lista viaja repitiendo el campo.
  for (const grado of datos.grados_ids) form.append('grados_ids', grado);
  return form;
}

export function useCrearDocumentoReferencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ datos, archivo }: { datos: DatosDocumentoReferencia; archivo: File }) =>
      api.upload<DocumentoReferencia>('/planeacion/documentos-referencia', formulario(datos, archivo)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documentos-referencia'] });
    },
  });
}

export function useActualizarDocumentoReferencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: Partial<DatosDocumentoReferencia> }) =>
      api.patch<DocumentoReferencia>(`/planeacion/documentos-referencia/${id}`, datos),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documentos-referencia'] });
    },
  });
}

/** El PDF se reemplaza por su propia ruta (las subidas del sistema son POST). */
export function useReemplazarArchivoDocumento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archivo }: { id: string; archivo: File }) => {
      const form = new FormData();
      form.append('file', archivo);
      return api.upload<DocumentoReferencia>(`/planeacion/documentos-referencia/${id}/archivo`, form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documentos-referencia'] });
    },
  });
}

export function useEliminarDocumentoReferencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/planeacion/documentos-referencia/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documentos-referencia'] });
    },
  });
}
