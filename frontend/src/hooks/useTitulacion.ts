import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /titulacion) ---

export type EstadoTitulacion = 'APROBO_NO_GRADUADO' | 'GRADUADO' | 'GRADUADO_EXTEMPORANEO';
export type RequisitoTitulacion = 'SERVICIO_SOCIAL' | 'SABER_11' | 'PAZ_Y_SALVO' | 'CARPETA_ACADEMICA';

export const NOMBRES_ESTADO_TITULACION: Record<EstadoTitulacion, string> = {
  APROBO_NO_GRADUADO: 'Pendiente de grado',
  GRADUADO: 'Graduado',
  GRADUADO_EXTEMPORANEO: 'Graduado extemporáneo',
};

export const NOMBRES_REQUISITO: Record<RequisitoTitulacion, string> = {
  SERVICIO_SOCIAL: 'Servicio social estudiantil obligatorio',
  SABER_11: 'Presentación de las pruebas Saber 11',
  PAZ_Y_SALVO: 'Paz y salvo institucional',
  CARPETA_ACADEMICA: 'Carpeta académica completa',
};

export interface PendienteTitulacion {
  requisito: RequisitoTitulacion;
  detalle: string;
}

export interface Titulacion {
  _id: string;
  student_id: { _id: string; nombre: string; apellido: string; numero_documento: string };
  academic_year_id: string;
  group_id: string;
  titulo: string;
  estado: EstadoTitulacion;
  pendientes: PendienteTitulacion[];
  acta: { codigo?: string; libro?: number; folio?: number } | null;
}

export interface RequisitosDeEstudiante {
  estudiante_id: string;
  grado_numero: number | null;
  horas_servicio_social: number;
  /** Horas con soporte aún sin verificar: no cuentan todavía. */
  horas_por_verificar: number;
  horas_requeridas: number | null;
  saber_11: { codigo_registro: string; fecha_presentacion: string | null } | null;
  paz_y_salvo_confirmado: boolean;
  /** Documentos obligatorios del checklist de la matrícula que aún no están aprobados. Solo informa: no bloquea la titulación. */
  documentos_matricula_pendientes: Array<{ nombre: string; estado: string }>;
  pendientes: PendienteTitulacion[];
  alertas: PendienteTitulacion[];
  titulaciones: Array<{ academic_year_id: string; titulo: string; estado: EstadoTitulacion; pendientes: PendienteTitulacion[] }>;
}

export type VerificacionServicioSocial = 'PENDIENTE' | 'VERIFICADO' | 'RECHAZADO' | 'HEREDADO';

export const NOMBRES_VERIFICACION: Record<VerificacionServicioSocial, string> = {
  PENDIENTE: 'Soporte por verificar',
  VERIFICADO: 'Verificado',
  RECHAZADO: 'Soporte rechazado',
  HEREDADO: 'Anterior al soporte',
};

/** Una tanda de horas de servicio social. Nunca trae la ruta del archivo: el soporte se baja por su propio endpoint, con sesión. */
export interface TandaServicioSocial {
  _id: string;
  horas: number;
  entidad: string;
  descripcion: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: 'VIGENTE' | 'ANULADO';
  verificacion: VerificacionServicioSocial;
  tiene_soporte: boolean;
  soporte_nombre: string | null;
  motivo_rechazo: string | null;
  /** Suma para la titulación (vigente y verificada o anterior al soporte). */
  cuenta: boolean;
  createdAt: string;
}

// --- Hooks ---

export function useTitulaciones(anioId: string | undefined, estado?: EstadoTitulacion) {
  return useQuery({
    queryKey: ['titulacion', 'lista', anioId, estado ?? null],
    queryFn: () => api.get<Titulacion[]>('/titulacion', { academic_year_id: anioId, estado }),
    enabled: Boolean(anioId),
  });
}

export function useRequisitosEstudiante(studentId: string | undefined) {
  return useQuery({
    queryKey: ['titulacion', 'requisitos', studentId],
    queryFn: () => api.get<RequisitosDeEstudiante>(`/titulacion/estudiantes/${studentId}/requisitos`),
    enabled: Boolean(studentId),
  });
}

function useMutacionTitulacion<T, R = unknown>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['titulacion'] });
    },
  });
}

export function useServicioSocial(studentId: string | undefined) {
  return useQuery({
    queryKey: ['titulacion', 'servicio-social', studentId],
    queryFn: () => api.get<TandaServicioSocial[]>(`/titulacion/estudiantes/${studentId}/servicio-social`),
    enabled: Boolean(studentId),
  });
}

/** Multipart: los datos de la tanda y el soporte (certificado de la entidad), que es obligatorio. */
export const useRegistrarServicioSocial = () =>
  useMutacionTitulacion((input: { student_id: string; horas: number; entidad: string; descripcion?: string; fecha_inicio?: string | null; fecha_fin?: string | null; archivo: File }) => {
    const datos = new FormData();
    datos.append('student_id', input.student_id);
    datos.append('horas', String(input.horas));
    datos.append('entidad', input.entidad);
    if (input.descripcion) datos.append('descripcion', input.descripcion);
    if (input.fecha_inicio) datos.append('fecha_inicio', input.fecha_inicio);
    if (input.fecha_fin) datos.append('fecha_fin', input.fecha_fin);
    datos.append('file', input.archivo);
    return api.upload('/titulacion/servicio-social', datos);
  });

export const useVerificarServicioSocial = () =>
  useMutacionTitulacion((input: { id: string; decision: 'VERIFICAR' | 'RECHAZAR'; motivo?: string }) => api.post(`/titulacion/servicio-social/${input.id}/verificar`, { decision: input.decision, motivo: input.motivo ?? '' }));

export const useAnularServicioSocial = () => useMutacionTitulacion((input: { id: string; motivo: string }) => api.post(`/titulacion/servicio-social/${input.id}/anular`, { motivo: input.motivo }));

/** El soporte con la sesión del usuario (nunca por URL directa). */
export const descargarSoporteServicioSocial = (id: string) => api.downloadBlob(`/titulacion/servicio-social/${id}/soporte`);

export const useRegistrarSaber11 = () =>
  useMutacionTitulacion((input: { student_id: string; codigo_registro: string; fecha_presentacion?: string | null }) => {
    const { student_id, ...cuerpo } = input;
    return api.put(`/titulacion/saber-11/${student_id}`, cuerpo);
  });


export const useReevaluarTitulacion = () => useMutacionTitulacion((input: { student_id: string; academic_year_id: string }) => api.post('/titulacion/reevaluar', input));
