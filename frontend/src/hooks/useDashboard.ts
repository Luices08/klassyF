import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

/** Dashboards de rectoría y coordinación (M30). Cada bloque es su propia consulta: uno lento no frena a los demás. */

export interface FiltrosDashboard {
  academic_year_id: string;
  sede_id?: string;
  /** Sin periodo, cada bloque mide el que le corresponde (el que se está entregando o el último con notas cerradas). */
  periodo_numero?: number;
}

export interface ContextoDashboard {
  academic_year_id: string;
  anio: number;
  periodo_en_curso: number;
  periodo_notas: number;
  grupos: number;
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
}

/** Los datos se aceptan con un par de minutos de atraso (el servidor los guarda 90 s): se pide de nuevo cada 2 minutos mientras la pantalla esté abierta. */
const REFRESCO_MS = 120_000;

function useBloque<T>(ruta: string, filtros: FiltrosDashboard | null) {
  return useQuery({
    queryKey: ['dashboard', ruta, filtros],
    queryFn: () => api.get<T>(`/dashboard${ruta}`, { ...filtros }),
    enabled: Boolean(filtros?.academic_year_id),
    staleTime: 60_000,
    refetchInterval: REFRESCO_MS,
  });
}

// --- Rectoría ---

export type ModoRendimiento = 'OFICIAL' | 'PROVISIONAL' | 'SIN_DATOS';

export interface Indicadores {
  contexto: ContextoDashboard;
  matricula: { matriculados: number; capacidad: number; disponibles: number; ocupacion_pct: number | null; preinscritos: number };
  rendimiento: { modo: ModoRendimiento; aprobacion_pct: number | null; reprobacion_pct: number | null; base: number };
  asistencia: { asistencia_pct: number | null; inasistencia_pct: number | null; fallas_injustificadas: number; retardos: number; registros: number };
  planillas: {
    clases_total: number;
    clases_cerradas: number;
    clases_pct: number | null;
    notas_esperadas: number;
    notas_cerradas: number;
    notas_pct: number | null;
    periodo_numero: number;
    fecha_cierre_notas: string | null;
  };
}

export interface FilaEficiencia {
  grado_id: string;
  grado: string;
  grado_numero: number;
  /** Nivel del catálogo de grados; ausente en respuestas guardadas en la caché del servidor antes de este campo. */
  nivel?: 'PREESCOLAR' | 'PRIMARIA' | 'SECUNDARIA' | 'MEDIA';
  matriculados: number;
  retirados: number;
  promovidos: number;
  no_promovidos: number;
  pendientes: number;
  sin_perdidas: number;
  con_perdidas: number;
  sin_notas: number;
}

export interface Eficiencia {
  contexto: ContextoDashboard;
  periodo_notas: number;
  filas: FilaEficiencia[];
  totales: Omit<FilaEficiencia, 'grado_id' | 'grado' | 'grado_numero' | 'nivel'>;
  rendimiento: Indicadores['rendimiento'];
}

export interface FilaMorbilidad {
  clave: string;
  nombre: string;
  area: string;
  evaluados: number;
  reprobados: number;
  porcentaje: number;
}

export interface Morbilidad {
  contexto: ContextoDashboard;
  minimo_evaluados: number;
  reprobacion_pct: number | null;
  asignaturas: FilaMorbilidad[];
  areas: FilaMorbilidad[];
}

export const useIndicadores = (f: FiltrosDashboard | null) => useBloque<Indicadores>('/indicadores', f);
export const useEficiencia = (f: FiltrosDashboard | null) => useBloque<Eficiencia>('/eficiencia', f);
export const useMorbilidad = (f: FiltrosDashboard | null) => useBloque<Morbilidad>('/morbilidad', f);

// --- Coordinación académica ---

export interface EntregaDeNotas {
  contexto: ContextoDashboard;
  corte: { periodo_numero: number; estado: string | null; fecha_fin: string | null; fecha_cierre_notas: string | null };
  avance: Omit<Indicadores['planillas'], 'periodo_numero' | 'fecha_cierre_notas'>;
  pendientes: {
    total: number;
    docentes: Array<{ docente_id: string; docente: string; pendientes: number; clases: Array<{ asignatura: string; grupo: string; cerradas: number; estudiantes: number }> }>;
  };
}

export interface RiesgoCritico {
  contexto: ContextoDashboard;
  hay_notas_provisionales: boolean;
  umbrales: { perdidas_rojo_desde: number; inasistencia_roja_pct: number };
  resumen: { VERDE: number; AMARILLO: number; NARANJA: number; ROJO: number; total: number; con_piar: number };
  por_perdidas: number;
  por_inasistencia: number;
  estudiantes: Array<{ student_id: string; nombre: string; apellido: string; grupo: string; perdidas: number; inasistencia_pct: number; motivos: string[] }>;
}

export interface ResumenRecuperacion {
  aplica: boolean;
  motivo_no_aplica: string | null;
  pendientes: number;
  estudiantes_pendientes: number;
  superadas: number;
  no_superadas: number;
}

export interface Recuperaciones {
  contexto: ContextoDashboard;
  periodo: ResumenRecuperacion & { periodo_numero: number };
  anual: ResumenRecuperacion | null;
  por_grado: Array<{ grado: string; pendientes: number }>;
}

export interface ResumenServicioSocial {
  estudiantes: number;
  aprobados: number;
  pendientes: number;
  sin_exigencia: boolean;
  horas_por_verificar: number;
}

