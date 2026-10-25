import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

/** Citaciones a acudientes (M24): quien convoca (docente, coordinación), el acudiente desde el portal y el enlace público del correo. */

export type TipoCitacion = 'GENERAL' | 'PARTICULAR';
export type MotivoCitacion = 'ENTREGA_BOLETINES' | 'ACADEMICO' | 'COMPORTAMENTAL' | 'ORIENTACION_CONVIVENCIA' | 'OTRO';
export type EstadoCitacion = 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA';
export type RespuestaAsistencia = 'PENDIENTE' | 'CONFIRMADA' | 'NO_ASISTIRA';
export type SituacionCorreo = 'SIN_CORREO' | 'NO_ENVIADO' | 'EN_COLA' | 'ENVIADO' | 'FALLIDO' | 'OMITIDO';

export const TIPOS_CITACION: TipoCitacion[] = ['GENERAL', 'PARTICULAR'];
export const NOMBRES_TIPO_CITACION: Record<TipoCitacion, string> = { GENERAL: 'General (grupos)', PARTICULAR: 'Particular (un estudiante)' };

export const MOTIVOS_CITACION: MotivoCitacion[] = ['ENTREGA_BOLETINES', 'ACADEMICO', 'COMPORTAMENTAL', 'ORIENTACION_CONVIVENCIA', 'OTRO'];
export const NOMBRES_MOTIVO_CITACION: Record<MotivoCitacion, string> = {
  ENTREGA_BOLETINES: 'Entrega de boletines',
  ACADEMICO: 'Seguimiento académico',
  COMPORTAMENTAL: 'Seguimiento comportamental',
  ORIENTACION_CONVIVENCIA: 'Orientación y convivencia',
  OTRO: 'Otro',
};

export const NOMBRES_ESTADO_CITACION: Record<EstadoCitacion, string> = { PROGRAMADA: 'Programada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' };
export const NOMBRES_RESPUESTA: Record<RespuestaAsistencia, string> = { PENDIENTE: 'Sin responder', CONFIRMADA: 'Asistirá', NO_ASISTIRA: 'No asistirá' };
export const NOMBRES_SITUACION_CORREO: Record<SituacionCorreo, string> = {
  SIN_CORREO: 'Sin correo registrado',
  NO_ENVIADO: 'No enviado',
  EN_COLA: 'En cola',
  ENVIADO: 'Enviado',
  FALLIDO: 'Falló el envío',
  OMITIDO: 'Omitido',
};

/** Espejo de backend/constants/citaciones.ts. */
export const MAX_TITULO_CITACION = 120;
export const MAX_DESCRIPCION_CITACION = 1500;
export const MAX_LUGAR_CITACION = 160;
export const MAX_MOTIVO_CANCELACION = 300;

export interface FilaCitacion {
  _id: string;
  tipo: TipoCitacion;
  motivo: MotivoCitacion;
  titulo: string;
  fecha_hora: string;
  lugar: string;
  estado: EstadoCitacion;
  convocante: string;
  destinatarios: number;
  confirmados: number;
  no_asistiran: number;
  pendientes: number;
}

export interface DestinatarioCitacion {
  _id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  acudiente: string;
  email: string;
  tiene_portal: boolean;
  respuesta: RespuestaAsistencia;
  respondida_en: string | null;
  canal_respuesta: 'CORREO' | 'PORTAL' | null;
  correo: SituacionCorreo;
  error_correo: string;
}

export interface DetalleCitacion {
  _id: string;
  tipo: TipoCitacion;
  motivo: MotivoCitacion;
  nombre_motivo: string;
  titulo: string;
  descripcion: string;
  fecha_hora: string;
  lugar: string;
  estado: EstadoCitacion;
  version: number;
  convocante: string;
  convocante_rol: string;
  grupos: string[];
  todos_los_acudientes: boolean;
  cancelacion: { motivo: string; fecha: string } | null;
  destinatarios: DestinatarioCitacion[];
  correo_disponible: boolean;
  motivo_correo_no_disponible: string | null;
  puede: { editar: boolean; cancelar: boolean; marcar_realizada: boolean; reenviar: boolean };
  /** Solo al crear: por qué no se enviarán correos (null = se enviarán). */
  advertencia_correo?: string | null;
}

export interface GrupoConvocable {
  _id: string;
  nomenclatura: string;
  grado: string;
  sede_id: string;
  es_director: boolean;
}

