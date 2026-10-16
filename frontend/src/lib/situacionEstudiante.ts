import type { Tone } from '../components/ui/Badge';
import type { SituacionEstudiante, SituacionEstudianteMatricula } from '../types/domain';

export const ETIQUETA_SITUACION: Record<SituacionEstudiante, { texto: string; tone: Tone }> = {
  DISPONIBLE: { texto: 'Disponible', tone: 'green' },
  MATRICULADO: { texto: 'Matriculado', tone: 'blue' },
  REINGRESO: { texto: 'Reingreso', tone: 'orange' },
  GRADUADO: { texto: 'Graduado', tone: 'neutral' },
  USUARIO_INACTIVO: { texto: 'Usuario inactivo', tone: 'red' },
};

export type FiltroEstudiante = 'DISPONIBLES' | 'MATRICULADOS' | 'REINGRESO' | 'TODOS';

const SITUACIONES_DEL_FILTRO: Record<Exclude<FiltroEstudiante, 'TODOS'>, SituacionEstudiante> = {
  DISPONIBLES: 'DISPONIBLE',
  MATRICULADOS: 'MATRICULADO',
  REINGRESO: 'REINGRESO',
};

export function estudiantesDelFiltro(lista: SituacionEstudianteMatricula[], filtro: FiltroEstudiante): SituacionEstudianteMatricula[] {
  return filtro === 'TODOS' ? lista : lista.filter((e) => e.situacion === SITUACIONES_DEL_FILTRO[filtro]);
}

/** Estas situaciones no admiten una matrícula nueva desde el formulario. */
export function admiteMatricula(situacion: SituacionEstudiante): boolean {
  return situacion === 'DISPONIBLE' || situacion === 'REINGRESO';
}
