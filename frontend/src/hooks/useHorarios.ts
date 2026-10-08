import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type {
  DetalleHorario,
  Horario,
  InsumosHorario,
  MiHorario,
  VistaPdfHorario,
  ResumenHorario,
  SeveridadVariableHorario,
  TipoAlcanceHorario,
  TipoVariableHorario,
  VariableHorario,
} from '../types/horarios';
import type { EstadoActivo } from '../types/domain';

/** Año lectivo + jornada: todo en M09 vive en ese contexto. */
export interface ContextoHorario {
  academic_year_id: string;
  jornada_id: string;
}

const listo = (ctx: Partial<ContextoHorario>): ctx is ContextoHorario => Boolean(ctx.academic_year_id && ctx.jornada_id);
const consulta = (ctx: Partial<ContextoHorario>) => ({ academic_year_id: ctx.academic_year_id, jornada_id: ctx.jornada_id });

export function useVariablesHorario(ctx: Partial<ContextoHorario>) {
  return useQuery({
    queryKey: ['horarios', 'variables', ctx],
    queryFn: () => api.get<VariableHorario[]>('/horarios/variables', consulta(ctx)),
    enabled: listo(ctx),
  });
}

/** Insumos y diagnóstico: cambian con las variables y con la carga de M08, así que no se cachean mucho. */
export function useInsumosHorario(ctx: Partial<ContextoHorario>) {
  return useQuery({
    queryKey: ['horarios', 'insumos', ctx],
    queryFn: () => api.get<InsumosHorario>('/horarios/insumos', consulta(ctx)),
    enabled: listo(ctx),
    staleTime: 0,
  });
}

export function useVersionesHorario(ctx: Partial<ContextoHorario>) {
  return useQuery({
    queryKey: ['horarios', 'versiones', ctx],
    queryFn: () => api.get<ResumenHorario[]>('/horarios', consulta(ctx)),
    enabled: listo(ctx),
    // Mientras una versión se genera en segundo plano, se consulta cada 1,5 s hasta que cambie de estado.
    refetchInterval: (query) => (query.state.data?.some((v) => v.estado === 'GENERANDO') ? 1500 : false),
  });
}

/** El estado va en la llave: cuando una versión termina de generarse, su detalle se pide de nuevo. */
export function useDetalleHorario(id: string | null, estado?: string) {
  return useQuery({
    queryKey: ['horarios', 'detalle', id, estado],
    queryFn: () => api.get<DetalleHorario>(`/horarios/${id}`),
    enabled: Boolean(id),
  });
}

export function useMiHorario() {
  return useQuery({
    queryKey: ['horarios', 'mio'],
    queryFn: () => api.get<MiHorario[]>('/horarios/mio'),
  });
}

export function useEditarSesion() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: ({ horarioId, sesionId, ...cambios }: { horarioId: string; sesionId: string; dia?: number; periodo?: number; fija?: boolean; intercambiar_con?: string }) =>
      api.patch<DetalleHorario>(`/horarios/${horarioId}/sesiones/${sesionId}`, cambios),
    onSuccess: invalidar,
  });
}

/** Descarga con sesión (nunca por URL directa), como los PDF de asistencia. */
export async function descargarPdfHorario(id: string, vista: VistaPdfHorario, entidadId: string | undefined, nombreArchivo: string): Promise<void> {
  const parametros = new URLSearchParams({ vista });
  if (entidadId) parametros.set('entidad_id', entidadId);
  const { url } = await api.downloadBlob(`/horarios/${id}/pdf?${parametros.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export interface VariableHorarioInput {
  tipo: TipoVariableHorario;
  descripcion: string;
  severidad: SeveridadVariableHorario;
  peso: number;
  alcance: { tipo: TipoAlcanceHorario; grade_ids: string[] };
  asignatura_ids: string[];
  docente_ids: string[];
  es_excepcion: boolean;
  parametros: Record<string, unknown>;
}

// Cualquier cambio de variables cambia los insumos (diagnóstico) además de la lista.
function useInvalidarHorarios() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['horarios'] });
  };
}

export function useCrearVariableHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: (input: VariableHorarioInput & ContextoHorario) => api.post<VariableHorario>('/horarios/variables', input),
    onSuccess: invalidar,
  });
}

export function useActualizarVariableHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<VariableHorarioInput> & { id: string; tipo: TipoVariableHorario }) =>
      api.patch<VariableHorario>(`/horarios/variables/${id}`, input),
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoVariableHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoActivo }) => api.patch<VariableHorario>(`/horarios/variables/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarVariableHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/horarios/variables/${id}`),
    onSuccess: invalidar,
  });
}

export function useGenerarHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: (input: ContextoHorario & { nombre?: string; base_horario_id?: string }) => api.post<Horario>('/horarios/generar', input),
    onSuccess: invalidar,
  });
}

export function usePublicarHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: ({ id, confirm_password }: { id: string; confirm_password: string }) =>
      api.post<Horario>(`/horarios/${id}/publicar`, { confirm_password }),
    onSuccess: invalidar,
  });
}

export function useEliminarHorario() {
  const invalidar = useInvalidarHorarios();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/horarios/${id}`),
    onSuccess: invalidar,
  });
}
