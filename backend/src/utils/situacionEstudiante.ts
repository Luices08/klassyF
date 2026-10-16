import { EstadoEstudiante } from '../constants/enums';

export const SITUACIONES_ESTUDIANTE = ['DISPONIBLE', 'MATRICULADO', 'REINGRESO', 'GRADUADO', 'USUARIO_INACTIVO'] as const;
export type SituacionEstudiante = (typeof SITUACIONES_ESTUDIANTE)[number];

/** Estados del expediente (M03) con los que un estudiante solo vuelve por un reingreso explícito. */
export const ESTADOS_QUE_EXIGEN_REINGRESO: EstadoEstudiante[] = ['RETIRADO', 'INACTIVO'];

/**
 * Dónde está un estudiante frente a la matrícula del año. La matrícula viva manda sobre el estado del expediente
 * (un retirado que ya reingresó figura matriculado); sin perfil se asume ACTIVO, como el default del modelo.
 */
export function situacionDeEstudiante(datos: { tieneMatriculaViva: boolean; estadoPerfil?: EstadoEstudiante; usuarioActivo: boolean }): SituacionEstudiante {
  if (datos.tieneMatriculaViva) return 'MATRICULADO';
  if (datos.estadoPerfil === 'GRADUADO') return 'GRADUADO';
  if (!datos.usuarioActivo) return 'USUARIO_INACTIVO';
  if (datos.estadoPerfil && ESTADOS_QUE_EXIGEN_REINGRESO.includes(datos.estadoPerfil)) return 'REINGRESO';
  return 'DISPONIBLE';
}
