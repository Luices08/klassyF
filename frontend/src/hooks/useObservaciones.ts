import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoActivo } from '../types/domain';

export const TIPOS_SITUACION = ['I', 'II', 'III'] as const;
export type TipoSituacion = (typeof TIPOS_SITUACION)[number];
export const NOMBRES_GRAVEDAD: Record<TipoSituacion, string> = { I: 'Tipo I (leve)', II: 'Tipo II', III: 'Tipo III' };

export const ROLES_INVOLUCRADO = ['AFECTADO', 'PRESUNTO_RESPONSABLE', 'TESTIGO', 'REPORTANTE'] as const;
export type RolInvolucrado = (typeof ROLES_INVOLUCRADO)[number];
export const NOMBRES_ROL_INVOLUCRADO: Record<RolInvolucrado, string> = {
  AFECTADO: 'Afectado',
  PRESUNTO_RESPONSABLE: 'Presunto responsable',
  TESTIGO: 'Testigo',
  REPORTANTE: 'Reportante',
};

export interface TipoObservacion {
  _id: string;
  nombre: string;
  visible_estudiante: boolean;
  orden: number;
  estado: EstadoActivo;
}

/** Una falta del manual de convivencia con su gravedad (la define la institución, M15). */
export interface FaltaConvivencia {
  _id: string;
  codigo: string;
  descripcion: string;
  gravedad: TipoSituacion;
  estado: EstadoActivo;
}

export interface CatalogoConvivencia {
  tipos: TipoObservacion[];
  faltas: FaltaConvivencia[];
}

export interface ConfiguracionConvivencia {
  plazo_enmienda_horas: number;
  plazo_anulacion_horas: number;
  plazo_remision_tipo_iii_horas: number;
  quorum_porcentaje: number;
  retencion_anios_observaciones: number | null;
  retencion_anios_casos: number | null;
}

export interface GrupoObservable {
  _id: string;
  nomenclatura: string;
  grado: string;
  sede_id: string;
  es_director: boolean;
}

export interface EstudianteObservable {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  group_id: string;
  grupo: string;
}

export const ESTADOS_COMPROMISO = ['PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO'] as const;
export type EstadoCompromiso = (typeof ESTADOS_COMPROMISO)[number];

export const MEDIOS_CITACION = ['LLAMADA', 'MENSAJE', 'CORREO', 'PRESENCIAL', 'OTRO'] as const;
export type MedioCitacion = (typeof MEDIOS_CITACION)[number];
export const NOMBRES_MEDIO: Record<MedioCitacion, string> = {
  LLAMADA: 'Llamada',
  MENSAJE: 'Mensaje',
  CORREO: 'Correo',
  PRESENCIAL: 'Presencial',
  OTRO: 'Otro',
};

export type ClaseRegistro = 'OBSERVACION' | 'FALTA';
export type ContextoRegistro = 'CLASE' | 'DIRECCION_GRUPO' | 'COORDINACION' | 'ORIENTACION';

/**
 * Lo que el servidor devuelve según quién consulta. `reservada` es una falta Tipo II/III vista por quien solo puede saber que
 * existe: trae la clase y la gravedad, nada más.
 */
export interface ObservacionVista {
  _id: string;
  student_id: string;
  clase: ClaseRegistro;
  fecha_hecho: string;
  periodo_numero: number | null;
  gravedad: TipoSituacion | null;
  estado: 'ACTIVA' | 'ANULADA';
  createdAt: string;
  reservada: boolean;
  /** Tipo de la observación, o «Falta <código>». */
  tipo_nombre?: string;
  tipo_id?: string | null;
  requiere_citacion?: boolean;
  confidencial?: boolean;
  citacion_realizada?: { fecha: string; resultado: string } | null;
  falta?: { codigo: string; descripcion: string; gravedad: TipoSituacion } | null;
  version_estudiante?: string;
  solicitud_id?: string | null;
  descripcion?: string;
  compromiso?: string;
  compromiso_estado?: EstadoCompromiso | null;
  contexto?: ContextoRegistro;
  autor?: string | null;
  autor_id?: string;
  evento_id?: string | null;
  anulacion?: { motivo: string; fecha: string } | null;
  cantidad_enmiendas?: number;
  seguimientos?: { _id: string; fecha: string; nota: string }[];
  /** Qué pasó con lo que se remitió a convivencia (solo quien registró). */
  solicitud?: { estado: 'PENDIENTE' | 'DESCARTADA' | 'CONVERTIDA'; motivo_resolucion: string } | null;
  /** Que existe un caso y en qué estado (nunca su contenido). */
  caso?: { codigo: string; estado: string; tipo_situacion: TipoSituacion } | null;
  /** Solo en "Mis registros". */
  estudiante?: string;
}

