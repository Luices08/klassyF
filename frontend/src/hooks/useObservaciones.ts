import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoActivo } from '../types/domain';

export const FAMILIAS_OBSERVACION = ['ACADEMICA', 'COMPORTAMENTAL', 'DISCIPLINARIA'] as const;
export type FamiliaObservacion = (typeof FAMILIAS_OBSERVACION)[number];
export const NOMBRES_FAMILIA: Record<FamiliaObservacion, string> = {
  ACADEMICA: 'Académica',
  COMPORTAMENTAL: 'Comportamental',
  DISCIPLINARIA: 'Disciplinaria',
};

export const TIPOS_SITUACION = ['I', 'II', 'III'] as const;
export type TipoSituacion = (typeof TIPOS_SITUACION)[number];

export interface TipoObservacion {
  _id: string;
  nombre: string;
  familia: FamiliaObservacion;
  visible_estudiante: boolean;
  orden: number;
  estado: EstadoActivo;
}

export interface CategoriaDescriptor {
  _id: string;
  nombre: string;
  orden: number;
  estado: EstadoActivo;
}

export interface Descriptor {
  _id: string;
  tipo_id: string;
  categoria_id: string | null;
  codigo: string | null;
  texto: string;
  tipo_situacion: TipoSituacion | null;
  descuento_decimas: number | null;
  orden: number;
  estado: EstadoActivo;
}

export interface CatalogoConvivencia {
  tipos: TipoObservacion[];
  categorias: CategoriaDescriptor[];
  descriptores: Descriptor[];
}

export interface ConfiguracionConvivencia {
  plazo_enmienda_horas: number;
  plazo_anulacion_horas: number;
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

export interface DescriptorRegistrado {
  descriptor_id: string;
  codigo: string | null;
  texto: string;
  tipo_situacion: TipoSituacion | null;
}

export const RESPONSABLES_COMPROMISO = ['ESTUDIANTE', 'ACUDIENTE', 'DOCENTE', 'INSTITUCION'] as const;
export type ResponsableCompromiso = (typeof RESPONSABLES_COMPROMISO)[number];
export const NOMBRES_RESPONSABLE: Record<ResponsableCompromiso, string> = {
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
  DOCENTE: 'Docente',
  INSTITUCION: 'Institución',
};

export const MEDIOS_CITACION = ['LLAMADA', 'MENSAJE', 'CORREO', 'PRESENCIAL', 'OTRO'] as const;
export type MedioCitacion = (typeof MEDIOS_CITACION)[number];
export const NOMBRES_MEDIO: Record<MedioCitacion, string> = {
  LLAMADA: 'Llamada',
  MENSAJE: 'Mensaje',
  CORREO: 'Correo',
  PRESENCIAL: 'Presencial',
  OTRO: 'Otro',
};

export interface CompromisoObservacion {
  _id: string;
  descripcion: string;
  responsable: ResponsableCompromiso;
  fecha_limite: string;
  estado: 'PENDIENTE' | 'CUMPLIDO' | 'INCUMPLIDO';
  /** Calculado por el servidor: pendiente y con la fecha límite ya pasada. */
  vencido: boolean;
  fecha_cierre: string | null;
  nota_cierre: string;
}

export interface CitacionObservacion {
  _id: string;
  fecha: string;
  medio: MedioCitacion;
  dirigida_a: string;
  resultado: string;
}

export interface SolicitudCaso {
  estado: 'PENDIENTE' | 'DESCARTADA';
  origen: 'AUTOMATICA' | 'MANUAL';
  motivo: string;
  fecha: string;
  motivo_resolucion: string;
}

/** Lo que el servidor devuelve según quién consulta: `reservada` oculta el contenido (situaciones II y III). */
export interface ObservacionVista {
  _id: string;
  student_id: string;
  fecha_hecho: string;
  periodo_numero: number | null;
  tipo_nombre: string;
  familia: FamiliaObservacion;
  tipo_situacion_maxima: TipoSituacion | null;
  estado: 'ACTIVA' | 'ANULADA';
  createdAt: string;
  reservada: boolean;
  descriptores?: DescriptorRegistrado[];
  comentario?: string;
  texto_generado?: string;
  tipo_id?: string;
  contexto?: 'CLASE' | 'DIRECCION_GRUPO' | 'COORDINACION';
  autor?: string | null;
  autor_id?: string;
  evento_id?: string | null;
  anulacion?: { motivo: string; fecha: string } | null;
  cantidad_enmiendas?: number;
  compromisos?: CompromisoObservacion[];
  citaciones?: CitacionObservacion[];
  solicitud_caso?: SolicitudCaso | null;
  /** Solo en "Mis registros". */
  estudiante?: string;
}

export interface ObservacionPropia {
  _id: string;
  fecha_hecho: string;
  periodo_numero: number | null;
  tipo_nombre: string;
  texto_generado: string;
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
    mutationFn: (input: TipoObservacionInput & { familia: FamiliaObservacion }) =>
      api.post<TipoObservacion>('/observaciones/tipos', input),
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

export interface CategoriaInput {
  nombre: string;
  orden: number;
}

export function useCrearCategoriaDescriptor() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: CategoriaInput) => api.post<CategoriaDescriptor>('/observaciones/categorias', input),
    onSuccess: invalidar,
  });
}

