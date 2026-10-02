import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoActivo } from '../types/domain';
import type { AlertaCaso, EstadoCaso } from './useCasos';
import type { TipoSituacion } from './useObservaciones';

export const TIPOS_SESION = ['ORDINARIA', 'EXTRAORDINARIA'] as const;
export type TipoSesion = (typeof TIPOS_SESION)[number];
export const NOMBRES_TIPO_SESION: Record<TipoSesion, string> = { ORDINARIA: 'Ordinaria', EXTRAORDINARIA: 'Extraordinaria' };

export type EstadoSesion = 'BORRADOR' | 'FIRMADA' | 'ANULADA';

export interface MiembroComite {
  _id: string;
  cargo: string;
  nombre: string;
  usuario_id: string | null;
  documento: string;
  es_presidente: boolean;
  estado: EstadoActivo;
}

export interface Quorum {
  total_miembros: number;
  presentes: number;
  porcentaje_requerido: number;
  alcanzado: boolean;
}

export interface SesionResumen {
  _id: string;
  tipo: TipoSesion;
  fecha: string;
  estado: EstadoSesion;
  codigo: string | null;
  quorum: Quorum;
}

export interface SesionDetalle extends SesionResumen {
  hora: string;
  lugar: string;
  orden_del_dia: string;
  desarrollo: string;
  asistentes: { miembro_id: string; nombre: string; cargo: string; es_presidente: boolean; asistio: boolean }[];
  casos_tratados: { caso_id: string; codigo: string; decisiones: string; recusados_ids: string[] }[];
  firma: { por: string; fecha: string; hash: string } | null;
  anexos: { _id: string; fecha: string; texto: string }[];
  anulacion: { motivo: string; fecha: string } | null;
}

export interface CasoConAlertas {
  _id: string;
  codigo: string;
  estado: EstadoCaso;
  tipo_situacion: TipoSituacion;
  alertas: AlertaCaso[];
}

function useInvalidarComite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['comite'] });
  };
}

export function useMiembrosComite(incluirInactivos = true) {
  return useQuery({
    queryKey: ['comite', 'miembros', { incluirInactivos }],
    queryFn: () =>
      api.get<{ anio: { _id: string; year: number }; miembros: MiembroComite[] }>(
        '/convivencia/comite/miembros',
        incluirInactivos ? { incluir_inactivos: 'true' } : {}
      ),
  });
}

export interface MiembroInput {
  cargo: string;
  nombre?: string;
  usuario_id?: string | null;
  documento?: string;
  es_presidente?: boolean;
}

export function useGuardarMiembro() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: ({ id, ...input }: MiembroInput & { id?: string }) =>
      id ? api.patch<MiembroComite>(`/convivencia/comite/miembros/${id}`, input) : api.post<MiembroComite>('/convivencia/comite/miembros', input),
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoMiembro() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) => api.patch<MiembroComite>(`/convivencia/comite/miembros/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarMiembro() {
  const invalidar = useInvalidarComite();
  return useMutation({ mutationFn: (id: string) => api.delete<null>(`/convivencia/comite/miembros/${id}`), onSuccess: invalidar });
}

export function useSesionesComite() {
  return useQuery({
    queryKey: ['comite', 'sesiones'],
    queryFn: () => api.get<{ anio: { _id: string; year: number }; sesiones: SesionResumen[] }>('/convivencia/comite/sesiones'),
  });
}

export function useSesionComite(id: string | null) {
  return useQuery({
    queryKey: ['comite', 'sesion', id],
    queryFn: () => api.get<SesionDetalle>(`/convivencia/comite/sesiones/${id}`),
    enabled: Boolean(id),
  });
}

export function useCrearSesion() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: (input: { tipo: TipoSesion; fecha: string; hora?: string; lugar?: string; orden_del_dia?: string }) =>
      api.post<SesionDetalle>('/convivencia/comite/sesiones', input),
    onSuccess: invalidar,
  });
}

export interface ActualizarSesionInput {
  desarrollo?: string;
  orden_del_dia?: string;
  lugar?: string;
  hora?: string;
  asistencia?: { miembro_id: string; asistio: boolean }[];
  casos_tratados?: { caso_id: string; decisiones?: string; recusados_ids?: string[] }[];
}

export function useActualizarSesion() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: ({ id, ...input }: ActualizarSesionInput & { id: string }) => api.patch<SesionDetalle>(`/convivencia/comite/sesiones/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useFirmarSesion() {
  const invalidar = useInvalidarComite();
  return useMutation({ mutationFn: (id: string) => api.post<SesionDetalle>(`/convivencia/comite/sesiones/${id}/firma`, {}), onSuccess: invalidar });
}

export function useAnularSesion() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<SesionDetalle>(`/convivencia/comite/sesiones/${id}/anulacion`, { motivo }),
    onSuccess: invalidar,
  });
}

export function useAgregarAnexo() {
  const invalidar = useInvalidarComite();
  return useMutation({
    mutationFn: ({ id, texto }: { id: string; texto: string }) => api.post<SesionDetalle>(`/convivencia/comite/sesiones/${id}/anexos`, { texto }),
    onSuccess: invalidar,
  });
}

export function useVerificarIntegridad() {
  return useMutation({
    mutationFn: (id: string) =>
      api.get<{ codigo: string; hash_firmado: string; hash_actual: string; integra: boolean }>(`/convivencia/comite/sesiones/${id}/integridad`),
  });
}

/** Los casos con alerta de la bandeja de convivencia (el envío de avisos es de M28). */
export function useCasosConAlertas() {
  return useQuery({
    queryKey: ['casos', 'alertas'],
    queryFn: () => api.get<CasoConAlertas[]>('/convivencia/alertas'),
    staleTime: 60_000,
  });
}

/** El acta se baja con sesión (nunca por una URL pública) y queda registrada en la auditoría. */
export async function descargarActaPdf(id: string, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(`/convivencia/comite/sesiones/${id}/pdf`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export interface InformeRetencion {
  retencion_anios_observaciones: number | null;
  retencion_anios_casos: number | null;
  observaciones: { limite: string; total: number; por_anio: { anio: number; total: number }[] } | null;
  casos: { limite: string; total: number; casos: { codigo: string; anio: number; estado: string }[] } | null;
  nota: string;
}

/** Solo ADMIN. Cada consulta queda auditada; el informe solo informa, no borra nada. */
export function useInformeRetencion(habilitado: boolean) {
  return useQuery({
    queryKey: ['comite', 'retencion'],
    queryFn: () => api.get<InformeRetencion>('/convivencia/retencion'),
    enabled: habilitado,
    staleTime: 60_000,
    retry: false,
  });
}
