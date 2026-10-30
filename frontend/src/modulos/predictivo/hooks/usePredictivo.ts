import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/apiClient';
import type { NivelDesempeno } from '../../../types/domain';

/** Módulo predictivo: versiones del modelo (ADMIN), buscador y análisis del personal, el del estudiante y el de cada hijo. */

export type EstadoModelo = 'PENDIENTE' | 'EN_CURSO' | 'LISTO' | 'RECHAZADO' | 'FALLIDO';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';
export type EstadoNotaRequerida = 'APROBADA' | 'PERDIDA' | 'ASEGURADA' | 'ALCANZABLE' | 'NO_ALCANZA' | 'SIN_DATOS';

export interface Metricas {
  filas: number;
  positivos: number;
  prevalencia: number;
  auc: number | null;
  brier: number;
  brier_referencia: number;
  exactitud: number;
  sensibilidad: number | null;
  especificidad: number | null;
}

export interface VersionModelo {
  _id: string;
  version: number;
  estado: EstadoModelo;
  activo: boolean;
  createdAt: string;
  iniciado_en: string | null;
  terminado_en: string | null;
  anios_usados: number[];
  anios_reales: number;
  es_demostracion: boolean;
  filas_entrenamiento: number | null;
  filas_prueba: number | null;
  criterio_prueba: 'ANIO' | 'ESTUDIANTES' | null;
  anio_prueba: number | null;
  metricas: Metricas | null;
  motivo_rechazo: string | null;
  error: string | null;
  activado_en: string | null;
  vigente: boolean;
}

export interface ListaModelos {
  modelos: VersionModelo[];
  en_cola: boolean;
  demostracion: { disponible: boolean; generado: string | null; metricas: Metricas | null };
}

export interface ElementoFoda {
  clave: string;
  texto: string;
}

export interface Foda {
  fortalezas: ElementoFoda[];
  oportunidades: ElementoFoda[];
  debilidades: ElementoFoda[];
  amenazas: ElementoFoda[];
}

export interface NotaRequerida {
  estado: EstadoNotaRequerida;
  nota: number | null;
  definitiva: number | null;
  periodos_restantes: number;
}

export interface RiesgoPromocion {
  no_promovido: number;
  recuperacion: number;
  comision: number;
  promovido: number;
  perdidas_esperadas: number;
  simulaciones: number;
}

export type FuenteProbabilidad = 'NOTAS' | 'MODELO' | 'MODELO_E_HISTORIAL' | 'HISTORIAL';

export interface Proporcion {
  porcentaje: number | null;
}

export interface EstadisticasAsignatura {
  asistencia: Proporcion & { registros: number; fallas: number };
  actividades: Proporcion & { vencidas: number; entregadas: number };
  periodos: Array<{ periodo: number; nota: number | null; cerrado: boolean; exento: boolean }>;
  /** Años anteriores: la nota está en la escala de ese año; `normalizada` (0–1) sirve para la barra. */
  historial: Array<{ year: number; nota: number; normalizada: number; perdida: boolean; misma: boolean }>;
}

export interface AsignaturaAnalizada {
  subject_id: string;
  nombre: string;
  nota: number | null;
  desempeno: string | null;
  nivel: NivelDesempeno | null;
  tendencia: 'SUBE' | 'BAJA' | 'ESTABLE' | null;
  nota_requerida: NotaRequerida;
  /** Solo llegan al personal: el servidor no los manda al estudiante ni a la familia. */
  probabilidad?: number | null;
  riesgo?: NivelRiesgo | null;
  probabilidad_fuente?: FuenteProbabilidad | null;
  estadisticas: EstadisticasAsignatura;
  foda: Foda;
}

export interface AnalisisEstudiante {
  estudiante: { _id: string; nombre: string; apellido: string; grado: number; grupo: string };
  anio: { _id: string; year: number };
  corte: number;
  total_periodos: number;
  /** El periodo en curso (null si ya cerraron todos). */
  periodo_actual: number | null;
  /** Decimales de la escala del año (M05): las notas se muestran con ellos. */
  decimales: number;
  escala: { minima: number; maxima: number; aprobatoria: number };
  estado: 'LISTO' | 'SIN_DATOS';
  modelo: { origen: 'ENTRENADO' | 'DEMOSTRACION' | null; version: number | null; aviso: string | null };
  general: {
    promedio: number | null;
    desempeno: string | null;
    nivel: NivelDesempeno | null;
    asignaturas_perdiendo: number;
    asistencia: Proporcion & { registros: number; fallas: number };
    actividades: Proporcion & { vencidas: number; entregadas: number };
    /** Solo llegan al personal. */
    asignaturas_en_riesgo?: number;
    riesgo?: RiesgoPromocion | null;
  };
  foda: Foda;
  asignaturas: AsignaturaAnalizada[];
  ve: { probabilidad: boolean; convivencia: boolean };
}

export interface EstudianteEncontrado {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string;
}

export function useModelosPredictivos() {
  return useQuery({
    queryKey: ['predictivo-modelos'],
    queryFn: () => api.get<ListaModelos>('/predictivo/modelos'),
    // Mientras hay un entrenamiento en cola se vuelve a preguntar seguido para mostrar cuándo termina.
    refetchInterval: (query) => (query.state.data?.en_cola ? 10_000 : false),
  });
}

export function useEntrenarModelo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<VersionModelo>('/predictivo/modelos/entrenar'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['predictivo-modelos'] });
    },
  });
}

export function useActivarModelo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<VersionModelo>(`/predictivo/modelos/${id}/activar`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['predictivo-modelos'] });
      void queryClient.invalidateQueries({ queryKey: ['predictivo-analisis'] });
    },
  });
}

export function useBuscarEstudiantesPredictivo(texto: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: ['predictivo-estudiantes', q],
    queryFn: () => api.get<EstudianteEncontrado[]>('/predictivo/estudiantes', { q }),
    enabled: q.length >= 3,
    staleTime: 60_000,
  });
}

export function useAnalisisDeEstudiante(studentId: string | null) {
  return useQuery({
    queryKey: ['predictivo-analisis', 'personal', studentId],
    queryFn: () => api.get<AnalisisEstudiante>(`/predictivo/estudiantes/${studentId}`),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useMiAnalisis() {
  return useQuery({
    queryKey: ['predictivo-analisis', 'propio'],
    queryFn: () => api.get<AnalisisEstudiante>('/predictivo/mio'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAnalisisDeHijo(studentId: string) {
  return useQuery({
    queryKey: ['predictivo-analisis', 'hijo', studentId],
    queryFn: () => api.get<AnalisisEstudiante>(`/predictivo/hijos/${studentId}`),
    staleTime: 60_000,
    retry: false,
  });
}
