/**
 * Fuente unica de verdad para los enums usados por modelos y validadores.
 * Evita que las mismas listas de valores queden duplicadas (y se desincronicen)
 * entre schemas de Mongoose y schemas de Joi. Los arrays `as const` derivan
 * union types literales que se usan en todo el proyecto (IUser['rol'], etc).
 */

// RC (Registro Civil) se conserva para estudiantes menores de edad aunque el
// catalogo de M02 solo pida CC/CE/TI/PEP/PPT; PEP/PPT cubren poblacion migrante.
// NES (Numero Establecido por la Secretaria) lo agrega M03 para estudiantes sin
// documento oficial todavia.
export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC', 'PEP', 'PPT', 'NES'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

// Un solo rol administrativo (ADMIN): Klassy es de una institucion por
// instalacion (ver CLAUDE.md), asi que no hay un nivel "super" por encima del
// admin de la institucion — ADMIN ya tiene el maximo privilegio del sistema.
export const ROLES = ['ADMIN', 'COORDINADOR', 'COORDINADOR_CONVIVENCIA', 'ORIENTADOR', 'DOCENTE', 'SECRETARIA', 'ESTUDIANTE', 'ACUDIENTE'] as const;
export type Rol = (typeof ROLES)[number];

// Estado activo/inactivo generico, reusado por User, Campus, Grade e Institution
// (misma pareja de valores en las cuatro entidades, no se duplica el array).
export const ESTADOS_USUARIO = ['activo', 'inactivo'] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];

export const CALENDARIOS = ['A', 'B'] as const;
export type Calendario = (typeof CALENDARIOS)[number];

// M05: EN_CURSO es la vigencia activa (solo una por institucion); CERRADO es el
// historico de solo lectura. PLANIFICACION es un año creado pero aun no activado.
export const ESTADOS_ANIO_LECTIVO = ['PLANIFICACION', 'EN_CURSO', 'CERRADO'] as const;
export type EstadoAnioLectivo = (typeof ESTADOS_ANIO_LECTIVO)[number];

// Abierto/cerrado simple: lo usa PeriodLock (cierre de un periodo para un grupo).
export const ESTADOS_PERIODO = ['ABIERTO', 'CERRADO'] as const;
export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number];

// M05: semaforo del periodo academico del año lectivo (CU-CRD-05).
export const ESTADOS_PERIODO_ACADEMICO = ['PROGRAMADO', 'ABIERTO', 'EN_DIGITACION', 'CERRADO'] as const;
export type EstadoPeriodoAcademico = (typeof ESTADOS_PERIODO_ACADEMICO)[number];

// M05: eventos del calendario que no son clase regular. Los tres primeros son
// tiempo no lectivo (sin asistencia de estudiantes); las recuperaciones son
// ventanas de refuerzo (M18) y no interrumpen el calendario de asistencia.
export const TIPOS_EVENTO_CALENDARIO = [
  'RECESO',
  'VACACIONES',
  'DESARROLLO_INSTITUCIONAL',
  'RECUPERACION_PERIODO',
  'RECUPERACION_FINAL',
] as const;
export type TipoEventoCalendario = (typeof TIPOS_EVENTO_CALENDARIO)[number];

export const TIPOS_EVENTO_NO_LECTIVO: readonly TipoEventoCalendario[] = [
  'RECESO',
  'VACACIONES',
  'DESARROLLO_INSTITUCIONAL',
];

export const NIVELES_EDUCATIVOS = ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'] as const;
export type NivelEducativo = (typeof NIVELES_EDUCATIVOS)[number];

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA', 'SABATINA'] as const;
export type Jornada = (typeof JORNADAS)[number];

// Dias de la semana en formato ISO (1 = lunes ... 7 = domingo): los dias habiles de una jornada se guardan asi.
export const DIAS_SEMANA_ISO = [1, 2, 3, 4, 5, 6, 7] as const;

/** Dias habiles por omision de una jornada nueva: la sabatina, el sabado; las demas, de lunes a viernes. Se puede editar. */
export function diasHabilesPorDefecto(jornada: Jornada): number[] {
  return jornada === 'SABATINA' ? [6] : [1, 2, 3, 4, 5];
}

// Franja de una jornada: bloque de clase o descanso (recreo, almuerzo).
export const TIPOS_FRANJA = ['CLASE', 'DESCANSO'] as const;
export type TipoFranja = (typeof TIPOS_FRANJA)[number];

