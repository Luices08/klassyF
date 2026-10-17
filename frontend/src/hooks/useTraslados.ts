import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export type EstadoNotaTraslado = 'HOMOLOGADA_EXTERNA' | 'EXENTA_POR_TRASLADO';
export type EstadoCeldaHomologacion = EstadoNotaTraslado | 'PENDIENTE';
export type TipoEscalaExterna = 'NUMERICA' | 'CONCEPTUAL';
export type MetodoConversion = 'LINEAL' | 'RANGOS';

export const NOMBRES_ESTADO_TRASLADO: Record<EstadoCeldaHomologacion, string> = {
  HOMOLOGADA_EXTERNA: 'Homologada',
  EXENTA_POR_TRASLADO: 'Exenta por traslado',
  PENDIENTE: 'Pendiente',
};

/** Espejo de `MAX_BYTES_SOPORTE_TRASLADO` y `MIN_LONGITUD_MOTIVO_TRASLADO` (backend/constants/traslados.ts). */
export const MAX_BYTES_SOPORTE_TRASLADO = 5 * 1024 * 1024;
export const MIN_LONGITUD_MOTIVO_TRASLADO = 5;

export interface EstudianteResumen {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface FilaTraslado {
  _id: string;
  enrollment_id: string;
  estudiante: EstudianteResumen;
  grupo: string;
  fecha_ingreso: string;
  periodo_ingreso: number;
  nombre_periodo_ingreso: string;
  institucion_procedencia: string;
  avance: { esperadas: number; homologadas: number; exentas: number };
}

export interface MatriculaDisponible {
  enrollment_id: string;
  estudiante: EstudianteResumen;
  grupo: string;
  tipo_ingreso: string;
  fecha_matricula: string;
}

export interface PeriodoOrigen {
  nombre: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

export interface FuenteCorrespondencia {
  indice_origen: number;
  peso: number;
}

export interface CorrespondenciaPeriodo {
  periodo_numero: number;
  fuentes: FuenteCorrespondencia[];
}

export interface InstitucionProcedencia {
  nombre: string;
  codigo_dane?: string;
  municipio?: string;
  calendario?: string;
}

export interface TrasladoInput {
  fecha_ingreso: string;
  periodo_ingreso: number;
  institucion_procedencia: InstitucionProcedencia;
  periodos_origen: PeriodoOrigen[];
  escala_externa_id: string | null;
  correspondencia?: CorrespondenciaPeriodo[];
  observaciones?: string;
}

export interface EscalaUsada {
  escala_externa_id: string | null;
  nombre: string;
  tipo: TipoEscalaExterna | 'INSTITUCIONAL';
  valor_minimo: number | null;
  valor_maximo: number | null;
  valor_aprobatorio: number | null;
}

export interface FuenteNotaHomologada {
  indice_origen: number;
  periodo_origen: string;
  valor_original: string;
  escala: EscalaUsada;
  nota_convertida: number;
  peso: number;
}

export interface CambioHomologacion {
  fecha: string;
  por: string;
  estado_anterior: EstadoNotaTraslado;
  nota_anterior: number | null;
  fuentes_anteriores: FuenteNotaHomologada[];
  motivo: string;
}

export interface ResultadoPeriodo {
  periodo_numero: number;
  estado: EstadoCeldaHomologacion;
  nota: number | null;
  fuentes: FuenteNotaHomologada[];
  historial?: CambioHomologacion[];
  faltan?: string[];
}

export interface ValorOrigen {
  indice_origen: number;
  valor_original: string;
}

export interface FilaHomologacion {
  subject_id: string;
  nombre: string;
  area: string;
  exenta: boolean;
  motivo: string;
  asignatura_origen: string;
  valores: ValorOrigen[];
  resultados: ResultadoPeriodo[];
}

export interface DetalleTraslado {
  _id: string;
  enrollment_id: string;
  estudiante: EstudianteResumen | null;
  grupo: { nombre: string; sede: string; jornada: string } | null;
  anio: { _id: string; year: number; estado: string };
  fecha_ingreso: string;
  periodo_ingreso: number;
  institucion_procedencia: InstitucionProcedencia;
  periodos_origen: PeriodoOrigen[];
  escala_externa_id: string | null;
  escala: EscalaUsada;
  escala_institucional: { nota_minima: number; nota_maxima: number; nota_aprobatoria: number; precision_decimales: number };
  observaciones: string;
  correspondencia_guardada: CorrespondenciaPeriodo[];
  correspondencia: CorrespondenciaPeriodo[];
  periodos: Array<{ numero: number; nombre: string }>;
  periodos_anio: Array<{ numero: number; nombre: string; fecha_inicio: string | null; fecha_fin: string | null }>;
  soportes: Array<{ _id: string; nombre: string; mimetype: string; tamano: number; fecha: string }>;
  filas: FilaHomologacion[];
  editable: boolean;
}

export interface FilaHomologacionInput {
  subject_id: string;
  exenta: boolean;
  motivo?: string;
  asignatura_origen?: string;
  valores: ValorOrigen[];
}

export interface ErrorHomologacion {
  subject_id: string;
  asignatura: string;
  periodo_origen: string;
  mensaje: string;
}

export interface VistaPreviaHomologacion {
  resultados: Array<ResultadoPeriodo & { subject_id: string }>;
  errores: ErrorHomologacion[];
}

export interface RangoEquivalencia {
  desde: number;
  hasta: number;
  nota: number;
}

export interface ConceptoEquivalencia {
  concepto: string;
  abreviatura: string;
  nota: number;
}

export interface EscalaExterna {
  _id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoEscalaExterna;
  valor_minimo: number | null;
  valor_maximo: number | null;
  valor_aprobatorio: number | null;
  metodo: MetodoConversion;
  rangos: RangoEquivalencia[];
  conceptos: ConceptoEquivalencia[];
  estado: 'activo' | 'inactivo';
}

export type EscalaExternaInput = Omit<EscalaExterna, '_id' | 'estado'>;

export function useTraslados(anioId: string | undefined, search: string) {
  return useQuery({
    queryKey: ['traslados', anioId, search],
    queryFn: () => api.get<FilaTraslado[]>('/traslados', { academic_year_id: anioId, search }),
    enabled: Boolean(anioId),
  });
}

export function useMatriculasParaTraslado(anioId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['traslados', 'matriculas-disponibles', anioId],
    queryFn: () => api.get<MatriculaDisponible[]>('/traslados/matriculas-disponibles', { academic_year_id: anioId }),
    enabled: Boolean(anioId) && enabled,
  });
}

