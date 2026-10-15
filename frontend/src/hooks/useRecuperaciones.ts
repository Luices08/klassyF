import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

// --- Tipos (espejo de las respuestas de /recuperaciones) ---

export type MomentoRecuperacion = 'FIN_PERIODO' | 'INICIO_SIGUIENTE_PERIODO';
export type EfectoRecuperacion = 'REEMPLAZA' | 'LIMITA_A_APROBATORIA' | 'PROMEDIA' | 'LA_MAYOR';
export type ModoIntegracion = 'NOTA_FINAL' | 'REEMPLAZA_NOTA_MAS_BAJA' | 'REEMPLAZA_BLOQUE' | 'CASILLA_ADICIONAL';
export type TipoRecuperacion = 'PERIODO' | 'ANUAL';
export type EstadoRecuperacion = 'PENDIENTE' | 'SUPERADA' | 'NO_SUPERADA';

export const NOMBRES_MOMENTO: Record<MomentoRecuperacion, string> = {
  FIN_PERIODO: 'Al finalizar el periodo',
  INICIO_SIGUIENTE_PERIODO: 'Al iniciar el periodo siguiente',
};

export const NOMBRES_EFECTO: Record<EfectoRecuperacion, string> = {
  REEMPLAZA: 'Reemplaza la nota',
  LIMITA_A_APROBATORIA: 'Reemplaza, con tope en la nota aprobatoria',
  PROMEDIA: 'Promedia con la nota original',
  LA_MAYOR: 'Conserva la más alta',
};

export const NOMBRES_MODO_INTEGRACION: Record<ModoIntegracion, string> = {
  NOTA_FINAL: 'Sobre la nota final de la asignatura',
  REEMPLAZA_NOTA_MAS_BAJA: 'Reemplaza la nota más baja',
  REEMPLAZA_BLOQUE: 'Reemplaza la nota de un bloque',
  CASILLA_ADICIONAL: 'Se suma como una nota adicional',
};

export const NOMBRES_ESTADO_RECUPERACION: Record<EstadoRecuperacion, string> = {
  PENDIENTE: 'Pendiente',
  SUPERADA: 'Superada',
  NO_SUPERADA: 'No superada',
};

export interface ReglaPeriodo {
  periodo_numero: number;
  aplica: boolean;
  momento: MomentoRecuperacion;
}

export interface IntegracionRecuperacion {
  modo: ModoIntegracion;
  bloque_clave: string;
  peso: number | null;
  solo_si_mejora: boolean;
  tope_aprobatoria: boolean;
  cuenta_en_boletin: boolean;
}

export interface PoliticaRecuperacion {
  periodos: ReglaPeriodo[];
  periodo: { efecto: EfectoRecuperacion; max_intentos: number; integracion: IntegracionRecuperacion };
  anual: { aplica: boolean; efecto: EfectoRecuperacion; max_intentos: number; max_asignaturas_pendientes: number };
  texto_siee: string;
  /** Solo en la lectura: los bloques del molde de notas del año, donde puede entrar la recuperación. */
  bloques_molde?: Array<{ clave: string; nombre: string; porcentaje: number }>;
}

export interface VentanaRecuperacion {
  abierta: boolean;
  motivo: string | null;
  desde: string | null;
  hasta: string | null;
}

export interface FilaRecuperacion {
  teacher_assignment_id: string;
  group_id: string;
  grupo: string;
  subject_id: string;
  asignatura: string;
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  nota_original: number;
  recuperacion: {
    _id: string;
    intentos: Array<{ _id: string; nota: number; fecha: string; observacion: string }>;
    nota_resultante: number | null;
    efecto_aplicado: EfectoRecuperacion;
    modo_integracion: ModoIntegracion;
    detalle: string;
  } | null;
  estado: EstadoRecuperacion;
  intentos_restantes: number;
  habilitado: boolean;
  motivo_no_habilitado: string | null;
}

export interface ListadoRecuperaciones {
  tipo: TipoRecuperacion;
  periodo_numero: number;
  aplica: boolean;
  motivo_no_aplica: string | null;
  momento: MomentoRecuperacion | null;
  nota_aprobatoria: number;
  ventana: VentanaRecuperacion | null;
  filas: FilaRecuperacion[];
}

export interface FiltrosRecuperaciones {
  academic_year_id?: string;
  tipo: TipoRecuperacion;
  periodo_numero?: number;
  teacher_assignment_id?: string;
  group_id?: string;
}

export interface IntentoInput {
  teacher_assignment_id: string;
  student_id: string;
  tipo: TipoRecuperacion;
  periodo_numero?: number;
  nota: number;
  observacion?: string;
}

// --- Hooks ---

export function usePoliticaRecuperacion(academicYearId?: string) {
  return useQuery({
    queryKey: ['recuperaciones', 'politica', academicYearId ?? null],
    queryFn: () => api.get<PoliticaRecuperacion>(`/recuperaciones/politica/${academicYearId}`),
    enabled: Boolean(academicYearId),
  });
}

export function useActualizarPoliticaRecuperacion(academicYearId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (politica: PoliticaRecuperacion) => api.put<PoliticaRecuperacion>(`/recuperaciones/politica/${academicYearId}`, politica),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recuperaciones'] });
    },
  });
}

export function useCandidatosRecuperacion(filtros: FiltrosRecuperaciones, enabled: boolean) {
  return useQuery({
    queryKey: ['recuperaciones', 'candidatos', filtros],
    queryFn: () => api.get<ListadoRecuperaciones>('/recuperaciones', { ...filtros }),
    enabled: enabled && Boolean(filtros.academic_year_id),
  });
}

export function useRegistrarIntento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IntentoInput) => api.post('/recuperaciones/intentos', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recuperaciones', 'candidatos'] });
    },
  });
}