export interface ServicioSocial extends ResumenServicioSocial {
  contexto: ContextoDashboard;
  exigidas: number | null;
  por_grado: Array<ResumenServicioSocial & { grado_numero: number }>;
}

export type NivelDesempeno = 'SUPERIOR' | 'ALTO' | 'BASICO' | 'BAJO';

export interface Desempeno {
  contexto: ContextoDashboard;
  total: number;
  niveles: Array<{ nivel: NivelDesempeno; etiqueta: string; total: number; porcentaje: number | null }>;
}

export interface ComparativoDeGrupos {
  contexto: ContextoDashboard;
  grados: Array<{
    grado_id: string;
    grado: string;
    grado_numero: number;
    brecha: number | null;
    grupos: Array<{ grupo_id: string; etiqueta: string; promedio: number | null; notas: number }>;
  }>;
}

export interface AlertasCoordinacion {
  contexto: ContextoDashboard;
  justificaciones_pendientes: number;
  sesiones_sin_realizar: number;
}

export const useEntregaDeNotas = (f: FiltrosDashboard | null) => useBloque<EntregaDeNotas>('/coordinacion/entrega-notas', f);
export const useRiesgoCritico = (f: FiltrosDashboard | null) => useBloque<RiesgoCritico>('/coordinacion/riesgo', f);
export const useRecuperacionesPendientes = (f: FiltrosDashboard | null) => useBloque<Recuperaciones>('/coordinacion/recuperaciones', f);
export const useServicioSocialResumen = (f: FiltrosDashboard | null) => useBloque<ServicioSocial>('/coordinacion/servicio-social', f);
export const useDesempeno = (f: FiltrosDashboard | null) => useBloque<Desempeno>('/coordinacion/desempeno', f);
export const useComparativoDeGrupos = (f: FiltrosDashboard | null) => useBloque<ComparativoDeGrupos>('/coordinacion/comparativo', f);
export const useAlertasCoordinacion = (f: FiltrosDashboard | null) => useBloque<AlertasCoordinacion>('/coordinacion/alertas', f);

// --- Convivencia y orientación (solo conteos y códigos de casos) ---

/** Estos paneles no miran periodos: se piden por año y, si se quiere, por una sede (la del usuario; el servidor ignora las ajenas). */
function useBloqueBienestar<T>(ruta: string, filtros: FiltrosDashboard | null) {
  const consulta = filtros ? { academic_year_id: filtros.academic_year_id, ...(filtros.sede_id ? { sede_id: filtros.sede_id } : {}) } : null;
  return useQuery({
    queryKey: ['dashboard', ruta, consulta],
    queryFn: () => api.get<T>(`/dashboard${ruta}`, { ...consulta }),
    enabled: Boolean(consulta?.academic_year_id),
    staleTime: 60_000,
    refetchInterval: REFRESCO_MS,
  });
}

export type GravedadConvivencia = 'I' | 'II' | 'III';

export interface PanelConvivencia {
  solicitudes: { pendientes: number; mas_antigua_dias: number | null };
  casos: { activos: number; por_estado: Record<string, number>; por_tipo: Record<GravedadConvivencia, number> };
  alertas: {
    total: number;
    remision_tipo_iii: number;
    seguimiento_vencido: number;
    casos: Array<{ _id: string; codigo: string; tipo_situacion: GravedadConvivencia; alertas: string[] }>;
  };
  comite: { borradores: number; proxima: { fecha: string; hora: string; lugar: string; tipo: string } | null; periodicidad_vencida: boolean; ultima_ordinaria: string | null };
  faltas: { dias: number; total: number; por_gravedad: Record<GravedadConvivencia, number> };
  remisiones_orientacion: { pendientes: number; en_atencion: number };
}

export interface PanelOrientacion {
  remisiones: { PENDIENTE: number; EN_ATENCION: number; ATENDIDA: number; mas_antigua_dias: number | null };
  solicitudes_apoyo: { pendientes: number; en_valoracion: number };
  expedientes: { total: number; por_estado: Record<string, number>; piar: number; plan_apoyo: number; plazo_vencido: number; sin_autorizacion: number };
  seguimiento: { total: number; con_minimo: number; minimo: number };
}

export const usePanelConvivencia = (f: FiltrosDashboard | null, habilitado = true) => useBloqueBienestar<PanelConvivencia>('/convivencia', habilitado ? f : null);
export const usePanelOrientacion = (f: FiltrosDashboard | null, habilitado = true) => useBloqueBienestar<PanelOrientacion>('/orientacion', habilitado ? f : null);

// --- Secretaría: sus trámites en conteos, acotados a las sedes que tiene asignadas ---

export interface PanelSecretaria {
  contexto: { academic_year_id: string; anio: number; grupos: number };
  matricula: { matriculados: number; capacidad: number; disponibles: number; ocupacion_pct: number | null; preinscritos: number; por_estado: Record<string, number> };
  admisiones: { pendientes: number; admitidas: number; mas_antigua_dias: number | null };
  documentos: { por_revisar: number; condicionales: { total: number; plazo_vencido: number } };
  salidas: { total: number; paz_y_salvo_pendiente: number; paz_y_salvo_bloqueado: number; cupo_retenido: number };
  renovacion: { continuan: number; no_continuan: number; sin_respuesta: number };
  ocupacion_por_grado: Array<{ grado_id: string; grado: string; grado_numero: number; ocupados: number; capacidad: number; ocupacion_pct: number | null }>;
}

export const usePanelSecretaria = (f: FiltrosDashboard | null) => useBloqueBienestar<PanelSecretaria>('/secretaria', f);
