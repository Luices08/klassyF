import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { Rol } from '../types/api';

/** Campanita, puntos del menú y Tablero de anuncios (M28). Todo se acota en el servidor al perfil activo. */

export type SeveridadNotificacion = 'INFO' | 'IMPORTANTE' | 'CRITICA';

export interface Notificacion {
  id: string;
  evento: string;
  severidad: SeveridadNotificacion;
  titulo: string;
  mensaje: string;
  contador: number;
  ruta: string | null;
  leida: boolean;
  fecha: string;
}

export interface InsigniaMenu {
  ruta: string;
  /** Vacío = contador del módulo; con valor, de esa pestaña. */
  pestana: string;
  contador: number;
}

export interface ResumenNotificaciones {
  no_leidas: number;
  insignias: InsigniaMenu[];
}

export interface Anuncio {
  id: string;
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  publicar_desde: string;
  vence_el: string | null;
  fijado: boolean;
  estado: string;
  creado_por?: string;
  vigente: boolean;
}

export interface AnuncioInput {
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  publicar_desde?: string;
  vence_el?: string | null;
  fijado?: boolean;
}

const INTERVALO_MS = 60_000;

export function useResumenNotificaciones() {
  return useQuery({
    queryKey: ['notificaciones', 'resumen'],
    queryFn: () => api.get<ResumenNotificaciones>('/notificaciones/resumen'),
    refetchInterval: INTERVALO_MS,
    staleTime: 15_000,
  });
}

export function useNotificaciones(habilitado: boolean) {
  return useQuery({
    queryKey: ['notificaciones', 'lista'],
    queryFn: () => api.get<Notificacion[]>('/notificaciones', { limite: 30 }),
    enabled: habilitado,
    staleTime: 0,
  });
}

function useInvalidarNotificaciones() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['notificaciones'] });
}

export function useMarcarLeida() {
  const invalidar = useInvalidarNotificaciones();
  return useMutation({ mutationFn: (id: string) => api.post<void>(`/notificaciones/${id}/leer`), onSuccess: invalidar });
}

export function useMarcarTodasLeidas() {
  const invalidar = useInvalidarNotificaciones();
  return useMutation({ mutationFn: () => api.post<void>('/notificaciones/leer-todas'), onSuccess: invalidar });
}

/** Apaga el punto de un módulo (o de una pestaña) al entrar a él. */
export function useMarcarVisto() {
  const invalidar = useInvalidarNotificaciones();
  return useMutation({
    mutationFn: (v: { ruta: string; pestana?: string }) => api.post<void>('/notificaciones/visto', v),
    onSuccess: invalidar,
  });
}

/** Contador de una pestaña de un módulo (0 si no hay), para pasarlo a `Tabs`. */
export function contadorDePestana(resumen: ResumenNotificaciones | undefined, ruta: string, pestana: string): number {
  return resumen?.insignias.find((i) => i.ruta === ruta && i.pestana === pestana)?.contador ?? 0;
}

// --- Anuncios ---

export function useAnuncios() {
  return useQuery({ queryKey: ['anuncios', 'mios'], queryFn: () => api.get<Anuncio[]>('/notificaciones/anuncios'), staleTime: 30_000 });
}

export function useAnunciosGestion(habilitado: boolean) {
  return useQuery({ queryKey: ['anuncios', 'gestion'], queryFn: () => api.get<Anuncio[]>('/notificaciones/anuncios/gestion'), enabled: habilitado, staleTime: 15_000 });
}

function useInvalidarAnuncios() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['anuncios'] });
}

export function useCrearAnuncio() {
  const invalidar = useInvalidarAnuncios();
  return useMutation({ mutationFn: (input: AnuncioInput) => api.post<Anuncio>('/notificaciones/anuncios', input), onSuccess: invalidar });
}

export function useActualizarAnuncio() {
  const invalidar = useInvalidarAnuncios();
  return useMutation({
    mutationFn: ({ id, ...cambios }: Partial<AnuncioInput> & { id: string }) => api.patch<Anuncio>(`/notificaciones/anuncios/${id}`, cambios),
    onSuccess: invalidar,
  });
}

export function useArchivarAnuncio() {
  const invalidar = useInvalidarAnuncios();
  return useMutation({ mutationFn: (id: string) => api.post<void>(`/notificaciones/anuncios/${id}/archivar`), onSuccess: invalidar });
}