export function useActualizarCategoriaDescriptor() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: CategoriaInput & { id: string }) =>
      api.patch<CategoriaDescriptor>(`/observaciones/categorias/${id}`, input),
    onSuccess: invalidar,
  });
}

export interface DescriptorInput {
  categoria_id: string | null;
  codigo: string | null;
  texto: string;
  tipo_situacion: TipoSituacion | null;
  descuento_decimas: number | null;
  orden: number;
}

export function useCrearDescriptor() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: DescriptorInput & { tipo_id: string }) => api.post<Descriptor>('/observaciones/descriptores', input),
    onSuccess: invalidar,
  });
}

export function useActualizarDescriptor() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: DescriptorInput & { id: string }) =>
      api.patch<Descriptor>(`/observaciones/descriptores/${id}`, input),
    onSuccess: invalidar,
  });
}

export type RecursoCatalogo = 'tipos' | 'categorias' | 'descriptores';

export function useCambiarEstadoCatalogo() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ recurso, id, estado }: { recurso: RecursoCatalogo; id: string; estado: EstadoActivo }) =>
      api.patch<unknown>(`/observaciones/${recurso}/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarDelCatalogo() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ recurso, id }: { recurso: RecursoCatalogo; id: string }) =>
      api.delete<null>(`/observaciones/${recurso}/${id}`),
    onSuccess: invalidar,
  });
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

// --- Observaciones ---

export function useGruposObservables() {
  return useQuery({
    queryKey: ['observaciones', 'grupos'],
    queryFn: () => api.get<GrupoObservable[]>('/observaciones/grupos'),
    staleTime: 60_000,
  });
}

export function useEstudiantesObservables(params: { group_id?: string; q?: string }) {
  const q = params.q?.trim() ?? '';
  return useQuery({
    queryKey: ['observaciones', 'estudiantes', params.group_id ?? '', q],
    queryFn: () => api.get<EstudianteObservable[]>('/observaciones/estudiantes', { group_id: params.group_id, q: q || undefined }),
    enabled: Boolean(params.group_id) || q.length >= 3,
    placeholderData: keepPreviousData,
  });
}

export interface RegistrarObservacionInput {
  estudiantes_ids: string[];
  tipo_id: string;
  descriptores_ids: string[];
  comentario: string;
  fecha_hecho: string;
  en_nombre_de_id?: string;
}

export function useRegistrarObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: (input: RegistrarObservacionInput) => api.post<ObservacionVista[]>('/observaciones', input),
    onSuccess: invalidar,
  });
}

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

export function useAgregarCompromiso() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; descripcion: string; responsable: ResponsableCompromiso; fecha_limite: string }) =>
      api.post<ObservacionVista>(`/observaciones/${id}/compromisos`, input),
    onSuccess: invalidar,
  });
}

export function useCerrarCompromiso() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, compromisoId, ...input }: { id: string; compromisoId: string; estado: 'CUMPLIDO' | 'INCUMPLIDO'; nota?: string }) =>
      api.patch<ObservacionVista>(`/observaciones/${id}/compromisos/${compromisoId}`, input),
    onSuccess: invalidar,
  });
}

export function useAgregarCitacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; fecha: string; medio: MedioCitacion; dirigida_a?: string; resultado?: string }) =>
      api.post<ObservacionVista>(`/observaciones/${id}/citaciones`, input),
    onSuccess: invalidar,
  });
}

export function useSolicitarCaso() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.post<ObservacionVista>(`/observaciones/${id}/solicitud-caso`, { motivo }),
    onSuccess: invalidar,
  });
}

export function useDescartarSolicitudCaso() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.patch<ObservacionVista>(`/observaciones/${id}/solicitud-caso/descartar`, { motivo }),
    onSuccess: invalidar,
  });
}

export interface SolicitudEnBandeja extends ObservacionVista {
  estudiante: string;
  numero_documento: string;
  grupo: string;
}

export function useBandejaCasos(pagina: number) {
  return useQuery({
    queryKey: ['observaciones', 'bandeja', pagina],
    queryFn: () =>
      api.raw<{ success: true; data: SolicitudEnBandeja[]; total: number; pagina: number; limite: number }>(
        '/observaciones/solicitudes-caso',
        { query: { pagina, limite: 20 } }
      ),
    select: (res) => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useMiObservador() {
  return useQuery({
    queryKey: ['observaciones', 'mi-observador'],
    queryFn: () => api.get<ObservacionPropia[]>('/observaciones/mi-observador'),
    staleTime: 60_000,
  });
}

export function useEnmendarObservacion() {
  const invalidar = useInvalidarObservaciones();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; descriptores_ids?: string[]; comentario?: string }) =>
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
