import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { PoliticaCupoSalida } from '../types/domain';

export type TipoSalida = 'RETIRO' | 'TRASLADO';
export type EstadoPazYSalvoSalida = 'PENDIENTE' | 'BLOQUEADO' | 'APROBADO';
export type AccionPazYSalvoSalida = 'APERTURA' | 'APROBACION' | 'BLOQUEO' | 'EXCEPCION' | 'ANULACION';

export const TIPOS_SALIDA: TipoSalida[] = ['RETIRO', 'TRASLADO'];
export const NOMBRES_TIPO_SALIDA: Record<TipoSalida, string> = {
  RETIRO: 'Retiro',
  TRASLADO: 'Traslado a otra institución',
};
export const NOMBRES_ESTADO_PAZ_Y_SALVO_SALIDA: Record<EstadoPazYSalvoSalida, string> = {
  PENDIENTE: 'Pendiente',
  BLOQUEADO: 'Bloqueado por deuda o material',
  APROBADO: 'Aprobado',
};
export const NOMBRES_POLITICA_CUPO_SALIDA: Record<PoliticaCupoSalida, string> = {
  INMEDIATA: 'Liberar el cupo al registrar la salida',
  AL_APROBAR_PAZ_Y_SALVO: 'Liberar el cupo cuando el paz y salvo quede aprobado',
};
export const NOMBRES_ACCION_PAZ_Y_SALVO_SALIDA: Record<AccionPazYSalvoSalida, string> = {
  APERTURA: 'Apertura',
  APROBACION: 'Aprobación',
  BLOQUEO: 'Bloqueo',
  EXCEPCION: 'Excepción autorizada',
  ANULACION: 'Aprobación anulada',
};

/** Espejo de las constantes de backend/constants/salidas.ts. */
export const MIN_LONGITUD_MOTIVO_SALIDA = 5;
export const MAX_LONGITUD_MOTIVO_SALIDA = 500;
export const MAX_LONGITUD_OBSERVACION_SALIDA = 1000;
export const MAX_BYTES_SOPORTE_SALIDA = 5 * 1024 * 1024;

export interface EstudianteResumenSalida {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface FilaSalida {
  enrollment_id: string;
  estudiante: EstudianteResumenSalida;
  grupo: string;
  sede: string;
  tipo: TipoSalida;
  /** null: salida anterior a este módulo (solo se sabía el motivo). */
  fecha_efectiva: string | null;
  motivo: string;
  institucion_receptora: string;
  estado_paz_y_salvo: EstadoPazYSalvoSalida;
  dependencias_pendientes: number;
  cupo_liberado: boolean;
  soportes: number;
  legado: boolean;
}

export interface MatriculaParaSalida {
  enrollment_id: string;
  estudiante: EstudianteResumenSalida;
  grupo: string;
  estado: string;
  folio: string | null;
}

export interface FiltrosSalidas {
  tipo?: TipoSalida;
  estado_paz_y_salvo?: EstadoPazYSalvoSalida;
  search?: string;
}

export interface SoporteSalida {
  _id: string;
  nombre: string;
  mimetype: string;
  tamano: number;
  fecha: string;
}

export interface HistorialDependencia {
  accion: AccionPazYSalvoSalida;
  estado_resultante: EstadoPazYSalvoSalida;
  por: string | null;
  fecha: string;
  motivo: string;
}

export interface DependenciaPazYSalvo {
  clave: string;
  nombre: string;
  estado: EstadoPazYSalvoSalida;
  detalle: string;
  excepcion: { autorizada_por: string; fecha: string; motivo: string } | null;
  revisado_por: string | null;
  fecha_revision: string | null;
  historial: HistorialDependencia[];
}

export interface PazYSalvoSalida {
  estado: EstadoPazYSalvoSalida;
  /** Sin dependencias activas al registrar la salida no hubo nada que verificar. */
  sin_dependencias: boolean;
  dependencias: DependenciaPazYSalvo[];
}

export interface DetalleSalida {
  enrollment_id: string;
  estado_matricula: string;
  estudiante: EstudianteResumenSalida;
  anio: { _id: string; year: number; estado: string };
  grupo: { nombre: string; sede: string; jornada: string };
  libro: { folio: string | null; numero_libro: number | null; numero_folio: number | null; tipo_ingreso: string; fecha_matricula: string };
  salida: {
    tipo: TipoSalida;
    nombre_tipo: string;
    fecha_efectiva: string;
    motivo: string;
    observaciones: string;
    institucion_receptora: { nombre: string; codigo_dane: string; municipio: string } | null;
    registrado_por: string;
    fecha_registro: string;
    cupo_liberado: boolean;
    fecha_cupo_liberado: string | null;
    soportes: SoporteSalida[];
  } | null;
  legado: boolean;
  motivo_legado: string | null;
  politica_cupo: PoliticaCupoSalida;
  paz_y_salvo: PazYSalvoSalida;
  trayectoria: Array<{ grupo: string; desde: string; hasta: string | null }>;
  conservado: { notas_asignatura: number; registros_asistencia: number; entregas: number; asistencia_posterior_a_la_salida: number };
  faltantes: string[];
}

export interface SalidaInput {
  enrollment_id: string;
  tipo: TipoSalida;
  fecha_efectiva?: string;
  motivo: string;
  observaciones?: string;
  institucion_receptora?: { nombre: string; codigo_dane?: string; municipio?: string } | null;
}

export type EstadoNotaRetiro = 'CERRADO' | 'DEFINITIVO' | 'HOMOLOGADA_EXTERNA' | 'EXENTA_POR_TRASLADO' | 'SIN_CERRAR';

export interface BoletinRetiro {
  enrollment_id: string;
  estudiante: { nombre_completo: string; documento: string; grado: string; grupo: string };
  salida: { tipo: TipoSalida; nombre_tipo: string; fecha_efectiva: string; institucion_receptora: string | null };
  periodos: Array<{ numero: number; nombre: string; porcentaje: number; completo: boolean; promedio: number | null }>;
  periodo_corte: { numero: number; nombre: string } | null;
  asignaturas: Array<{
    subject_id: string;
    area: string;
    nombre: string;
    notas: Array<{ periodo: number; nota: number | null; estado: EstadoNotaRetiro }>;
    acumulado: number | null;
    desempeno_acumulado: string | null;
    corte: { nota: number | null; parcial: boolean } | null;
  }>;
  promedio_acumulado: number | null;
  advertencias: string[];
  completo: boolean;
}

export function useSalidas(anioId: string | undefined, filtros: FiltrosSalidas) {
  return useQuery({
    queryKey: ['salidas', anioId, filtros],
    queryFn: () => api.get<FilaSalida[]>('/salidas', { academic_year_id: anioId, ...filtros }),
    enabled: Boolean(anioId),
  });
}

export function useMatriculasParaSalida(anioId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['salidas', 'matriculas-disponibles', anioId],
    queryFn: () => api.get<MatriculaParaSalida[]>('/salidas/matriculas-disponibles', { academic_year_id: anioId }),
    enabled: Boolean(anioId) && enabled,
  });
}

