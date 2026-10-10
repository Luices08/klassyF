import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';
import type { DetalleHorario } from '../types/horarios';
import type { EstadoMatricula, TipoIngreso } from '../types/domain';

// Ficha 360° de un grupo (M01). Todo es de solo lectura: cada dato se modifica en su módulo de origen.

export interface DocenteResumen {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface FichaGrupo {
  grupo: {
    _id: string;
    nomenclatura: string;
    estado: 'ACTIVE' | 'CLOSED';
    max_capacity: number;
    cupos_ocupados: number;
    grado: { _id: string; nombre: string; numero: number; nivel: string } | null;
    jornada: { _id: string; nombre: string; hora_inicio: string; hora_fin: string } | null;
    sede: { _id: string; nombre: string } | null;
    anio: { _id: string; nombre: string; year: number; estado: string } | null;
  };
  usa_espacios: boolean;
  aula: { _id: string; nombre: string; capacidad: number; estado: string; piso_bloque: string | null; excede_aforo: boolean } | null;
  director: { teacher_assignment_id: string | null; docente: DocenteResumen } | null;
  estudiantes: Array<{
    enrollment_id: string;
    estado: EstadoMatricula;
    tipo_ingreso: TipoIngreso;
    estudiante: DocenteResumen;
  }>;
  asignaturas: Array<{
    subject_id: string;
    nombre: string;
    abreviatura: string;
    area: { _id: string; nombre: string } | null;
    horas_semanales: number;
    origen: 'GRADO' | 'GRUPO';
    horas_personalizadas: boolean;
    docente: (DocenteResumen & { teacher_assignment_id: string }) | null;
  }>;
  horas_semanales_total: number;
  horario: { disponible: boolean };
}

export interface HorarioDeGrupo {
  version: { _id: string; numero: number; estado: 'PUBLICADO' | 'BORRADOR' } | null;
  malla: DetalleHorario | null;
  es_borrador: boolean;
}

export function useFichaGrupo(groupId: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'ficha', groupId],
    queryFn: () => api.get<FichaGrupo>(`/groups/${groupId}/ficha`),
    enabled: Boolean(groupId),
    staleTime: 30_000,
  });
}

/** Se pide solo cuando se abre la pestaña: el horario trae el catálogo de la jornada y no hace falta antes. */
export function useHorarioDeGrupo(groupId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['groups', 'ficha', groupId, 'horario'],
    queryFn: () => api.get<HorarioDeGrupo>(`/groups/${groupId}/ficha/horario`),
    enabled: Boolean(groupId) && enabled,
    staleTime: 30_000,
  });
}
