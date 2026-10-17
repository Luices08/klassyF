import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /titulacion) ---

export type EstadoTitulacion = 'APROBO_NO_GRADUADO' | 'GRADUADO' | 'GRADUADO_EXTEMPORANEO';
export type RequisitoTitulacion = 'SERVICIO_SOCIAL' | 'SABER_11' | 'PAZ_Y_SALVO' | 'CARPETA_ACADEMICA';

export const NOMBRES_ESTADO_TITULACION: Record<EstadoTitulacion, string> = {
  APROBO_NO_GRADUADO: 'Aprobó, no graduado',
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
  horas_requeridas: number | null;
  saber_11: { codigo_registro: string; fecha_presentacion: string | null } | null;
  paz_y_salvo_confirmado: boolean;
  grados_sin_certificado: number[];
  pendientes: PendienteTitulacion[];
  alertas: PendienteTitulacion[];
  titulaciones: Array<{ academic_year_id: string; titulo: string; estado: EstadoTitulacion; pendientes: PendienteTitulacion[] }>;
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

export const useRegistrarServicioSocial = () =>
  useMutacionTitulacion((input: { student_id: string; horas: number; entidad: string; descripcion?: string; fecha_inicio?: string | null; fecha_fin?: string | null }) => api.post('/titulacion/servicio-social', input));

export const useRegistrarSaber11 = () =>
  useMutacionTitulacion((input: { student_id: string; codigo_registro: string; fecha_presentacion?: string | null }) => {
    const { student_id, ...cuerpo } = input;
    return api.put(`/titulacion/saber-11/${student_id}`, cuerpo);
  });

export const useRegistrarCertificadoExterno = () =>
  useMutacionTitulacion((input: { student_id: string; grado_numero: number; institucion_origen: string; anio?: number | null }) => api.post('/titulacion/carpeta', input));

export const useReevaluarTitulacion = () => useMutacionTitulacion((input: { student_id: string; academic_year_id: string }) => api.post('/titulacion/reevaluar', input));