/**
 * Lo que el estudiante ve de su observador. De una falta grave solo llega la gravedad y la `situacion` (el estado del caso de
 * convivencia, o EN_REVISION): ni la falta ni los hechos.
 */
export interface ObservacionPropia {
  _id: string;
  clase: ClaseRegistro;
  fecha_hecho: string;
  periodo_numero: number | null;
  tipo_nombre: string;
  gravedad?: TipoSituacion | null;
  falta?: { codigo: string; descripcion: string } | null;
  descripcion?: string;
  version_estudiante?: string;
  compromiso?: string;
  situacion?: string | null;
}

export interface PaginaObservaciones {
  data: ObservacionVista[];
  total: number;
  pagina: number;
  limite: number;
}

// --- Catálogo y política ---

export function useCatalogoConvivencia(incluirInactivos = false) {
  return useQuery({
    queryKey: ['observaciones', 'catalogo', { incluirInactivos }],
    queryFn: () =>
      api.get<CatalogoConvivencia>('/observaciones/catalogo', incluirInactivos ? { incluir_inactivos: 'true' } : {}),
    staleTime: 60_000,
  });
}

function useInvalidarObservaciones() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['observaciones'] });
  };
}

export interface TipoObservacionInput {
  nombre: string;
  visible_estudiante: boolean;
  orden: number;
}

export function useCrearTipoObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: TipoObservacionInput) => api.post<TipoObservacion>('/observaciones/tipos', input),
    onSuccess: invalidar,
  });
}

export function useActualizarTipoObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: TipoObservacionInput & { id: string }) =>
      api.patch<TipoObservacion>(`/observaciones/tipos/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoTipo() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) =>
      api.patch<TipoObservacion>(`/observaciones/tipos/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarTipo() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({ mutationFn: (id: string) => api.delete<null>(`/observaciones/tipos/${id}`), onSuccess: invalidar });
}

export function useConfiguracionConvivencia() {
  return useQuery({
    queryKey: ['observaciones', 'configuracion'],
    queryFn: () => api.get<ConfiguracionConvivencia>('/observaciones/configuracion'),
  });
}

export function useActualizarConfiguracionConvivencia() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: Partial<ConfiguracionConvivencia>) =>
      api.patch<ConfiguracionConvivencia>('/observaciones/configuracion', input),
    onSuccess: invalidar,
  });
}

// --- Buscador acotado ---

export function useGruposObservables() {
  return useQuery({
    queryKey: ['observaciones', 'grupos'],
    queryFn: () => api.get<GrupoObservable[]>('/observaciones/grupos'),
    staleTime: 60_000,
  });
}

/** `ambito: 'sede'`: un docente busca por nombre en toda su sede (sin documento) para nombrar a alguien en un reporte a coordinación. */
export function useEstudiantesObservables(params: { group_id?: string; q?: string; ambito?: 'sede' }) {
  const q = params.q?.trim() ?? '';
  return useQuery({
    queryKey: ['observaciones', 'estudiantes', params.group_id ?? '', q, params.ambito ?? ''],
    queryFn: () => api.get<EstudianteObservable[]>('/observaciones/estudiantes', { group_id: params.group_id, q: q || undefined, ambito: params.ambito }),
    enabled: params.ambito === 'sede' ? q.length >= 3 : Boolean(params.group_id) || q.length >= 3,
    placeholderData: keepPreviousData,
  });
}

// --- Registro ---

export interface RegistrarObservacionInput {
  estudiantes_ids: string[];
  tipo_id: string;
  descripcion: string;
  compromiso?: string;
  /** Lo que el estudiante manifestó (descargo verbal). */
  version_estudiante?: string;
  requiere_citacion: boolean;
  confidencial: boolean;
  fecha_hecho: string;
}

export function useRegistrarObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: RegistrarObservacionInput) => api.post<ObservacionVista[]>('/observaciones', input),
    onSuccess: invalidar,
  });
}

/** Una falta Tipo I (leve). Lo grave (II o III) se envía a coordinación con `ReporteUrgenteInput`. */
export interface RegistrarFaltaInput {
  falta_id: string;
  fecha_hecho: string;
  hechos: string;
  version_estudiante?: string;
  compromiso?: string;
  /** Si no se resolvió con la mediación del aula, llega a coordinación de convivencia como solicitud de caso. */
  escalar_a_coordinacion?: boolean;
  estudiantes_ids: string[];
}