// M04: maquina de estados formal de la matricula. "Traslado" ya no es un
// estado (se solapaba con MATRICULADO/RETIRADO) sino un TIPO_INGRESO — de
// donde viene el estudiante, no en que estado esta su matricula actual.
export const ESTADOS_MATRICULA = [
  'PREINSCRITO',
  'MATRICULADO_CONDICIONAL',
  'MATRICULADO_DEFINITIVO',
  'RETIRADO',
  'ANULADO',
] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

// La matricula es la lista viva del aula (M12/M13): Notas y Asistencia deben
// filtrar por estos 2 estados, no por 'MATRICULADO' (ya no existe) ni por
// consultar usr_students directo. Un condicional SIGUE yendo a clase.
export const ESTADOS_MATRICULA_ACTIVOS: EstadoMatricula[] = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'];

// Solo una matricula formalizada (estos 2 estados) ocupa un folio del Libro de
// Matricula: un PREINSCRITO que desiste no debe dejar un hueco en el consecutivo.
export const ESTADOS_MATRICULA_CON_FOLIO: EstadoMatricula[] = ESTADOS_MATRICULA_ACTIVOS;

export const TIPOS_INGRESO = ['NUEVO', 'ANTIGUO', 'TRASLADO', 'REPITENTE'] as const;
export type TipoIngreso = (typeof TIPOS_INGRESO)[number];

export const ESTADOS_DOCUMENTO_MATRICULA = ['PENDIENTE', 'CARGADO', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoDocumentoMatricula = (typeof ESTADOS_DOCUMENTO_MATRICULA)[number];

export const TIPOS_DOCUMENTO_MATRICULA = [
  'DOCUMENTO_IDENTIDAD',
  'CERTIFICADO_GRADO_ANTERIOR',
  'FOTO',
  'CARNE_EPS',
  'CARNE_VACUNAS',
] as const;
export type TipoDocumentoMatricula = (typeof TIPOS_DOCUMENTO_MATRICULA)[number];

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type GrupoSanguineo = (typeof GRUPOS_SANGUINEOS)[number];

// Reusado por Area y Subject (catalogo academico de M06): misma pareja
// activo/inactivo, nunca se elimina un area/asignatura por trazabilidad.
export const ESTADOS_AREA = ['activo', 'inactivo'] as const;
export type EstadoArea = (typeof ESTADOS_AREA)[number];

// Tipo de asignatura dentro del catalogo academico (M06).
export const TIPOS_ASIGNATURA = ['OBLIGATORIA', 'OPTATIVA'] as const;
export type TipoAsignatura = (typeof TIPOS_ASIGNATURA)[number];

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

// M07: Banco de Referentes Curriculares Oficiales (MEN / ICFES)
// MATRIZ_ICFES queda reservado en el enum: aun no hay documento fuente para
// sembrarlo (ver analisis M07); DBA, EBC y LINEAMIENTO si tienen banco poblado.
export const TIPOS_REFERENTE = ['DBA', 'EBC', 'MATRIZ_ICFES', 'LINEAMIENTO'] as const;
export type TipoReferente = (typeof TIPOS_REFERENTE)[number];

// M07: grupos de grados oficiales del documento de Estandares Basicos de
// Competencias (EBC) — el MEN los agrupa asi para las 4 areas troncales.
export const GRUPOS_GRADOS_EBC = ['1-3', '4-5', '6-7', '8-9', '10-11'] as const;
export type GrupoGradosEbc = (typeof GRUPOS_GRADOS_EBC)[number];

/** A que grupo de grados EBC pertenece un grado por su numero; null si el grado no tiene EBC propio (ej. Transicion). */
export function grupoGradosDeNumero(numero: number): GrupoGradosEbc | null {
  if (numero >= 1 && numero <= 3) return '1-3';
  if (numero >= 4 && numero <= 5) return '4-5';
  if (numero >= 6 && numero <= 7) return '6-7';
  if (numero >= 8 && numero <= 9) return '8-9';
  if (numero >= 10 && numero <= 11) return '10-11';
  return null;
}

// M08: Tipos de asignación y carga docente (Decreto 1850 / Ley 115)
export const TIPOS_ASIGNACION_DOCENTE = [
  'CLASE',
  'DIRECCION_GRUPO',
  'PROYECTO_TRANSVERSAL',
  'OTRO',
] as const;
export type TipoAsignacionDocente = (typeof TIPOS_ASIGNACION_DOCENTE)[number];

export const COMPONENTES_SIEE = ['COGNITIVO_SABER', 'PROCEDIMENTAL_HACER', 'ACTITUDINAL_SER'] as const;
export type ComponenteSiee = (typeof COMPONENTES_SIEE)[number];

// M32/M05: niveles cualitativos nacionales de desempeño (Decreto 1290 de 2009, art. 5). Los 4
// son obligatorios por ley; la institución ajusta su etiqueta y los cortes numéricos que cada
// uno cubre (CU-ADM-04), pero no agrega ni quita niveles — ver AcademicYear.escala_evaluacion.
export const NIVELES_DESEMPENO = ['BAJO', 'BASICO', 'ALTO', 'SUPERIOR'] as const;
export type NivelDesempeno = (typeof NIVELES_DESEMPENO)[number];

// M13: los estados de asistencia (Presente, Ausencia, Retardo, Excusa...) los define cada institución en
// `AttendanceState`; aquí solo viven los tonos de chip que el frontend ya tiene (no son colores nuevos).
export const TONOS_ESTADO_ASISTENCIA = ['green', 'orange', 'red', 'blue', 'neutral'] as const;
export type TonoEstadoAsistencia = (typeof TONOS_ESTADO_ASISTENCIA)[number];

export const ESTADOS_JUSTIFICACION = ['PENDIENTE', 'APROBADA', 'RECHAZADA'] as const;
export type EstadoJustificacion = (typeof ESTADOS_JUSTIFICACION)[number];

export const ESTADOS_GRUPO = ['ACTIVE', 'CLOSED'] as const;
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number];

