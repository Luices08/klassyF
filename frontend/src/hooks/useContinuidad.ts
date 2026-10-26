import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

/** Continuidad de los estudiantes antiguos (M04): la familia o la secretaría dicen si siguen el año siguiente; «continúa» aparta un cupo. */

export type DecisionContinuidad = 'CONTINUA' | 'NO_CONTINUA';
export type EstadoDeContinuidad = DecisionContinuidad | 'SIN_RESPUESTA';

export const NOMBRES_CONTINUIDAD: Record<EstadoDeContinuidad, string> = {
  CONTINUA: 'Continúa',
  NO_CONTINUA: 'No continúa',
  SIN_RESPUESTA: 'Sin respuesta',
};

export interface FilaContinuidad {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  grupo: { id: string; nombre: string };
  grado: string;
  grado_numero: number;
  sede_id: string;
  decision: EstadoDeContinuidad;
  canal: 'SECRETARIA' | 'PORTAL' | null;
  motivo: string;
  fecha: string | null;
  /** El grado donde se aparta el cupo si continúa; null en el último grado. */
  grado_proyectado: string | null;
  /** Ya tiene matrícula en el año siguiente: su respuesta ya no cambia nada. */
  ya_matriculado: boolean;
}

export interface VistaContinuidad {
  origen: { id: string; year: number };
  destino: { id: string; year: number };
  filas: FilaContinuidad[];
  resumen: { total: number; continuan: number; no_continuan: number; sin_respuesta: number };
}

export interface FiltrosContinuidad {
  sede_id?: string;
  grade_id?: string;
  group_id?: string;
  decision?: EstadoDeContinuidad;
}

export function useContinuidad(destinoId: string | undefined, filtros: FiltrosContinuidad) {
  return useQuery({
    queryKey: ['continuidad', destinoId, filtros],
    queryFn: () => api.get<VistaContinuidad>('/continuidad', { destino_id: destinoId, ...filtros }),
    enabled: Boolean(destinoId),
  });
}

/** Cada cambio de respuesta mueve los cupos y la simulación de la rematrícula: se refrescan junto con la lista. */
function useInvalidarContinuidad() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['continuidad'] });
    void queryClient.invalidateQueries({ queryKey: ['admission-requests', 'cupos'] });
    void queryClient.invalidateQueries({ queryKey: ['promocion', 'rollover'] });
  };
}

export function useRegistrarContinuidad(destinoId: string | undefined) {
  const invalidar = useInvalidarContinuidad();
  return useMutation({
    mutationFn: ({ studentId, decision, motivo }: { studentId: string; decision: DecisionContinuidad | null; motivo?: string }) =>
      api.put<{ decision: EstadoDeContinuidad }>(`/continuidad/${studentId}`, { destino_id: destinoId, decision, motivo }),
    onSuccess: invalidar,
  });
}

// --- Portal del acudiente ---

export interface ContinuidadDelHijo {
  anio_destino: { id: string; year: number } | null;
  /** La ventana de prematrícula está abierta y el estudiante aún no tiene matrícula en el año siguiente. */
  puede_responder: boolean;
  decision: EstadoDeContinuidad;
  grado_proyectado: string | null;
  motivo: string;
}

export function useContinuidadDelHijo(studentId: string) {
  return useQuery({
    queryKey: ['portal', studentId, 'continuidad'],
    queryFn: () => api.get<ContinuidadDelHijo>(`/portal/hijos/${studentId}/continuidad`),
    staleTime: 15_000,
  });
}

export function useResponderContinuidadDelHijo(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (respuesta: { decision: DecisionContinuidad; motivo?: string }) => api.put<{ decision: EstadoDeContinuidad }>(`/portal/hijos/${studentId}/continuidad`, respuesta),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', studentId, 'continuidad'] });
    },
  });
}
