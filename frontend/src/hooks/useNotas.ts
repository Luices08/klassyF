import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TipoActividad } from '../lib/actividades';
import { api } from '../lib/apiClient';
import type { EscalaPlanilla } from '../lib/calculoNotas';
import type { Desempeno } from '../types/reportCard';
import type { ContextoAsignacion, EstadoActividadEstudiante } from './useActividades';

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
  /** Nota de cada casilla (null = aún no tiene), por id de casilla. */
  notas: Record<string, number | null>;
  /** Solo de las actividades con entrega digital: si el estudiante entregó, si llegó tarde y si trae archivo. */
  entregas: Record<string, { estado: EstadoActividadEstudiante; tiene_archivo: boolean }>;
  /** Nota de cada bloque (promedio ponderado de sus casillas), por clave de bloque. */
  bloques: Record<string, number | null>;
  nota_asignatura: number | null;
  parcial: boolean;
  desempeno: Desempeno | null;
  faltantes: string[];
}

/** Una casilla: una actividad de M11 o una nota suelta que crea el docente. */
export interface CasillaPlanilla {
  id: string;
  tipo: 'ACTIVIDAD' | 'MANUAL';
  titulo: string;
  /** El % del bloque que puso el docente; null = automático. */
  peso: number | null;
  /** Lo que realmente pesa dentro del bloque (el puesto o el reparto de lo que queda). */
  peso_efectivo: number;
  tipo_actividad: TipoActividad | null;
  fecha_entrega: string | null;
  requiere_entrega: boolean;
}

export interface BloquePlanilla {
  clave: string;
  nombre: string;
  porcentaje: number;
  max_casillas: number;
  /** Suma de los pesos que el docente puso en este bloque. */
  pesos_puestos: number;
  casillas: CasillaPlanilla[];
}

export interface PlantillaPlanilla {
  titulo: string;
  subtitulo: string;
  pie: string;
  mostrar_logo: boolean;
  columnas: { documento: boolean; promedios_componente: boolean; pesos: boolean; desempeno: boolean; estado: boolean };
  firmas: Array<{ cargo: string; nombre: string; usa_docente: boolean }>;
}

export interface Planilla {
  /** Cómo se rotula y qué columnas calculadas lleva (plantilla del colegio, M21): no cambia ninguna nota. */
  plantilla: PlantillaPlanilla;
  asignacion: ContextoAsignacion | null;
  periodo: { numero: number; nombre: string; estado: string };
  escala: EscalaPlanilla;
  /** El molde del colegio aplicado a esta clase: cada bloque con sus casillas. */
  bloques: BloquePlanilla[];
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
  /** El id de una actividad de M11 o de una nota suelta de la planilla. */
  casilla_id: string;
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
  casillas_creadas: number;
  casillas_renombradas: number;
  pesos_actualizados: number;
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

// --- Casillas y pesos: lo que el docente arma dentro del molde del colegio ---

export function useCasillasMutaciones() {
  const invalidar = useInvalidarNotas();
  const referencia = (teacherAssignmentId: string, periodoNumero: number) => ({ teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero });
  return {
    crear: useMutation({
      mutationFn: (input: { teacherAssignmentId: string; periodoNumero: number; bloqueClave: string; nombre: string; peso?: number | null }) =>
        api.post<{ _id: string }>('/notas/columnas', {
          ...referencia(input.teacherAssignmentId, input.periodoNumero),
          bloque_clave: input.bloqueClave,
          nombre: input.nombre,
          peso: input.peso ?? null,
        }),
      onSuccess: invalidar,
    }),
    actualizar: useMutation({
      mutationFn: ({ id, ...cambios }: { id: string; nombre?: string; bloque_clave?: string; peso?: number | null }) => api.patch<{ _id: string }>(`/notas/columnas/${id}`, cambios),
      onSuccess: invalidar,
    }),
    eliminar: useMutation({
      mutationFn: (id: string) => api.delete<unknown>(`/notas/columnas/${id}`),
      onSuccess: invalidar,
    }),
    establecerPesos: useMutation({
      mutationFn: (input: { teacherAssignmentId: string; periodoNumero: number; pesos: Array<{ casilla_id: string; peso: number | null }> }) =>
        api.put<BloquePlanilla[]>('/notas/pesos', { ...referencia(input.teacherAssignmentId, input.periodoNumero), pesos: input.pesos }),
      onSuccess: invalidar,
    }),
  };
}

/** Los bloques de una clase con lo usado y el máximo: para que Actividades y tareas ofrezca solo bloques con lugar. */
export function useBloquesDeClase({ teacherAssignmentId, periodoNumero }: ReferenciaPlanilla) {
  return useQuery({
    queryKey: ['notas', 'bloques', teacherAssignmentId, periodoNumero],
    queryFn: () => api.get<BloquePlanilla[]>('/notas/bloques', { teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero }),
    enabled: Boolean(teacherAssignmentId && periodoNumero),
    staleTime: 15_000,
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

// --- Plantilla de la planilla (M21 mínimo): presentación, la define el administrador ---

export function usePlantillaPlanilla() {
  return useQuery({
    queryKey: ['notas', 'plantilla'],
    queryFn: () => api.get<PlantillaPlanilla>('/notas/plantilla'),
    staleTime: 5 * 60_000,
  });
}

export function useActualizarPlantillaPlanilla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cambios: Partial<Omit<PlantillaPlanilla, 'columnas'>> & { columnas?: Partial<PlantillaPlanilla['columnas']> }) =>
      api.put<PlantillaPlanilla>('/notas/plantilla', cambios),
    // La plantilla viaja dentro de cada planilla: se refrescan todas.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notas'] }),
  });
}

