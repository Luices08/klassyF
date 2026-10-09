import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TipoActividad } from '../lib/actividades';
import { api } from '../lib/apiClient';
import type { EscalaPlanilla } from '../lib/calculoNotas';
import type { OrigenComponente } from '../types/domain';
import type { Desempeno } from '../types/reportCard';
import type { ContextoAsignacion } from './useActividades';

// --- Tipos (espejo de las respuestas de /notas) ---

/**
 * PENDIENTE (faltan notas) y BORRADOR (completa y editable) los fija el sistema solo; CERRADO lo fija el docente y
 * DEFINITIVO, coordinación. Solo lo cerrado llega al boletín.
 */
export type EstadoNota = 'PENDIENTE' | 'BORRADOR' | 'CERRADO' | 'DEFINITIVO';

export const NOMBRES_ESTADO_NOTA: Record<EstadoNota, string> = {
  PENDIENTE: 'Pendiente',
  BORRADOR: 'Borrador',
  CERRADO: 'Cerrado',
  DEFINITIVO: 'Definitivo',
};

export interface FilaPlanilla {
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  estado: EstadoNota;
  notas_actividad: Record<string, number | null>;
  notas_directas: Record<string, number | null>;
  componentes: Record<string, number | null>;
  nota_asignatura: number | null;
  parcial: boolean;
  desempeno: Desempeno | null;
  faltantes: string[];
}

export interface BloquePlanilla {
  clave: string;
  nombre: string;
  porcentaje: number;
  origen: OrigenComponente;
  actividades: Array<{ _id: string; titulo: string; tipo: TipoActividad; peso: number; fecha_entrega: string }>;
}

export interface Planilla {
  asignacion: ContextoAsignacion | null;
  periodo: { numero: number; nombre: string; estado: string };
  escala: EscalaPlanilla;
  componentes: BloquePlanilla[];
  estudiantes: FilaPlanilla[];
  resumen: Record<EstadoNota, number>;
  edicion: {
    puede_editar: boolean;
    motivo: string | null;
    puede_cerrar: boolean;
    puede_reabrir: boolean;
    puede_definitiva: boolean;
  };
}

export interface CeldaPlanilla {
  student_id: string;
  actividad_id?: string;
  componente_clave?: string;
  nota: number;
}

export interface FilaSeguimiento {
  teacher_assignment_id: string;
  asignacion: ContextoAsignacion | null;
  estudiantes: number;
  actividades: number;
  cerradas: number;
  definitivas: number;
  estado: 'ABIERTA' | 'CERRADA' | 'DEFINITIVA';
}

export interface ResultadoDefinitivas {
  definitivas: number;
  omitidas: Array<{ teacher_assignment_id: string; asignatura: string; grupo: string; motivo: string }>;
}

export interface ResultadoImportacionNotas {
  asignatura: string;
  grupo: string;
  periodo: number;
  guardadas: number;
  sin_cambios: number;
}

// --- Consultas ---

export interface ReferenciaPlanilla {
  teacherAssignmentId: string | undefined;
  periodoNumero: number | undefined;
}

export function usePlanilla({ teacherAssignmentId, periodoNumero }: ReferenciaPlanilla) {
  return useQuery({
    queryKey: ['notas', 'planilla', teacherAssignmentId, periodoNumero],
    queryFn: () => api.get<Planilla>('/notas/planilla', { teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero }),
    enabled: Boolean(teacherAssignmentId && periodoNumero),
    staleTime: 15_000,
  });
}

export function useSeguimientoNotas(academicYearId: string | undefined, periodoNumero: number | undefined, groupId?: string) {
  return useQuery({
    queryKey: ['notas', 'seguimiento', academicYearId, periodoNumero, groupId ?? null],
    queryFn: () =>
      api.get<FilaSeguimiento[]>('/notas/seguimiento', { academic_year_id: academicYearId, periodo_numero: periodoNumero, group_id: groupId }),
    enabled: Boolean(academicYearId && periodoNumero),
    staleTime: 15_000,
  });
}

// --- Escritura: todo lo que cambia una nota refresca planillas, seguimiento, actividades y boletín ---

function useInvalidarNotas() {
  const queryClient = useQueryClient();
  return () => {
    for (const clave of ['notas', 'activities', 'report-card']) void queryClient.invalidateQueries({ queryKey: [clave] });
  };
}

export function useGuardarCeldas() {
  const invalidar = useInvalidarNotas();
  return useMutation({
    mutationFn: ({ teacherAssignmentId, periodoNumero, celdas }: { teacherAssignmentId: string; periodoNumero: number; celdas: CeldaPlanilla[] }) =>
      api.put<{ guardadas: number; sin_cambios: number; planilla: Planilla }>('/notas/planilla', {
        teacher_assignment_id: teacherAssignmentId,
        periodo_numero: periodoNumero,
        celdas,
      }),
    onSuccess: invalidar,
  });
}

export function useCerrarPlanilla() {
  const invalidar = useInvalidarNotas();
  return useMutation({
    mutationFn: ({ teacherAssignmentId, periodoNumero }: { teacherAssignmentId: string; periodoNumero: number }) =>
      api.post<Planilla>('/notas/planilla/cerrar', { teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero }),
    onSuccess: invalidar,
  });
}

export function useReabrirPlanilla() {
  const invalidar = useInvalidarNotas();
  return useMutation({
    mutationFn: ({ teacherAssignmentId, periodoNumero, motivo }: { teacherAssignmentId: string; periodoNumero: number; motivo: string }) =>
      api.post<Planilla>('/notas/planilla/reabrir', { teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero, motivo }),
    onSuccess: invalidar,
  });
}

export function useDeclararDefinitivas() {
  const invalidar = useInvalidarNotas();
  return useMutation({
    mutationFn: (input: { academic_year_id: string; periodo_numero: number; group_id?: string; teacher_assignment_id?: string }) =>
      api.post<ResultadoDefinitivas>('/notas/definitivas', input),
    onSuccess: invalidar,
  });
}

// --- Excel offline (M22) ---

export async function descargarExcelNotas(teacherAssignmentId: string, periodoNumero: number, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(`/notas/planilla/excel?teacher_assignment_id=${teacherAssignmentId}&periodo_numero=${periodoNumero}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function useImportarExcelNotas() {
  const invalidar = useInvalidarNotas();
  return useMutation({
    mutationFn: (archivo: File) => {
      const formData = new FormData();
      formData.append('file', archivo);
      return api.upload<ResultadoImportacionNotas>('/notas/planilla/excel', formData);
    },
    onSuccess: invalidar,
  });
}