export interface EstudianteConvocable {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface CitacionInput {
  tipo: TipoCitacion;
  motivo: MotivoCitacion;
  titulo: string;
  descripcion?: string;
  fecha_hora: string;
  lugar: string;
  grupo_ids?: string[];
  student_id?: string;
  todos_los_acudientes?: boolean;
  /** Solo convivencia: enlaza la citación a un caso del que el estudiante es parte. */
  caso_id?: string;
}

export type CambiosCitacion = Partial<Pick<CitacionInput, 'motivo' | 'titulo' | 'descripcion' | 'fecha_hora' | 'lugar'>>;

export interface FiltrosCitaciones {
  estado?: EstadoCitacion;
  search?: string;
}

export function useCitaciones(anioId: string | undefined, filtros: FiltrosCitaciones) {
  return useQuery({
    queryKey: ['citaciones', anioId, filtros],
    queryFn: () => api.get<FilaCitacion[]>('/citaciones', { academic_year_id: anioId, ...filtros }),
    enabled: Boolean(anioId),
  });
}

export function useDetalleCitacion(id: string | null) {
  return useQuery({
    queryKey: ['citaciones', 'detalle', id],
    queryFn: () => api.get<DetalleCitacion>(`/citaciones/${id}`),
    enabled: Boolean(id),
    // Los correos pasan de «en cola» a «enviado» solos: mientras haya alguno en cola se vuelve a preguntar.
    refetchInterval: (query) => (query.state.data?.destinatarios.some((d) => d.correo === 'EN_COLA') ? 5_000 : false),
  });
}

export function useGruposConvocables(enabled: boolean) {
  return useQuery({ queryKey: ['citaciones', 'grupos'], queryFn: () => api.get<GrupoConvocable[]>('/citaciones/grupos'), enabled, staleTime: 60_000 });
}

export function useEstudiantesConvocables(groupId: string | undefined) {
  return useQuery({
    queryKey: ['citaciones', 'estudiantes', groupId],
    queryFn: () => api.get<EstudianteConvocable[]>('/citaciones/estudiantes', { group_id: groupId }),
    enabled: Boolean(groupId),
    staleTime: 60_000,
  });
}

function useInvalidarCitaciones() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['citaciones'] });
    void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    // El caso de convivencia lista las citaciones que se le enlazaron.
    void queryClient.invalidateQueries({ queryKey: ['casos'] });
  };
}

export function useCrearCitacion() {
  const invalidar = useInvalidarCitaciones();
  return useMutation({ mutationFn: (input: CitacionInput) => api.post<DetalleCitacion>('/citaciones', input), onSuccess: invalidar });
}

export function useActualizarCitacion() {
  const invalidar = useInvalidarCitaciones();
  return useMutation({ mutationFn: ({ id, cambios }: { id: string; cambios: CambiosCitacion }) => api.patch<DetalleCitacion>(`/citaciones/${id}`, cambios), onSuccess: invalidar });
}

export function useCancelarCitacion() {
  const invalidar = useInvalidarCitaciones();
  return useMutation({ mutationFn: ({ id, motivo }: { id: string; motivo: string }) => api.post<DetalleCitacion>(`/citaciones/${id}/cancelar`, { motivo }), onSuccess: invalidar });
}

export function useMarcarRealizada() {
  const invalidar = useInvalidarCitaciones();
  return useMutation({ mutationFn: (id: string) => api.post<DetalleCitacion>(`/citaciones/${id}/realizada`, {}), onSuccess: invalidar });
}

export function useReenviarCorreoCitacion() {
  const invalidar = useInvalidarCitaciones();
  return useMutation({
    mutationFn: ({ id, destinatarioId }: { id: string; destinatarioId: string }) => api.post<DetalleCitacion>(`/citaciones/${id}/destinatarios/${destinatarioId}/reenviar`, {}),
    onSuccess: invalidar,
  });
}

// --- Portal del acudiente (M27) ---

export interface CitacionDeHijo {
  destinatario_id: string;
  titulo: string;
  motivo: string;
  descripcion: string;
  fecha_hora: string;
  lugar: string;
  convocante: string;
  convocante_cargo: string;
  estado: EstadoCitacion;
  motivo_cancelacion: string | null;
  respuesta: RespuestaAsistencia;
  puede_responder: boolean;
  motivo_no_responder: string | null;
}

export function useCitacionesDelHijo(studentId: string | undefined) {
  return useQuery({
    queryKey: ['portal', studentId, 'citaciones'],
    queryFn: () => api.get<CitacionDeHijo[]>(`/portal/hijos/${studentId}/citaciones`),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
}

export function useResponderCitacionDelHijo(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ destinatarioId, respuesta }: { destinatarioId: string; respuesta: 'CONFIRMADA' | 'NO_ASISTIRA' }) =>
      api.post<CitacionDeHijo[]>(`/portal/hijos/${studentId}/citaciones/${destinatarioId}/respuesta`, { respuesta }),
    onSuccess: (lista) => queryClient.setQueryData(['portal', studentId, 'citaciones'], lista),
  });
}

// --- Enlace del correo (sin sesión) ---

export interface CitacionPublica {
  institucion: string;
  titulo: string;
  motivo: string;
  descripcion: string;
  fecha_hora: string;
  lugar: string;
  convocante: string;
  convocante_cargo: string;
  estudiante: string;
  estado: EstadoCitacion;
  respuesta: RespuestaAsistencia;
  puede_responder: boolean;
  motivo_no_responder: string | null;
}

export function useCitacionPublica(token: string | undefined) {
  return useQuery({
    queryKey: ['public', 'citaciones', token],
    queryFn: () => api.get<CitacionPublica>(`/public/citaciones/${token}`),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useResponderCitacionPublica(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (respuesta: 'CONFIRMADA' | 'NO_ASISTIRA') => api.post<CitacionPublica>(`/public/citaciones/${token}/respuesta`, { respuesta }),
    onSuccess: (vista) => queryClient.setQueryData(['public', 'citaciones', token], vista),
  });
}
