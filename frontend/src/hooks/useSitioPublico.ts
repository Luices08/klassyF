import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, urlDeApi } from '../lib/apiClient';
import type { ConfiguracionSitio, ImagenSitio, SitioParaAdministrar, VistaSitio } from '../types/sitioPublico';

/** Lo que dibuja la página pública del colegio (sin sesión). */
export function useSitioPublico() {
  return useQuery({
    queryKey: ['public', 'sitio'],
    queryFn: () => api.get<VistaSitio>('/public/sitio'),
    staleTime: 60_000,
    retry: 1,
  });
}

export const urlImagenSitio = (imagen: ImagenSitio) => urlDeApi(`/public/sitio/imagenes/${imagen.id}?v=${imagen.version}`);

export function useSitioParaAdministrar() {
  return useQuery({
    queryKey: ['sitio-publico'],
    queryFn: () => api.get<SitioParaAdministrar>('/sitio-publico'),
  });
}

function useInvalidarSitio() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['sitio-publico'] });
    void queryClient.invalidateQueries({ queryKey: ['public', 'sitio'] });
  };
}

export function useGuardarSitio() {
  const invalidar = useInvalidarSitio();
  return useMutation({
    mutationFn: (configuracion: ConfiguracionSitio) => api.put<SitioParaAdministrar>('/sitio-publico', configuracion),
    onSuccess: invalidar,
  });
}

export function useAgregarImagenSitio() {
  const invalidar = useInvalidarSitio();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<SitioParaAdministrar>('/sitio-publico/imagenes', formData);
    },
    onSuccess: invalidar,
  });
}

export function useQuitarImagenSitio() {
  const invalidar = useInvalidarSitio();
  return useMutation({
    mutationFn: (id: string) => api.delete<SitioParaAdministrar>(`/sitio-publico/imagenes/${id}`),
    onSuccess: invalidar,
  });
}
