import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { FormatoEvidencia, TipoActividad } from '../lib/actividades';

// --- Tipos (espejo de las respuestas de /activities) ---

export type EstadoActividadEstudiante = 'PROGRAMADA' | 'ENTREGADA' | 'ENTREGADA_TARDE' | 'CALIFICADA';

export interface ContextoAsignacion {
  _id: string;
  academic_year_id: string;
  docente: { _id: string; nombre: string; apellido: string } | null;
  grupo: { _id: string; nomenclatura: string } | null;
  grado: { _id: string; nombre: string; numero: number } | null;
  asignatura: { _id: string; nombre: string } | null;
  area: { _id: string; nombre: string } | null;
}

export interface Actividad {
  _id: string;
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  /** Clave del componente evaluativo del año (M12). */
  componente_siee: string;
  componente_nombre: string;
  peso_en_componente: number;
  fecha_apertura: string;
  fecha_entrega: string;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  desarrollo_curricular_id: string | null;
  dba_id: string | null;
  dba: { _id: string; numero_dba: number; enunciado: string } | null;
  competencia_evaluada: string | null;
  publicada: boolean;
  vencida: boolean;
  asignacion: ContextoAsignacion | null;
}

export interface ResumenEntregas {
  estudiantes: number;
  entregadas: number;
  con_retraso: number;
  calificadas: number;
}

export interface ActividadConResumen extends Actividad {
  resumen: ResumenEntregas;
}

export interface Entrega {
  _id: string;
  estado: EstadoActividadEstudiante;
  fecha_entrega: string | null;
  con_retraso: boolean;
  texto_entrega: string;
  tiene_archivo: boolean;
  archivo_nombre: string | null;
  archivo_formato: FormatoEvidencia | null;
  calificacion_numerica: number | null;
  retroalimentacion: string;
  fecha_calificacion: string | null;
}

export interface ActividadEstudiante extends Actividad {
  estado: EstadoActividadEstudiante;
  puede_entregar: boolean;
  motivo_bloqueo: string | null;
  entrega: Entrega | null;
}

export interface FilaEntrega {
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  estado: EstadoActividadEstudiante;
  entrega: Entrega | null;
}

export interface AlertaCalendario {
  codigo: string;
  severidad: 'BLOQUEO' | 'ADVERTENCIA';
  mensaje: string;
}

export interface RevisionCalendario {
  alertas: AlertaCalendario[];
  carga_del_dia: Array<{ titulo: string; tipo: TipoActividad; asignatura: string }>;
  limites: { max_evaluaciones_por_dia: number; max_entregas_por_dia: number };
}

export interface ConfiguracionActividades {
  max_evaluaciones_por_dia: number;
  max_entregas_por_dia: number;
}

// --- Docente (CU-DOC-02) ---

export interface FiltrosActividades {
  academic_year_id?: string;
  teacher_assignment_id?: string;
  group_id?: string;
  periodo?: number;
  tipo?: TipoActividad;
}

export function useActividades(filtros: FiltrosActividades, enabled = true) {
  return useQuery({
    queryKey: ['activities', 'lista', filtros],
    queryFn: () =>
      api.get<ActividadConResumen[]>('/activities', {
        academic_year_id: filtros.academic_year_id,
        teacher_assignment_id: filtros.teacher_assignment_id,
        group_id: filtros.group_id,
        periodo: filtros.periodo,
        tipo: filtros.tipo,
      }),
    enabled,
    staleTime: 60_000,
  });
}

export interface ConsultaRevisionCalendario {
  teacher_assignment_id: string;
  periodo_numero: number;
  fecha_entrega: string;
  tipo: TipoActividad;
  excluir_id?: string;
  exigir_futuro: boolean;
}

