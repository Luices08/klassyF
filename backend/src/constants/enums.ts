/**
 * Fuente unica de verdad para los enums usados por modelos y validadores.
 * Evita que las mismas listas de valores queden duplicadas (y se desincronicen)
 * entre schemas de Mongoose y schemas de Joi. Los arrays `as const` derivan
 * union types literales que se usan en todo el proyecto (IUser['rol'], etc).
 */

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

// Un solo rol administrativo (ADMIN): Klassy es de una institucion por
// instalacion (ver CLAUDE.md), asi que no hay un nivel "super" por encima del
// admin de la institucion — ADMIN ya tiene el maximo privilegio del sistema.
export const ROLES = ['ADMIN', 'COORDINADOR', 'DOCENTE', 'SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const;
export type Rol = (typeof ROLES)[number];

// Estado activo/inactivo generico, reusado por User, Campus, Grade e Institution
// (misma pareja de valores en las cuatro entidades, no se duplica el array).
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

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA', 'SABATINA'] as const;
export type Jornada = (typeof JORNADAS)[number];

export const ESTADOS_MATRICULA = ['PREINSCRITO', 'MATRICULADO', 'RETIRADO', 'TRASLADADO'] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type GrupoSanguineo = (typeof GRUPOS_SANGUINEOS)[number];

// Reusado por Area y Subject (catalogo academico de M06): misma pareja
// activo/inactivo, nunca se elimina un area/asignatura por trazabilidad.
export const ESTADOS_AREA = ['activo', 'inactivo'] as const;
export type EstadoArea = (typeof ESTADOS_AREA)[number];

// Tipo de asignatura dentro del catalogo academico (M06).
export const TIPOS_ASIGNATURA = ['OBLIGATORIA', 'OPTATIVA'] as const;
export type TipoAsignatura = (typeof TIPOS_ASIGNATURA)[number];

// Estados del ciclo de vida de una version del plan de estudios (M06).
export const ESTADOS_VERSION_PLAN = ['EN_PREPARACION', 'PROGRAMADO', 'VIGENTE', 'CERRADO'] as const;
export type EstadoVersionPlan = (typeof ESTADOS_VERSION_PLAN)[number];

// Metodo de calculo del resultado de un area a partir de sus asignaturas (M06).
export const METODOS_CALCULO_EVALUACION = ['PONDERADO', 'ARITMETICO'] as const;
export type MetodoCalculoEvaluacion = (typeof METODOS_CALCULO_EVALUACION)[number];

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

export const ESTADOS_GRUPO = ['ACTIVE', 'CLOSED'] as const;
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number];

// PeriodLock reutiliza el mismo enum ABIERTO/CERRADO que AcademicYear.periodos.estado
// (ver ESTADOS_PERIODO arriba) para no duplicar la misma pareja de valores dos veces.
