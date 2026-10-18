import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /promocion-anticipada) ---

export type TipoAnticipada = 'RENDIMIENTO_EXCEPCIONAL' | 'REINICIANTE';
export type EstadoAnticipada = 'SOLICITADA' | 'LISTA_PARA_RESOLUCION' | 'RESUELTA' | 'APLICADA' | 'RECHAZADA' | 'ANULADA';
export type TratamientoNotas = 'NIVELACION' | 'COPIAR_EQUIVALENTES' | 'DEJAR_SIN_NOTA';
export type MedioConsentimiento = 'FORMATO_FIRMADO' | 'ACTA_DE_REUNION' | 'CORREO' | 'OTRO';

export const NOMBRES_TIPO_ANTICIPADA: Record<TipoAnticipada, string> = { RENDIMIENTO_EXCEPCIONAL: 'Rendimiento excepcional', REINICIANTE: 'Reiniciante' };
export const NOMBRES_ESTADO_ANTICIPADA: Record<EstadoAnticipada, string> = {
  SOLICITADA: 'Solicitada',
  LISTA_PARA_RESOLUCION: 'Lista para resolución',
  RESUELTA: 'Resuelta',
  APLICADA: 'Aplicada',
  RECHAZADA: 'Rechazada',
  ANULADA: 'Anulada',
};
export const NOMBRES_TRATAMIENTO: Record<TratamientoNotas, string> = {
  NIVELACION: 'Nivelación en cada asignatura del grado nuevo',
  COPIAR_EQUIVALENTES: 'Copiar la nota de la asignatura equivalente (nivelar solo la que no la tiene)',
  DEJAR_SIN_NOTA: 'Dejar el periodo sin nota y repartir su porcentaje entre los demás',
};
export const NOMBRES_MEDIO: Record<MedioConsentimiento, string> = { FORMATO_FIRMADO: 'Formato firmado', ACTA_DE_REUNION: 'Acta de reunión', CORREO: 'Correo', OTRO: 'Otro' };

export interface CriterioNotas {
  activo: boolean;
  promedio_minimo: number;
  nota_minima_asignatura: number | null;
  nota_minima_asignaturas_reprobadas?: number | null;
}

export interface ConfiguracionAnticipada {
  activa: boolean;
  periodo_evaluacion: number;
  dias_ventana_tras_cierre: number;
  grados_excluidos_ids?: string[];
  rendimiento_excepcional: CriterioNotas;
  reiniciantes: CriterioNotas;
  exige: { concepto_comision: boolean; consentimiento_familia: boolean; decision_consejo_directivo: boolean };
  tratamiento_notas: TratamientoNotas;
}

export interface NotaAplicada {
  subject_id: string;
  nombre: string;
  modo: 'COPIADA' | 'NIVELACION' | 'SIN_NOTA';
  nota: number | null;
  motivo: string;
  nivelacion: { nota: number; fecha: string } | null;
}

export interface TramiteAnticipada {
  _id: string;
  anio: number;
  student_id: string | { _id: string; nombre: string; apellido: string; numero_documento: string };
  enrollment_id: string;
  tipo: TipoAnticipada;
  estado: EstadoAnticipada;
  motivo_solicitud: string;
  reglas: { exige: ConfiguracionAnticipada['exige']; tratamiento_notas: TratamientoNotas; periodo_evaluacion: number };
  evaluacion: { periodo: number; promedio: number | null; cumple: boolean; motivos: string[]; notas: Array<{ subject_id: string; nombre: string; nota: number | null }> };
  concepto_comision: { acta: string; favorable: boolean; fecha: string } | null;
  consentimiento: { otorgado: boolean; medio: MedioConsentimiento; otorgado_por: { nombre: string; documento: string }; fecha: string; observaciones: string } | null;
  decision_consejo: { acta: string; aprobada: boolean; fecha: string } | null;
  resolucion: { codigo: string; fecha: string; fundamento: string; hash: string } | null;
  aplicacion: { fecha: string; notas: NotaAplicada[] } | null;
  cierre: { estado: 'RECHAZADA' | 'ANULADA'; motivo: string; fecha: string } | null;
  createdAt: string;
}

export interface DetalleTramite extends TramiteAnticipada {
  requisitos_pendientes: string[];
  nivelaciones_pendientes: Array<{ subject_id: string; nombre: string; motivo: string }>;
}

export interface FiltrosTramites {
  academic_year_id?: string;
  estado?: EstadoAnticipada;
  tipo?: TipoAnticipada;
}

// --- Hooks ---

export function useConfiguracionAnticipada() {
  return useQuery({ queryKey: ['promocion-anticipada', 'configuracion'], queryFn: () => api.get<ConfiguracionAnticipada>('/promocion-anticipada/configuracion') });
}

export function useActualizarConfiguracionAnticipada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (c: ConfiguracionAnticipada) => api.put<ConfiguracionAnticipada>('/promocion-anticipada/configuracion', c),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promocion-anticipada'] }),
  });
}

export function useTramitesAnticipada(filtros: FiltrosTramites, enabled = true) {
  return useQuery({
    queryKey: ['promocion-anticipada', 'lista', filtros],
    queryFn: () => api.get<TramiteAnticipada[]>('/promocion-anticipada', { ...filtros }),
    enabled: enabled && Boolean(filtros.academic_year_id),
  });
}

export function useTramiteAnticipada(id: string | undefined) {
  return useQuery({
    queryKey: ['promocion-anticipada', 'detalle', id],
    queryFn: () => api.get<DetalleTramite>(`/promocion-anticipada/${id}`),
    enabled: Boolean(id),
  });
}

function useMutacionTramite<T, R = unknown>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promocion-anticipada'] });
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });
}

export const useSolicitarAnticipada = () =>
  useMutacionTramite((input: { enrollment_id: string; tipo: TipoAnticipada; motivo?: string }) => api.post<TramiteAnticipada>('/promocion-anticipada', input));

export const useRegistrarConsentimiento = () =>
  useMutacionTramite((input: { id: string; otorgado: boolean; medio: MedioConsentimiento; guardian_id?: string | null; por_el_estudiante?: boolean; observaciones?: string }) => {
    const { id, ...cuerpo } = input;
    return api.post(`/promocion-anticipada/${id}/consentimiento`, cuerpo);
  });

export const useEmitirResolucion = () =>
  useMutacionTramite((input: { id: string; fundamento: string; confirm_password: string }) => {
    const { id, ...cuerpo } = input;
    return api.post(`/promocion-anticipada/${id}/resolucion`, cuerpo);
  });

export const useAplicarAnticipada = () =>
  useMutacionTramite((input: { id: string; grupo_destino_id: string }) => api.post<{ nivelaciones_pendientes: number }>(`/promocion-anticipada/${input.id}/aplicar`, { grupo_destino_id: input.grupo_destino_id }));

export const useRegistrarNivelacion = () =>
  useMutacionTramite((input: { id: string; subject_id: string; nota: number }) => api.post(`/promocion-anticipada/${input.id}/nivelaciones/${input.subject_id}`, { nota: input.nota }));

export const useAnularAnticipada = () => useMutacionTramite((input: { id: string; motivo: string }) => api.post(`/promocion-anticipada/${input.id}/anular`, { motivo: input.motivo }));

export const descargarResolucion = (id: string) => api.downloadBlob(`/promocion-anticipada/${id}/resolucion/pdf`);