export interface ResultadoFalta {
  registros: ObservacionVista[];
  /** true si se generó una solicitud de caso para coordinación de convivencia. */
  escalada: boolean;
}

export function useRegistrarFalta() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: RegistrarFaltaInput) => api.post<ResultadoFalta>('/observaciones/faltas', input),
    onSuccess: invalidar,
  });
}

/** Una situación grave (Tipo II o III): la falta del manual que identifica el docente, qué pasó, a quiénes nombra y qué contención aplicó. Los roles los asigna coordinación. */
export interface ReporteUrgenteInput {
  falta_id?: string;
  fecha_hecho: string;
  hechos: string;
  acciones_contencion: string;
  estudiantes_ids: string[];
}

export function useReportarSituacionGrave() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: ReporteUrgenteInput) => api.post<{ _id: string; estado: string; estudiantes: number }>('/observaciones/reportes-urgentes', input),
    onSuccess: invalidar,
  });
}

/** Lo que reportó el docente y qué pasó con ello (el expediente del caso nunca viaja). */
export interface ReporteUrgentePropio {
  _id: string;
  fecha_hecho: string;
  createdAt: string;
  hechos: string;
  acciones_contencion: string;
  estudiantes: string[];
  falta: { codigo: string; descripcion: string; gravedad: TipoSituacion } | null;
  estado: 'PENDIENTE' | 'DESCARTADA' | 'CONVERTIDA';
  motivo_resolucion: string;
  caso: { codigo: string; estado: string } | null;
}

export function useMisReportesUrgentes(pagina: number) {
  return useQuery({
    queryKey: ['observaciones', 'reportes-urgentes', pagina],
    queryFn: () => api.raw<{ success: true; data: ReporteUrgentePropio[]; total: number; pagina: number; limite: number }>('/observaciones/reportes-urgentes/mios', { query: { pagina, limite: 20 } }),
    select: (res) => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
  });
}

// --- Consulta ---

export function useHistorialObservaciones(studentId: string | undefined, pagina: number) {
  return useQuery({
    queryKey: ['observaciones', 'historial', studentId, pagina],
    queryFn: () =>
      api.raw<{ success: true } & PaginaObservaciones>(`/observaciones/estudiantes/${studentId}`, {
        query: { pagina, limite: 20 },
      }),
    enabled: Boolean(studentId),
    select: (res): PaginaObservaciones => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
    // Cada consulta deja rastro en la auditoría: no se repite sola al volver a la pestaña.
    staleTime: 60_000,
    retry: false,
  });
}

export function useMisObservaciones(pagina: number) {
  return useQuery({
    queryKey: ['observaciones', 'mias', pagina],
    queryFn: () =>
      api.raw<{ success: true } & PaginaObservaciones>('/observaciones/mias', { query: { pagina, limite: 20 } }),
    select: (res): PaginaObservaciones => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
  });
}

export function useMiObservador() {
  return useQuery({
    queryKey: ['observaciones', 'mi-observador'],
    queryFn: () => api.get<ObservacionPropia[]>('/observaciones/mi-observador'),
    staleTime: 60_000,
  });
}

// --- Enmienda, anulación y seguimiento ---

export interface EnmendarObservacionInput {
  descripcion?: string;
  compromiso?: string;
  requiere_citacion?: boolean;
  confidencial?: boolean;
  version_estudiante?: string;
}

export function useEnmendarObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: EnmendarObservacionInput & { id: string }) =>
      api.patch<ObservacionVista>(`/observaciones/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useAnularObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.patch<ObservacionVista>(`/observaciones/${id}/anular`, { motivo }),
    onSuccess: invalidar,
  });
}

export function useAgregarSeguimiento() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, nota }: { id: string; nota: string }) =>
      api.post<ObservacionVista>(`/observaciones/${id}/seguimientos`, { nota }),
    onSuccess: invalidar,
  });
}

export function useMarcarCompromiso() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; estado: 'CUMPLIDO' | 'INCUMPLIDO'; nota?: string }) =>
      api.patch<ObservacionVista>(`/observaciones/${id}/compromiso`, input),
    onSuccess: invalidar,
  });
}

export function useRegistrarCitacionRealizada() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; fecha: string; resultado?: string }) =>
      api.post<ObservacionVista>(`/observaciones/${id}/citacion`, input),
    onSuccess: invalidar,
  });
}