export function useDetalleTraslado(id: string | null) {
  return useQuery({
    queryKey: ['traslados', 'detalle', id],
    queryFn: () => api.get<DetalleTraslado>(`/traslados/${id}`),
    enabled: Boolean(id),
  });
}

function useInvalidarTraslados() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['traslados'] });
    // Lo homologado cambia el boletín, la planilla (quién se califica) y las recuperaciones.
    void queryClient.invalidateQueries({ queryKey: ['report-card'] });
    void queryClient.invalidateQueries({ queryKey: ['notas'] });
  };
}

export function useCrearTraslado() {
  const invalidar = useInvalidarTraslados();
  return useMutation({
    mutationFn: (input: TrasladoInput & { enrollment_id: string }) => api.post<DetalleTraslado>('/traslados', input),
    onSuccess: invalidar,
  });
}

export function useActualizarTraslado() {
  const invalidar = useInvalidarTraslados();
  return useMutation({
    mutationFn: ({ id, ...input }: TrasladoInput & { id: string }) => api.put<DetalleTraslado>(`/traslados/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useVistaPreviaHomologacion() {
  return useMutation({
    mutationFn: ({ id, filas }: { id: string; filas: FilaHomologacionInput[] }) =>
      api.post<VistaPreviaHomologacion>(`/traslados/${id}/homologacion/vista-previa`, { filas }),
  });
}

export function useGuardarHomologacion() {
  const invalidar = useInvalidarTraslados();
  return useMutation({
    mutationFn: ({ id, ...cuerpo }: { id: string; filas: FilaHomologacionInput[]; motivo_cambio?: string }) =>
      api.put<DetalleTraslado>(`/traslados/${id}/homologacion`, cuerpo),
    onSuccess: invalidar,
  });
}

export function useCargarSoporteTraslado() {
  const invalidar = useInvalidarTraslados();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<DetalleTraslado>(`/traslados/${id}/soportes`, form);
    },
    onSuccess: invalidar,
  });
}

export function useQuitarSoporteTraslado() {
  const invalidar = useInvalidarTraslados();
  return useMutation({
    mutationFn: ({ id, soporteId }: { id: string; soporteId: string }) => api.delete(`/traslados/${id}/soportes/${soporteId}`),
    onSuccess: invalidar,
  });
}

/** El soporte se baja con sesión (nunca por URL directa). */
export async function abrirSoporteTraslado(id: string, soporteId: string): Promise<void> {
  const { url } = await api.downloadBlob(`/traslados/${id}/soportes/${soporteId}`);
  window.open(url, '_blank');
}

// --- Escalas de otras instituciones (configuración institucional) ---

export function useEscalasExternas(soloActivas = false) {
  return useQuery({
    queryKey: ['escalas-externas', soloActivas],
    queryFn: () => api.get<EscalaExterna[]>('/traslados/escalas', { solo_activas: soloActivas ? 'true' : undefined }),
  });
}

function useInvalidarEscalas() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['escalas-externas'] });
}

export function useGuardarEscalaExterna() {
  const invalidar = useInvalidarEscalas();
  return useMutation({
    mutationFn: ({ id, ...input }: EscalaExternaInput & { id?: string }) =>
      id ? api.put<EscalaExterna>(`/traslados/escalas/${id}`, input) : api.post<EscalaExterna>('/traslados/escalas', input),
    onSuccess: invalidar,
  });
}

export function useEstadoEscalaExterna() {
  const invalidar = useInvalidarEscalas();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: 'activo' | 'inactivo' }) => api.patch(`/traslados/escalas/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarEscalaExterna() {
  const invalidar = useInvalidarEscalas();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/traslados/escalas/${id}`),
    onSuccess: invalidar,
  });
}