/** Alerta temprana de la fecha de entrega: recesos, vacaciones, fuera de periodo y carga del grupo ese día. */
export function useRevisionCalendario(consulta: ConsultaRevisionCalendario | null) {
  return useQuery({
    queryKey: ['activities', 'revision-calendario', consulta],
    queryFn: () =>
      api.get<RevisionCalendario>('/activities/revision-calendario', {
        teacher_assignment_id: consulta?.teacher_assignment_id,
        periodo_numero: consulta?.periodo_numero,
        fecha_entrega: consulta?.fecha_entrega,
        tipo: consulta?.tipo,
        excluir_id: consulta?.excluir_id,
        exigir_futuro: consulta ? String(consulta.exigir_futuro) : undefined,
      }),
    enabled: consulta !== null,
    staleTime: 30_000,
  });
}

export interface DatosActividad {
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: string;
  peso_en_componente: number;
  fecha_apertura: string;
  fecha_entrega: string;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  dba_id: string | null;
  competencia_evaluada: string | null;
  confirmar_alertas: boolean;
}

function useInvalidarActividades() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['activities'] });
  };
}

export function useCrearActividad() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: (input: DatosActividad & { teacher_assignment_id: string; periodo_numero: number }) =>
      api.post<Actividad>('/activities', input),
    onSuccess: invalidar,
  });
}

export function useActualizarActividad() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: ({ id, ...cambios }: Partial<DatosActividad> & { id: string }) => api.patch<Actividad>(`/activities/${id}`, cambios),
    onSuccess: invalidar,
  });
}

export function useEliminarActividad() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/activities/${id}`),
    onSuccess: invalidar,
  });
}

export function useEntregasDeActividad(actividadId: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'entregas', actividadId],
    queryFn: () => api.get<FilaEntrega[]>(`/activities/${actividadId}/entregas`),
    enabled: Boolean(actividadId),
    staleTime: 15_000,
  });
}

export interface CalificarEntregaInput {
  actividadId: string;
  student_id: string;
  calificacion_numerica: number;
  retroalimentacion: string;
}

/** Puente hacia M12: la nota se registra con el endpoint de calificación y la entrega pasa a CALIFICADA. */
export function useCalificarEntrega() {
  const invalidar = useInvalidarActividades();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actividadId, ...nota }: CalificarEntregaInput) => api.patch<unknown[]>(`/activities/${actividadId}/grade`, nota),
    onSuccess: () => {
      invalidar();
      void queryClient.invalidateQueries({ queryKey: ['report-card'] });
      void queryClient.invalidateQueries({ queryKey: ['notas'] });
    },
  });
}

/** Baja la evidencia con la sesión (nunca por URL directa) y la abre en una pestaña nueva. */
export async function descargarEntrega(entregaId: string, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(`/activities/entregas/${entregaId}/archivo`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// --- Estudiante (CU-EST-03) ---

export function useMisActividades() {
  return useQuery({
    queryKey: ['activities', 'mias'],
    queryFn: () => api.get<ActividadEstudiante[]>('/activities/mias'),
    staleTime: 30_000,
  });
}

export interface EnviarEntregaInput {
  actividadId: string;
  archivo: File | null;
  texto_entrega: string;
}

export function useEnviarEntrega() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: ({ actividadId, archivo, texto_entrega }: EnviarEntregaInput) => {
      const formData = new FormData();
      if (archivo) formData.append('file', archivo);
      formData.append('texto_entrega', texto_entrega);
      return api.upload<Entrega>(`/activities/${actividadId}/submissions`, formData);
    },
    onSuccess: invalidar,
  });
}

// --- Política de carga (coordinación) ---

export function useConfiguracionActividades(enabled = true) {
  return useQuery({
    queryKey: ['activities', 'configuracion'],
    queryFn: () => api.get<ConfiguracionActividades>('/activities/configuracion'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useActualizarConfiguracionActividades() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: (cambios: Partial<ConfiguracionActividades>) => api.put<ConfiguracionActividades>('/activities/configuracion', cambios),
    onSuccess: invalidar,
  });
}