/** El PDF para imprimir y firmar: se baja con la sesión, nunca por URL directa. */
export async function descargarPdfPlanilla(teacherAssignmentId: string, periodoNumero: number, nombreArchivo: string): Promise<void> {
  const { url } = await api.downloadBlob(`/notas/planilla/pdf?teacher_assignment_id=${teacherAssignmentId}&periodo_numero=${periodoNumero}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

// --- Vista previa del molde (administración): la planilla de muestra tal como la recibirá el docente ---

export function useVistaPreviaMolde(academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['notas', 'molde-vista-previa', academicYearId],
    queryFn: () => api.get<Planilla>('/notas/molde/vista-previa', { academic_year_id: academicYearId }),
    enabled: Boolean(academicYearId),
    // El molde y la plantilla de impresión se editan en otras pestañas: siempre se vuelve a pedir al abrir la vista previa.
    staleTime: 0,
  });
}

export async function descargarExcelDeMuestra(academicYearId: string): Promise<void> {
  const { url } = await api.downloadBlob(`/notas/molde/excel?academic_year_id=${academicYearId}`);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'muestra-planilla-de-notas.xlsx';
  enlace.click();
  URL.revokeObjectURL(url);
}

// --- Notas del propio estudiante ---

export interface CasillaDeMisNotas {
  id: string;
  titulo: string;
  tipo: 'ACTIVIDAD' | 'MANUAL';
  tipo_actividad: TipoActividad | null;
  fecha_entrega: string | null;
  /** Lo que realmente pesa dentro de su bloque (%). */
  peso_efectivo: number;
  nota: number | null;
  /** Solo actividades con entrega digital. */
  entrega: EstadoActividadEstudiante | null;
}

export interface BloqueDeMisNotas {
  clave: string;
  nombre: string;
  porcentaje: number;
  nota: number | null;
  casillas: CasillaDeMisNotas[];
}

export interface AsignaturaDeMisNotas {
  teacher_assignment_id: string;
  asignacion: ContextoAsignacion | null;
  estado: EstadoNota;
  nota_asignatura: number | null;
  /** La nota se calculó con lo que hay: todavía faltan notas. */
  parcial: boolean;
  desempeno: Desempeno | null;
  bloques: BloqueDeMisNotas[];
}

export interface MisNotas {
  periodo: { numero: number; nombre: string; estado: string };
  nota_aprobatoria: number;
  asignaturas: AsignaturaDeMisNotas[];
}

export function useMisNotas(periodoNumero: number | undefined, academicYearId?: string) {
  return useQuery({
    queryKey: ['notas', 'mias', academicYearId ?? null, periodoNumero],
    queryFn: () => api.get<MisNotas>('/notas/mias', { periodo_numero: periodoNumero, academic_year_id: academicYearId }),
    enabled: Boolean(periodoNumero),
    staleTime: 15_000,
  });
}
