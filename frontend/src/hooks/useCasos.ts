import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { EstadoActivo } from '../types/domain';
import type { MedioCitacion, TipoSituacion } from './useObservaciones';

export const ESTADOS_CASO = ['ABIERTO', 'EN_ATENCION', 'EN_MEDIACION', 'EN_SEGUIMIENTO', 'REMITIDO', 'CERRADO', 'REABIERTO', 'ANULADO'] as const;
export type EstadoCaso = (typeof ESTADOS_CASO)[number];
export const NOMBRES_ESTADO_CASO: Record<EstadoCaso, string> = {
  ABIERTO: 'Abierto',
  EN_ATENCION: 'En atención',
  EN_MEDIACION: 'En mediación',
  EN_SEGUIMIENTO: 'En seguimiento',
  REMITIDO: 'Remitido',
  CERRADO: 'Cerrado',
  REABIERTO: 'Reabierto',
  ANULADO: 'Anulado',
};

/** Mismo flujo que el servidor (TRANSICIONES_CASO): solo ofrece lo que el servidor aceptaría; él decide igual. */
export const SIGUIENTES_ESTADOS: Record<EstadoCaso, EstadoCaso[]> = {
  ABIERTO: ['EN_ATENCION', 'REMITIDO'],
  EN_ATENCION: ['EN_MEDIACION', 'EN_SEGUIMIENTO', 'REMITIDO'],
  EN_MEDIACION: ['EN_SEGUIMIENTO', 'REMITIDO'],
  REMITIDO: ['EN_SEGUIMIENTO'],
  EN_SEGUIMIENTO: ['REMITIDO'],
  REABIERTO: ['EN_SEGUIMIENTO'],
  CERRADO: [],
  ANULADO: [],
};
export const CERRABLES: EstadoCaso[] = ['EN_ATENCION', 'EN_MEDIACION', 'EN_SEGUIMIENTO'];

export const RESULTADOS_CIERRE = ['SOLUCIONADO', 'DESESTIMADO', 'REMITIDO', 'MEDIDA_APLICADA'] as const;
export type ResultadoCierre = (typeof RESULTADOS_CIERRE)[number];
export const NOMBRES_RESULTADO: Record<ResultadoCierre, string> = {
  SOLUCIONADO: 'Solucionado',
  DESESTIMADO: 'Desestimado (no se probó)',
  REMITIDO: 'Remitido a otra entidad',
  MEDIDA_APLICADA: 'Medida aplicada',
};

export const ROLES_INVOLUCRADO = ['AFECTADO', 'PRESUNTO_RESPONSABLE', 'TESTIGO', 'REPORTANTE'] as const;
export type RolInvolucrado = (typeof ROLES_INVOLUCRADO)[number];
export const NOMBRES_ROL_INVOLUCRADO: Record<RolInvolucrado, string> = {
  AFECTADO: 'Afectado',
  PRESUNTO_RESPONSABLE: 'Presunto responsable',
  TESTIGO: 'Testigo',
  REPORTANTE: 'Reportante',
};

export const TIPOS_NOTIFICACION = ['ACUDIENTES', 'CITACION', 'DECISION', 'OTRA'] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];
export const NOMBRES_NOTIFICACION: Record<TipoNotificacion, string> = {
  ACUDIENTES: 'Informe a los acudientes',
  CITACION: 'Citación',
  DECISION: 'Notificación de la decisión',
  OTRA: 'Otra',
};

export interface AlertaCaso {
  codigo: 'REMISION_TIPO_III_PENDIENTE' | 'SEGUIMIENTO_VENCIDO';
  mensaje: string;
}

export interface CasoResumen {
  _id: string;
  codigo: string;
  estado: EstadoCaso;
  tipo_situacion: TipoSituacion;
  fecha_hecho: string;
  lugar: string;
  sede_id: string;
  involucrados: { rol: RolInvolucrado; estudiante: string }[];
  alertas: AlertaCaso[];
}

interface ConAutor {
  por_nombre?: string | null;
}

