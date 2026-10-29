import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DocumentoTerminos, TerminoPendiente } from '../lib/terminos';

export function useDocumentosTerminos() {
  return useQuery({
    queryKey: ['terminos', 'documentos'],
    queryFn: () => api.get<DocumentoTerminos[]>('/public/terminos'),
    staleTime: 10 * 60_000,
  });
}

/** Lo que falta por aceptar con el perfil de la sesión; la clave lleva persona y perfil para no mezclar sesiones. */
export function useTerminosPendientes(usuarioId: string | undefined, rol: string | undefined) {
  return useQuery({
    queryKey: ['terminos', 'pendientes', usuarioId, rol],
    queryFn: () => api.get<TerminoPendiente[]>('/terminos/pendientes'),
    enabled: Boolean(usuarioId),
    staleTime: Infinity,
  });
}

export function useAceptarTerminos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (terminos: TerminoPendiente[]) => api.post<TerminoPendiente[]>('/terminos/aceptar', { terminos }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['terminos', 'pendientes'] });
    },
  });
}
