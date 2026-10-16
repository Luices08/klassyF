import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { FormatoEvidencia, TipoActividad, TipoAdjunto } from '../lib/actividades';

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

export interface AdjuntoActividad {
  id: string;
  ext: string;
  nombre: string;
  tipo: TipoAdjunto;
  bytes: number;
}

export interface VideoActividad {
  proveedor: 'YOUTUBE' | 'VIMEO';
  video_id: string;
  url_incrustada: string;
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
  /** % que pesa dentro de su bloque; null = automático (se reparte con las demás casillas sin peso). */
  peso_en_componente: number | null;
  fecha_apertura: string;
  fecha_entrega: string;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  /** false = una sola entrega por estudiante; true = puede volver a entregar y el docente elige cuál califica. */
  permite_multiples_entregas: boolean;
  /** El docente la cerró a mano: ya no recibe entregas (salvo el plazo personal de un acceso especial). */
  cerrada: boolean;
  /** El texto del editor (ya limpiado por el servidor). Solo viaja en el detalle, no en los listados. */
  contenido_html?: string;
  adjuntos: AdjuntoActividad[];
  videos: VideoActividad[];
  publicacion_id: string | null;
  /** Qué cambió el docente después de publicarla (solo los nombres de los campos). */
  modificaciones: Array<{ fecha: string; campos: string[] }>;
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

export interface IntentoEntrega {
  numero: number;
  fecha_entrega: string;
  con_retraso: boolean;
  acceso_especial: boolean;
  texto_entrega: string;
  tiene_archivo: boolean;
  archivo_nombre: string | null;
  archivo_formato: FormatoEvidencia | null;
  /** Es el intento que cuenta para la nota (el elegido por el docente o, si no eligió, el último). */
  considerado: boolean;
}

export type OrigenNota = 'ACTIVIDAD' | 'PLANILLA' | 'EXCEL';

/** Los campos de arriba reflejan el intento que cuenta; `intentos` trae todos. */
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
  intentos: IntentoEntrega[];
  intento_valido: number | null;
  /** Entregó más de una vez y el docente aún no eligió cuál es la válida: no se puede calificar. */
  requiere_elegir_intento: boolean;
  /** La nota también se puede poner desde la planilla de notas o su Excel: de dónde vino la última. */
  ultimo_cambio_nota: { origen: OrigenNota; fecha: string } | null;
}

export interface ActividadEstudiante extends Actividad {
  estado: EstadoActividadEstudiante;
  puede_entregar: boolean;
  motivo_bloqueo: string | null;
  /** El plazo personal que el docente le dio a este estudiante. */
  acceso_especial: { fecha_limite: string } | null;
  entrega: Entrega | null;
}

export interface AccesoEspecial {
  fecha_limite: string;
  motivo: string;
  fecha: string;
}

export interface FilaEntrega {
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  estado: EstadoActividadEstudiante;
  entrega: Entrega | null;
  acceso_especial: AccesoEspecial | null;
}

export interface ActividadDetalleGestion extends ActividadConResumen {
  /** Las copias de esta misma actividad en otros grupos. */
  publicada_tambien_en: Array<{ _id: string; grupo: string }>;
}

export interface Comentario {
  _id: string;
  autor: { nombre: string; apellido: string } | null;
  autor_rol: string;
  texto: string;
  fecha: string;
  es_mio: boolean;
  puede_eliminar: boolean;
}

export interface AnalisisActividad {
  total_estudiantes: number;
  entregaron: number;
  sin_entregar: number;
  con_retraso: number;
  con_varios_intentos: number;
  calificados: number;
  por_calificar: number;
  porcentaje_entrega: number;
  porcentaje_calificado: number;
  notas: { promedio: number; mediana: number; minima: number; maxima: number; aprueban: number; pierden: number; porcentaje_aprueban: number } | null;
  distribucion: Array<{ nivel: string; etiqueta: string; cantidad: number; aprobatorio: boolean }>;
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

export interface ReferenciaAdjunto {
  id: string;
  ext: string;
  nombre: string;
}

export interface DatosActividad {
  titulo: string;
  /** Texto sin formato; si hay `contenido_html`, el servidor lo deriva de ahí. */
  descripcion?: string;
  contenido_html?: string;
  adjuntos?: ReferenciaAdjunto[];
  /** Enlaces de YouTube o Vimeo. */
  videos?: string[];
  permite_multiples_entregas?: boolean;
  cerrada?: boolean;
  tipo: TipoActividad;
  componente_siee: string;
  peso_en_componente: number | null;
  fecha_apertura: string;
  fecha_entrega: string;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  confirmar_alertas: boolean;
}

function useInvalidarActividades() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['activities'] });
  };
}