export interface CasoDetalle {
  _id: string;
  codigo: string;
  estado: EstadoCaso;
  tipo_situacion: TipoSituacion;
  origen: 'OBSERVACION' | 'DIRECTO';
  observacion_ids: string[];
  fecha_hecho: string;
  lugar: string;
  hechos: string;
  como_se_conocio: string;
  involucrados: { student_id: string; rol: RolInvolucrado; estudiante: string }[];
  atencion_inmediata: ({ descripcion: string; hubo_dano: boolean; fecha: string } & ConAutor) | null;
  medidas_proteccion: ({ _id: string; descripcion: string; fecha: string } & ConAutor)[];
  pasos: { _id: string; nombre: string; obligatorio: boolean; estado: 'PENDIENTE' | 'CUMPLIDO' | 'NO_APLICA'; nota: string; fecha: string | null }[];
  notificaciones: ({ _id: string; tipo: TipoNotificacion; fecha: string; medio: MedioCitacion; dirigida_a: string; resultado: string } & ConAutor)[];
  descargos: ({ _id: string; parte: 'ESTUDIANTE' | 'ACUDIENTE'; student_id: string | null; fecha: string; texto: string } & ConAutor)[];
  seguimientos: ({ _id: string; fecha: string; nota: string; proxima_fecha: string | null } & ConAutor)[];
  remisiones: ({ _id: string; entidad_nombre: string; fecha: string; oficio: string; funcionario: string; respuesta: string } & ConAutor)[];
  justificacion_sin_remision: string;
  decision: ({ motivacion: string; fecha: string; descriptores: { codigo: string | null; texto: string }[] } & ConAutor) | null;
  medidas_aplicadas: ({ _id: string; nombre: string; dias: number | null; observaciones: string; fecha: string } & ConAutor)[];
  reclasificaciones: ({ de: TipoSituacion; a: TipoSituacion; motivo: string; fecha: string } & ConAutor)[];
  resultado_cierre: ResultadoCierre | null;
  cierre: ({ motivo: string; fecha: string } & ConAutor) | null;
  reaperturas: ({ motivo: string; fecha: string } & ConAutor)[];
  anulacion: ({ motivo: string; fecha: string } & ConAutor) | null;
  alertas: AlertaCaso[];
}

export interface MedidaConvivencia {
  _id: string;
  nombre: string;
  descripcion: string;
  se_aplica_por_dias: boolean;
  orden: number;
  estado: EstadoActivo;
}

export interface EntidadExterna {
  _id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  estado: EstadoActivo;
}

export interface ProtocoloConvivencia {
  _id: string;
  tipo_situacion: TipoSituacion;
  pasos: { nombre: string; obligatorio: boolean; orden: number }[];
}

export interface CatalogosCaso {
  medidas: MedidaConvivencia[];
  entidades: EntidadExterna[];
  protocolos: ProtocoloConvivencia[];
}

function useInvalidarCasos() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['casos'] });
    // Abrir o anular un caso cambia la bandeja de solicitudes y el estado visible en el historial.
    void queryClient.invalidateQueries({ queryKey: ['observaciones'] });
  };
}

// --- Lectura ---

export interface FiltrosCasos {
  estado?: EstadoCaso | '';
  tipo_situacion?: TipoSituacion | '';
  pagina: number;
}

export function useCasos(filtros: FiltrosCasos) {
  return useQuery({
    queryKey: ['casos', 'lista', filtros],
    queryFn: () =>
      api.raw<{ success: true; data: CasoResumen[]; total: number; pagina: number; limite: number }>('/convivencia/casos', {
        query: { estado: filtros.estado || undefined, tipo_situacion: filtros.tipo_situacion || undefined, pagina: filtros.pagina, limite: 20 },
      }),
    select: (res) => ({ data: res.data, total: res.total, pagina: res.pagina, limite: res.limite }),
    placeholderData: keepPreviousData,
  });
}