// --- M10: Espacios fisicos (aulas, laboratorios, canchas...) ---

export const TIPOS_ESPACIO = [
  'AULA_REGULAR',
  'LABORATORIO',
  'SALA_INFORMATICA',
  'ESPACIO_DEPORTIVO',
  'AUDITORIO',
  'TALLER_TECNICO',
] as const;
export type TipoEspacio = (typeof TIPOS_ESPACIO)[number];

// Disponible: el motor de horarios puede asignarlo. En mantenimiento e inactivo no.
export const ESTADOS_ESPACIO = ['DISPONIBLE', 'EN_MANTENIMIENTO', 'INACTIVO'] as const;
export type EstadoEspacio = (typeof ESTADOS_ESPACIO)[number];

// Checklist de dotacion. La cantidad de computadores va aparte (computadores_operativos).
export const RECURSOS_ESPACIO = ['VIDEO_BEAM_TV', 'CLIMATIZACION', 'INTERNET', 'RED_CABLEADA', 'LAVAMANOS_GAS'] as const;
export type RecursoEspacio = (typeof RECURSOS_ESPACIO)[number];

// Modalidad de la institucion. Una institucion VIRTUAL no tiene aulas ni espacios fisicos: M10 (espacios) se apaga
// por completo y los grupos no llevan aula. PRESENCIAL (por defecto) los habilita; ahi el aula sigue siendo opcional.
export const MODALIDADES_INSTITUCION = ['PRESENCIAL', 'VIRTUAL'] as const;
export type ModalidadInstitucion = (typeof MODALIDADES_INSTITUCION)[number];

// Que hacer cuando el cupo de un grupo excede el aforo del aula elegida. Es una regla que cada
// institucion decide (no se quema en codigo): BLOQUEAR impide crear el grupo; ADVERTIR lo permite y deja auditoria.
export const POLITICAS_AFORO_AULA = ['BLOQUEAR', 'ADVERTIR'] as const;
export type PoliticaAforoAula = (typeof POLITICAS_AFORO_AULA)[number];

// --- M03: Expediente y hoja de vida del estudiante ---

export const GENEROS = ['M', 'F', 'OTRO'] as const;
export type Genero = (typeof GENEROS)[number];

export const REGIMENES_SALUD = ['CONTRIBUTIVO', 'SUBSIDIADO', 'EXCEPCION', 'NO_ASEGURADO'] as const;
export type RegimenSalud = (typeof REGIMENES_SALUD)[number];

export const GRUPOS_ETNICOS = ['NINGUNO', 'INDIGENA', 'AFRODESCENDIENTE', 'ROM', 'RAIZAL', 'PALENQUERO'] as const;
export type GrupoEtnico = (typeof GRUPOS_ETNICOS)[number];

// Estado propio del expediente del estudiante (no el ESTADOS_USUARIO compartido:
// aqui hacen falta Retirado y Graduado, que no aplican a Sede/Grado/Institucion).
export const ESTADOS_ESTUDIANTE = ['ACTIVO', 'INACTIVO', 'RETIRADO', 'GRADUADO'] as const;
export type EstadoEstudiante = (typeof ESTADOS_ESTUDIANTE)[number];

export const PARENTESCOS = [
  'PADRE',
  'MADRE',
  'ABUELO',
  'ABUELA',
  'TIO',
  'TIA',
  'HERMANO',
  'HERMANA',
  'TUTOR_LEGAL',
  'OTRO',
] as const;
export type Parentesco = (typeof PARENTESCOS)[number];