export function useDetalleSalida(enrollmentId: string | null) {
  return useQuery({
    queryKey: ['salidas', 'detalle', enrollmentId],
    queryFn: () => api.get<DetalleSalida>(`/salidas/${enrollmentId}`),
    enabled: Boolean(enrollmentId),
  });
}

export function useBoletinRetiro(enrollmentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['salidas', 'boletin', enrollmentId],
    queryFn: () => api.get<BoletinRetiro>(`/salidas/${enrollmentId}/boletin-parcial`),
    enabled: Boolean(enrollmentId) && enabled,
  });
}

function useInvalidarSalidas() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['salidas'] });
    // La salida cambia la matrícula, los cupos del grupo y quién aparece en las planillas.
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['students'] });
  };
}

export function useRegistrarSalida() {
  const invalidar = useInvalidarSalidas();
  return useMutation({
    mutationFn: (input: SalidaInput) => api.post<DetalleSalida>('/salidas', input),
    onSuccess: invalidar,
  });
}

export function useCargarSoporteSalida() {
  const invalidar = useInvalidarSalidas();
  return useMutation({
    mutationFn: ({ enrollmentId, file }: { enrollmentId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<DetalleSalida>(`/salidas/${enrollmentId}/soportes`, form);
    },
    onSuccess: invalidar,
  });
}

export function useActuarSobreDependencia() {
  const invalidar = useInvalidarSalidas();
  return useMutation({
    mutationFn: ({ enrollmentId, clave, accion, motivo }: { enrollmentId: string; clave: string; accion: Exclude<AccionPazYSalvoSalida, 'APERTURA'>; motivo?: string }) =>
      api.post<PazYSalvoSalida>(`/salidas/${enrollmentId}/paz-y-salvo/${clave}`, { accion, motivo }),
    onSuccess: invalidar,
  });
}

/** El soporte se baja con sesión (nunca por URL directa). */
export async function abrirSoporteSalida(enrollmentId: string, soporteId: string): Promise<void> {
  const { url } = await api.downloadBlob(`/salidas/${enrollmentId}/soportes/${soporteId}`);
  window.open(url, '_blank');
}

export function cargarPdfBoletinRetiro(enrollmentId: string) {
  return api.downloadBlob(`/salidas/${enrollmentId}/boletin-parcial/pdf`);
}