/** Cada lectura del detalle queda en la auditoría: no se refresca sola al volver a la pestaña. */
export function useCaso(id: string | null) {
  return useQuery({
    queryKey: ['casos', 'detalle', id],
    queryFn: () => api.get<CasoDetalle>(`/convivencia/casos/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
    retry: false,
  });
}

export function useCatalogosCaso(incluirInactivos = false) {
  return useQuery({
    queryKey: ['casos', 'catalogos', { incluirInactivos }],
    queryFn: () => api.get<CatalogosCaso>('/convivencia/catalogos', incluirInactivos ? { incluir_inactivos: 'true' } : {}),
    staleTime: 60_000,
  });
}

// --- Casos ---

export interface AbrirCasoInput {
  tipo_situacion: TipoSituacion;
  fecha_hecho: string;
  lugar?: string;
  hechos: string;
  como_se_conocio?: string;
  involucrados?: { student_id: string; rol: RolInvolucrado }[];
  observacion_id?: string;
}

export function useAbrirCaso() {
  const invalidar = useInvalidarCasos();
  return useMutation({ mutationFn: (input: AbrirCasoInput) => api.post<CasoDetalle>('/convivencia/casos', input), onSuccess: invalidar });
}

function usarAccionDeCaso<T>(ruta: (id: string, entrada: T) => { metodo: 'post' | 'put' | 'patch'; url: string; cuerpo: unknown }) {
  return function useAccion() {
    const invalidar = useInvalidarCasos();
    return useMutation({
      mutationFn: ({ id, ...entrada }: { id: string } & T) => {
        const { metodo, url, cuerpo } = ruta(id, entrada as unknown as T);
        return api[metodo]<CasoDetalle>(url, cuerpo);
      },
      onSuccess: invalidar,
    });
  };
}

export const useCambiarEstadoCaso = usarAccionDeCaso<{ estado: EstadoCaso }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/estado`, cuerpo: e }));
export const useReclasificarCaso = usarAccionDeCaso<{ tipo_situacion: TipoSituacion; motivo: string }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/tipo`, cuerpo: e }));
export const useRegistrarAtencion = usarAccionDeCaso<{ descripcion: string; hubo_dano: boolean }>((id, e) => ({ metodo: 'put', url: `/convivencia/casos/${id}/atencion`, cuerpo: e }));
export const useActualizarPaso = usarAccionDeCaso<{ pasoId: string; estado: 'PENDIENTE' | 'CUMPLIDO' | 'NO_APLICA'; nota?: string }>((id, { pasoId, ...e }) => ({
  metodo: 'patch',
  url: `/convivencia/casos/${id}/pasos/${pasoId}`,
  cuerpo: e,
}));
export const useRegistrarDecision = usarAccionDeCaso<{ motivacion: string; descriptores_ids?: string[] }>((id, e) => ({ metodo: 'put', url: `/convivencia/casos/${id}/decision`, cuerpo: e }));
export const useCerrarCaso = usarAccionDeCaso<{ resultado: ResultadoCierre; motivo: string; justificacion_sin_remision?: string }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/cierre`, cuerpo: e }));
export const useReabrirCaso = usarAccionDeCaso<{ motivo: string }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/reapertura`, cuerpo: e }));
export const useAnularCaso = usarAccionDeCaso<{ motivo: string }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/anulacion`, cuerpo: e }));
export const useDeclararImpedimento = usarAccionDeCaso<{ motivo: string }>((id, e) => ({ metodo: 'post', url: `/convivencia/casos/${id}/impedimento`, cuerpo: e }));

export type ColeccionRegistro = 'seguimientos' | 'notificaciones' | 'descargos' | 'medidas-proteccion' | 'remisiones' | 'medidas-aplicadas';

export function useAgregarRegistroCaso() {
  const invalidar = useInvalidarCasos();
  return useMutation({
    mutationFn: ({ id, coleccion, ...datos }: { id: string; coleccion: ColeccionRegistro } & Record<string, unknown>) =>
      api.post<CasoDetalle>(`/convivencia/casos/${id}/registros/${coleccion}`, datos),
    onSuccess: invalidar,
  });
}

// --- Catálogos del caso ---

export type RecursoCatalogoCaso = 'medidas' | 'entidades';

export function useGuardarCatalogoCaso() {
  const invalidar = useInvalidarCasos();
  return useMutation({
    mutationFn: ({ recurso, id, ...datos }: { recurso: RecursoCatalogoCaso; id?: string } & Record<string, unknown>) =>
      id ? api.patch<unknown>(`/convivencia/${recurso}/${id}`, datos) : api.post<unknown>(`/convivencia/${recurso}`, datos),
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoCatalogoCaso() {
  const invalidar = useInvalidarCasos();
  return useMutation({
    mutationFn: ({ recurso, id, estado }: { recurso: RecursoCatalogoCaso; id: string; estado: EstadoActivo }) =>
      api.patch<unknown>(`/convivencia/${recurso}/${id}/estado`, { estado }),
    onSuccess: invalidar,
  });
}

export function useEliminarCatalogoCaso() {
  const invalidar = useInvalidarCasos();
  return useMutation({
    mutationFn: ({ recurso, id }: { recurso: RecursoCatalogoCaso; id: string }) => api.delete<null>(`/convivencia/${recurso}/${id}`),
    onSuccess: invalidar,
  });
}

export function useGuardarProtocolo() {
  const invalidar = useInvalidarCasos();
  return useMutation({
    mutationFn: ({ tipo, pasos }: { tipo: TipoSituacion; pasos: { nombre: string; obligatorio: boolean }[] }) =>
      api.put<ProtocoloConvivencia>(`/convivencia/protocolos/${tipo}`, { pasos }),
    onSuccess: invalidar,
  });
}
