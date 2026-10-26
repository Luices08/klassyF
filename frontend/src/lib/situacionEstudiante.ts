import type { Tone } from '../components/ui/Badge';
import type { SituacionEstudiante, SituacionEstudianteMatricula } from '../types/domain';

export const ETIQUETA_SITUACION: Record<SituacionEstudiante, { texto: string; tone: Tone }> = {
  DISPONIBLE: { texto: 'Disponible', tone: 'green' },
  MATRICULADO: { texto: 'Matriculado', tone: 'blue' },
  REINGRESO: { texto: 'Reingreso', tone: 'orange' },
  GRADUADO: { texto: 'Graduado', tone: 'neutral' },
  USUARIO_INACTIVO: { texto: 'Usuario inactivo', tone: 'red' },
};

export type FiltroEstudiante = 'DISPONIBLES' | 'MATRICULADOS' | 'REINGRESO' | 'TODOS' | 'POR_FORMALIZAR' | 'CONTINUARAN';

const SITUACIONES_DEL_FILTRO: Record<Exclude<FiltroEstudiante, 'TODOS' | 'POR_FORMALIZAR' | 'CONTINUARAN'>, SituacionEstudiante> = {
  DISPONIBLES: 'DISPONIBLE',
  MATRICULADOS: 'MATRICULADO',
  REINGRESO: 'REINGRESO',
};

export function estudiantesDelFiltro(lista: SituacionEstudianteMatricula[], filtro: FiltroEstudiante): SituacionEstudianteMatricula[] {
  if (filtro === 'TODOS') return lista;
  if (filtro === 'POR_FORMALIZAR') return lista.filter(estaPorFormalizar);
  // Los antiguos que la familia dijo que continúan y aún no tienen matrícula este año (M04, renovación).
  if (filtro === 'CONTINUARAN') return lista.filter((e) => e.situacion === 'DISPONIBLE' && e.continuidad === 'CONTINUA');
  return lista.filter((e) => e.situacion === SITUACIONES_DEL_FILTRO[filtro]);
}

/** Tiene su matrícula preinscrita (la de una solicitud aprobada o la de la rematrícula): con cupo, sin folio, a la espera de formalizarse. */
export function estaPorFormalizar(e: SituacionEstudianteMatricula): boolean {
  return e.situacion === 'MATRICULADO' && e.matricula?.estado === 'PREINSCRITO';
}

/** Estas situaciones no admiten una matrícula nueva desde el formulario. */
export function admiteMatricula(situacion: SituacionEstudiante): boolean {
  return situacion === 'DISPONIBLE' || situacion === 'REINGRESO';
}
