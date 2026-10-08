import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  ClaseAsistencia,
  CuadriculaAsistencia,
  DimensionEstadistica,
  EstadisticasAsistencia,
  EstadoActivo,
  EstadoAsistencia,
  EstadoJustificacion,
  InasistenciaEstudiante,
  JustificacionAsistencia,
  PlanillaAsistencia,
  TonoEstadoAsistencia,
} from '../types/domain';

// --- Estados parametrizables ---

export function useEstadosAsistencia(incluirInactivos = false) {
  return useQuery({
    queryKey: ['attendance-states', { incluirInactivos }],
    queryFn: () => api.get<EstadoAsistencia[]>('/attendance/estados', { incluir_inactivos: String(incluirInactivos) }),
    staleTime: 5 * 60_000,
  });
}

export interface DatosEstadoAsistencia {
  nombre: string;
  abreviatura: string;
  tono: TonoEstadoAsistencia;
  cuenta_como_falla: boolean;
  es_retardo: boolean;
  es_justificada: boolean;
  es_predeterminado: boolean;
  orden: number;
}

export function useCrearEstadoAsistencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatosEstadoAsistencia) => api.post<EstadoAsistencia>('/attendance/estados', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance-states'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useActualizarEstadoAsistencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<DatosEstadoAsistencia> & { id: string }) =>
      api.patch<EstadoAsistencia>(`/attendance/estados/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance-states'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useCambiarEstadoActivoAsistencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<EstadoAsistencia>(`/attendance/estados/${id}/estado`, { estado }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance-states'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

// --- Planilla de aula ---

export interface PlanillaFiltro {
  group_id?: string;
  subject_id?: string;
  fecha?: string;
}

export function usePlanilla(filtro: PlanillaFiltro) {
  return useQuery({
    queryKey: ['attendance', 'planilla', filtro],
    queryFn: () => api.get<PlanillaAsistencia>('/attendance/planilla', { ...filtro }),
    enabled: Boolean(filtro.group_id && filtro.subject_id && filtro.fecha),
    staleTime: 0,
  });
}

export interface GuardarPlanillaInput {
  group_id: string;
  subject_id: string;
  fecha: string;
  registros: Array<{ student_id: string; state_id: string; novedad: string }>;
}

export function useGuardarPlanilla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GuardarPlanillaInput) => api.put<unknown>('/attendance/planilla', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

// --- Inasistencias, estadísticas y justificaciones ---

export function useInasistencias(studentId: string | undefined, academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', 'inasistencias', studentId, academicYearId],
    queryFn: () =>
      api.get<InasistenciaEstudiante[]>('/attendance/inasistencias', {
        student_id: studentId,
        academic_year_id: academicYearId,
      }),
    enabled: Boolean(studentId && academicYearId),
  });
}

export interface EstadisticasFiltro {
  academic_year_id?: string;
  agrupar_por: DimensionEstadistica;
  periodo_numero?: number;
  group_id?: string;
  subject_id?: string;
}

export function useEstadisticasAsistencia(filtro: EstadisticasFiltro) {
  return useQuery({
    queryKey: ['attendance', 'estadisticas', filtro],
    queryFn: () =>
      api.get<EstadisticasAsistencia>('/attendance/estadisticas', {
        academic_year_id: filtro.academic_year_id,
        agrupar_por: filtro.agrupar_por,
        periodo_numero: filtro.periodo_numero,
        group_id: filtro.group_id,
        subject_id: filtro.subject_id,
      }),
    enabled: Boolean(filtro.academic_year_id),
  });
}

export interface JustificacionesFiltro {
  academic_year_id?: string;
  estado?: EstadoJustificacion;
  group_id?: string;
}

export function useJustificaciones(filtro: JustificacionesFiltro) {
  return useQuery({
    queryKey: ['attendance', 'justificaciones', filtro],
    queryFn: () =>
      api.get<JustificacionAsistencia[]>('/attendance/justificaciones', {
        academic_year_id: filtro.academic_year_id,
        estado: filtro.estado,
        group_id: filtro.group_id,
      }),
    enabled: Boolean(filtro.academic_year_id),
  });
}

export interface CrearJustificacionInput {
  attendance_id: string;
  registro_id: string;
  motivo: string;
  acudiente_id?: string;
  archivo?: File | null;
}

export function useCrearJustificacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, ...campos }: CrearJustificacionInput) => {
      const formData = new FormData();
      Object.entries(campos).forEach(([clave, valor]) => {
        if (valor) formData.append(clave, valor);
      });
      if (archivo) formData.append('file', archivo);
      return api.upload<JustificacionAsistencia>('/attendance/justificaciones', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useRevisarJustificacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; estado: 'APROBADA' | 'RECHAZADA'; comentario?: string }) =>
      api.patch<JustificacionAsistencia>(`/attendance/justificaciones/${id}/revisar`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

/** El soporte es de acceso autenticado: se baja con el token y se abre como blob, nunca por URL directa. */
export async function abrirSoporteJustificacion(id: string): Promise<void> {
  const { url } = await api.downloadBlob(`/attendance/justificaciones/${id}/archivo`);
  window.open(url, '_blank');
}

// --- Trabajo sin conexión (Excel) ---

/** La planilla del día en .xlsx (abre también en Google Sheets). Baja con el token y se guarda con el nombre dado. */
export async function descargarPlantillaExcel(filtro: Required<PlanillaFiltro>, nombreArchivo: string): Promise<void> {
  const consulta = new URLSearchParams(filtro).toString();
  const { url } = await api.downloadBlob(`/attendance/planilla/excel?${consulta}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export interface ResultadoImportacionAsistencia {
  grupo: string;
  asignatura: string;
  fecha: string;
  registros: number;
  fallas: number;
}

export function useImportarPlantillaExcel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) => {
      const formData = new FormData();
      formData.append('file', archivo);
      return api.upload<ResultadoImportacionAsistencia>('/attendance/planilla/excel', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

// --- Planilla clásica (cuadrícula mensual) ---

export function useClasesAsistencia(academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['attendance', 'clases', academicYearId],
    queryFn: () => api.get<ClaseAsistencia[]>('/attendance/clases', { academic_year_id: academicYearId }),
    enabled: Boolean(academicYearId),
    staleTime: 5 * 60_000,
  });
}

export interface CuadriculaFiltro {
  group_id?: string;
  subject_id?: string;
  mes?: string;
}

export function useCuadricula(filtro: CuadriculaFiltro) {
  return useQuery({
    queryKey: ['attendance', 'cuadricula', filtro],
    queryFn: () => api.get<CuadriculaAsistencia>('/attendance/cuadricula', { ...filtro }),
    enabled: Boolean(filtro.group_id && filtro.subject_id && filtro.mes),
    staleTime: 0,
  });
}

export interface GuardarCuadriculaInput {
  group_id: string;
  subject_id: string;
  dias: Array<{ fecha: string; registros: Array<{ student_id: string; state_id: string; novedad: string }> }>;
}

export function useGuardarCuadricula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GuardarCuadriculaInput) =>
      api.put<{ dias_guardados: number }>('/attendance/cuadricula', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

// --- PDFs ---

/** Los PDF son de acceso autenticado: se bajan con el token y se guardan con el nombre dado. */
export async function descargarPdfAsistencia(ruta: string, consulta: Record<string, string | number | undefined>, nombreArchivo: string): Promise<void> {
  const parametros = new URLSearchParams();
  Object.entries(consulta).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== '') parametros.set(clave, String(valor));
  });
  const { url } = await api.downloadBlob(`/attendance/pdf/${ruta}?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
