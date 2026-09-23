/**
 * Fuente unica de verdad para los enums usados por modelos y validadores.
 * Evita que las mismas listas de valores queden duplicadas (y se desincronicen)
 * entre schemas de Mongoose y schemas de Joi. Los arrays `as const` derivan
 * union types literales que se usan en todo el proyecto (IUser['rol'], etc).
 */

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROLES = [
  'SUPERADMIN',
  'RECTOR',
  'COORDINADOR',
  'DOCENTE',
  'SECRETARIA',
  'ESTUDIANTE',
  'ACUDIENTE',
] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS_USUARIO = ['activo', 'inactivo'] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];

export const CALENDARIOS = ['A', 'B'] as const;
export type Calendario = (typeof CALENDARIOS)[number];

export const ESTADOS_ANIO_LECTIVO = ['PLANIFICACION', 'EN_CURSO', 'CERRADO'] as const;
export type EstadoAnioLectivo = (typeof ESTADOS_ANIO_LECTIVO)[number];

export const ESTADOS_PERIODO = ['ABIERTO', 'CERRADO'] as const;
export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number];

export const NIVELES_EDUCATIVOS = ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'] as const;
export type NivelEducativo = (typeof NIVELES_EDUCATIVOS)[number];

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA'] as const;
export type Jornada = (typeof JORNADAS)[number];

export const ESTADOS_MATRICULA = ['PREINSCRITO', 'MATRICULADO', 'RETIRADO', 'TRASLADADO'] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type GrupoSanguineo = (typeof GRUPOS_SANGUINEOS)[number];

export const ESTADOS_AREA = ['activo', 'inactivo'] as const;
export type EstadoArea = (typeof ESTADOS_AREA)[number];

export const ESTADOS_DESARROLLO_CURRICULAR = [
  'BORRADOR',
  'ENVIADO_REVISION',
  'DEVUELTO_OBSERVACIONES',
  'APROBADO',
] as const;
export type EstadoDesarrolloCurricular = (typeof ESTADOS_DESARROLLO_CURRICULAR)[number];

export const COMPONENTES_SIEE = ['COGNITIVO_SABER', 'PROCEDIMENTAL_HACER', 'ACTITUDINAL_SER'] as const;
export type ComponenteSiee = (typeof COMPONENTES_SIEE)[number];

export const ESTADOS_ASISTENCIA = [
  'PRESENTE',
  'FALTA_JUSTIFICADA',
  'FALTA_INJUSTIFICADA',
  'RETARDO',
] as const;
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];

// PeriodLock reutiliza el mismo enum ABIERTO/CERRADO que AcademicYear.periodos.estado
// (ver ESTADOS_PERIODO arriba) para no duplicar la misma pareja de valores dos veces.