export interface ResultadoCreacion {
  actividad: Actividad;
  /** Las copias en los otros grupos donde sí se publicó. */
  copias: Actividad[];
  /** Grupos donde no se pudo publicar y por qué. */
  omitidas: Array<{ teacher_assignment_id: string; grupo: string; motivo: string }>;
}

export function useCrearActividad() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: async (
      input: DatosActividad & { teacher_assignment_id: string; periodo_numero: number; grupos_adicionales?: string[] }
    ): Promise<ResultadoCreacion> => {
      const respuesta = await api.raw<{ success: true; data: Actividad; copias: Actividad[]; omitidas: ResultadoCreacion['omitidas'] }>('/activities', {
        method: 'POST',
        body: input,
      });
      return { actividad: respuesta.data, copias: respuesta.copias ?? [], omitidas: respuesta.omitidas ?? [] };
    },
    onSuccess: invalidar,
  });
}

/** Sube varios archivos de apoyo de una vez; devuelve las referencias que se mandan al guardar la actividad. */
export function useSubirAdjuntos() {
  return useMutation({
    mutationFn: (archivos: File[]) => {
      const formData = new FormData();
      for (const archivo of archivos) formData.append('files', archivo);
      return api.upload<Array<ReferenciaAdjunto & { tipo: TipoAdjunto; bytes: number }>>('/activities/adjuntos', formData);
    },
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

/** El detalle completo de una actividad para quien la gestiona (docente titular, coordinación, administración). */
export function useActividad(id: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'detalle', id],
    queryFn: () => api.get<ActividadDetalleGestion>(`/activities/${id}`),
    enabled: Boolean(id),
    staleTime: 15_000,
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

/** El docente escoge cuál de las entregas del estudiante es la válida para calificar. */
export function useElegirIntentoValido() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: ({ actividadId, studentId, intento }: { actividadId: string; studentId: string; intento: number }) =>
      api.patch<Entrega>(`/activities/${actividadId}/entregas/${studentId}/valida`, { intento }),
    onSuccess: invalidar,
  });
}

export function useAnalisisActividad(id: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'analisis', id],
    queryFn: () => api.get<AnalisisActividad>(`/activities/${id}/analisis`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useOtorgarAccesoEspecial() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: ({ actividadId, ...datos }: { actividadId: string; student_id: string; fecha_limite: string; motivo: string }) =>
      api.post<unknown>(`/activities/${actividadId}/accesos-especiales`, datos),
    onSuccess: invalidar,
  });
}

export function useRevocarAccesoEspecial() {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: ({ actividadId, studentId }: { actividadId: string; studentId: string }) =>
      api.delete<null>(`/activities/${actividadId}/accesos-especiales/${studentId}`),
    onSuccess: invalidar,
  });
}

// --- Comentarios públicos ---

export function useComentarios(actividadId: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'comentarios', actividadId],
    queryFn: () => api.get<Comentario[]>(`/activities/${actividadId}/comentarios`),
    enabled: Boolean(actividadId),
    staleTime: 15_000,
  });
}

export function useCrearComentario(actividadId: string) {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: (texto: string) => api.post<Comentario>(`/activities/${actividadId}/comentarios`, { texto }),
    onSuccess: invalidar,
  });
}

export function useEliminarComentario(actividadId: string) {
  const invalidar = useInvalidarActividades();
  return useMutation({
    mutationFn: (comentarioId: string) => api.delete<null>(`/activities/${actividadId}/comentarios/${comentarioId}`),
    onSuccess: invalidar,
  });
}

/** Baja un archivo con la sesión (nunca por URL directa) y lo entrega al navegador con su nombre. */
async function bajarConSesion(ruta: string, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(ruta);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** La evidencia del estudiante; sin `intento` es la que cuenta, con él cualquiera de sus entregas. */
export function descargarEntrega(entregaId: string, nombreArchivo: string, intento?: number): Promise<void> {
  return bajarConSesion(`/activities/entregas/${entregaId}/archivo${intento ? `?intento=${intento}` : ''}`, nombreArchivo);
}

/** Un archivo de apoyo que el docente adjuntó a la actividad. */
export function descargarAdjunto(actividadId: string, adjunto: AdjuntoActividad): Promise<void> {
  return bajarConSesion(`/activities/${actividadId}/adjuntos/${adjunto.id}`, adjunto.nombre);
}

// --- Estudiante (CU-EST-03) ---

/** Una actividad publicada, con todo lo que el estudiante necesita para entregarla. */
export function useMiActividad(id: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'mia', id],
    queryFn: () => api.get<ActividadEstudiante>(`/activities/${id}`),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

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
