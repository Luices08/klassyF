import type { Rol } from './api';

export const TIPOS_DOCUMENTO = ['CC', 'TI', 'CE', 'RC', 'PEP', 'PPT', 'NES'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const JORNADAS = ['MANANA', 'TARDE', 'UNICA', 'NOCTURNA', 'SABATINA'] as const;
export type Jornada = (typeof JORNADAS)[number];

export const CALENDARIOS = ['A', 'B'] as const;
export type Calendario = (typeof CALENDARIOS)[number];

export const ESTADOS_MATRICULA = [
  'PREINSCRITO',
  'MATRICULADO_CONDICIONAL',
  'MATRICULADO_DEFINITIVO',
  'RETIRADO',
  'ANULADO',
] as const;
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

export const TIPOS_INGRESO = ['NUEVO', 'ANTIGUO', 'TRASLADO', 'REPITENTE'] as const;
export type TipoIngreso = (typeof TIPOS_INGRESO)[number];

export const ESTADOS_DOCUMENTO_MATRICULA = ['PENDIENTE', 'CARGADO', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoDocumentoMatricula = (typeof ESTADOS_DOCUMENTO_MATRICULA)[number];

/** Los documentos con que se sembró el catálogo. El catálogo real es configurable (`/requisitos-documentales`): la clave de un documento es un texto. */
export const TIPOS_DOCUMENTO_MATRICULA = [
  'DOCUMENTO_IDENTIDAD',
  'FOTO',
  'CARNE_EPS',
  'CARNE_VACUNAS',
  'CERTIFICADO_CRECIMIENTO_DESARROLLO',
  'CERTIFICADO_AUDIOMETRIA_VISION',
  'DOCUMENTO_ACUDIENTE',
  'PAZ_Y_SALVO_SIMAT',
  'CERTIFICADOS_NOTAS_ANTERIORES',
  'CERTIFICADO_QUINTO_PRIMARIA',
  'SERVICIO_SOCIAL_ESTUDIANTIL',
  'CUSTODIA_LEGAL_O_PODER',
  'DIAGNOSTICO_MEDICO_INCLUSION',
  'CERTIFICADO_GRADO_ANTERIOR',
  'PAZ_Y_SALVO_ANIO_ANTERIOR',
  'OTRO_DOCUMENTO',
] as const;
export type TipoDocumentoMatricula = string;

export const NOMBRES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Documento de identidad del estudiante',
  FOTO: 'Foto reciente (3x4)',
  CARNE_EPS: 'Certificado o carné de afiliación a EPS',
  CARNE_VACUNAS: 'Carné de vacunas al día (PAI)',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'Certificado de crecimiento y desarrollo',
  CERTIFICADO_AUDIOMETRIA_VISION: 'Certificado de tamizaje visual y auditivo',
  DOCUMENTO_ACUDIENTE: 'Copia de documento del acudiente',
  PAZ_Y_SALVO_SIMAT: 'Constancia de retiro / liberación de SIMAT y paz y salvo',
  CERTIFICADOS_NOTAS_ANTERIORES: 'Certificados o boletines de notas de años anteriores (un solo PDF)',
  CERTIFICADO_QUINTO_PRIMARIA: 'Certificado o boletín de 5° de básica primaria',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'Constancia de Servicio Social Obligatorio',
  CUSTODIA_LEGAL_O_PODER: 'Custodia legal / patria potestad / poder especial',
  DIAGNOSTICO_MEDICO_INCLUSION: 'Diagnóstico médico / valoración de inclusión (PIAR)',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado o boletín final del grado anterior',
  PAZ_Y_SALVO_ANIO_ANTERIOR: 'Paz y salvo de fin de año (año anterior)',
  OTRO_DOCUMENTO: 'Otro documento institucional',
};

export const INDICACIONES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Registro civil legible (menores de 7 años), Tarjeta de Identidad ampliada al 150% (7 a 17 años) o Cédula (mayores de 18).',
  DOCUMENTO_ACUDIENTE: 'Fotocopia legible de la cédula del padre, madre o tutor legal.',
  FOTO: 'Fotografía reciente 3x4 en fondo blanco.',
  CARNE_EPS: 'Certificado de afiliación vigente o carné de salud (no mayor a 30 días de expedición).',
  CARNE_VACUNAS: 'Esquema completo del Programa Ampliado de Inmunizaciones (PAI) con refuerzo de los 5 años.',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'Control médico reciente emitido por la EPS o médico tratante.',
  CERTIFICADO_AUDIOMETRIA_VISION: 'Examen preventivo de agudeza visual y tamizaje auditivo.',
  CUSTODIA_LEGAL_O_PODER: 'Soporte legal de custodia, sentencia o poder notarial si el acudiente no es padre ni madre (opcional).',

  PAZ_Y_SALVO_SIMAT: 'Constancia oficial de retiro/liberación en SIMAT y paz y salvo expedido por la institución educativa de procedencia.',
  CERTIFICADOS_NOTAS_ANTERIORES:
    'Certificados oficiales de calificaciones o boletines finales de cada uno de los grados cursados a la fecha (en un solo PDF consolidado). Si ingresa por traslado a mitad de año, incluye el boletín con las notas de los periodos cursados este año.',
  CERTIFICADO_QUINTO_PRIMARIA: 'Certificado oficial de culminación o boletín final de aprobación del ciclo de Básica Primaria (5°).',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado oficial final de notas o boletín con constancia de aprobación del grado inmediatamente anterior.',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'Constancia de horas de servicio social obligatorio cursadas en el colegio anterior (exclusivo para 11°).',
  PAZ_Y_SALVO_ANIO_ANTERIOR:
    'Para quien ya estudió aquí: paz y salvo con la institución al terminar el año anterior. Si ya se confirmó en el módulo «Paz y salvo de fin de año», se aprueba solo.',

  DIAGNOSTICO_MEDICO_INCLUSION: 'Diagnóstico clínico o valoración integral para el Plan Individual de Ajustes Razonables (Decreto 1421).',

  OTRO_DOCUMENTO: 'Documento o soporte adicional solicitado por la institución.',
};

export type CategoriaDocumentoMatricula =
  | 'IDENTIFICACION_SALUD'
  | 'TRAYECTORIA_ACADEMICA'
  | 'INCLUSION_PIAR'
  | 'INSTITUCIONAL';

export const CATEGORIAS_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, CategoriaDocumentoMatricula> = {
  DOCUMENTO_IDENTIDAD: 'IDENTIFICACION_SALUD',
  FOTO: 'IDENTIFICACION_SALUD',
  CARNE_EPS: 'IDENTIFICACION_SALUD',
  CARNE_VACUNAS: 'IDENTIFICACION_SALUD',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'IDENTIFICACION_SALUD',
  CERTIFICADO_AUDIOMETRIA_VISION: 'IDENTIFICACION_SALUD',
  DOCUMENTO_ACUDIENTE: 'IDENTIFICACION_SALUD',
  CUSTODIA_LEGAL_O_PODER: 'IDENTIFICACION_SALUD',

  PAZ_Y_SALVO_SIMAT: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADOS_NOTAS_ANTERIORES: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADO_QUINTO_PRIMARIA: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADO_GRADO_ANTERIOR: 'TRAYECTORIA_ACADEMICA',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'TRAYECTORIA_ACADEMICA',
  PAZ_Y_SALVO_ANIO_ANTERIOR: 'TRAYECTORIA_ACADEMICA',

  DIAGNOSTICO_MEDICO_INCLUSION: 'INCLUSION_PIAR',

  OTRO_DOCUMENTO: 'INSTITUCIONAL',
};

/** Activo/inactivo generico, reusado por User, Campus, Grade e Institution. */
export type EstadoActivo = 'activo' | 'inactivo';

export interface User {
  _id: string;
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  telefono: string | null;
  foto_url: string | null;
  /** Perfil por omisión (el primero de `roles`). */
  rol: Rol;
  /** Todos los perfiles: un solo registro puede ser, p. ej., DOCENTE y ACUDIENTE. */
  roles: Rol[];
  estado: EstadoActivo;
  sedes_ids: Array<string | { _id: string; nombre: string }>;
  debe_cambiar_password: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  ultimo_login: string | null;
  createdAt: string;
}

export const ESTADOS_PERIODO_ACADEMICO = ['PROGRAMADO', 'ABIERTO', 'EN_DIGITACION', 'CERRADO'] as const;
export type EstadoPeriodoAcademico = (typeof ESTADOS_PERIODO_ACADEMICO)[number];

export interface Periodo {
  _id?: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_apertura_notas?: string | null;
  fecha_cierre_notas?: string | null;
  /** Ventana de entrega de planes de aula (M07): null = la sugerida. La ventana efectiva se lee con `useVentanasPlanes`. */
  fecha_apertura_planes_aula?: string | null;
  fecha_limite_planes_aula?: string | null;
  estado?: EstadoPeriodoAcademico;
}

/** VIRTUAL: la institución no tiene espacios físicos (módulo de espacios apagado, grupos sin aula). */
export const MODALIDADES_INSTITUCION = ['PRESENCIAL', 'VIRTUAL'] as const;
export type ModalidadInstitucion = (typeof MODALIDADES_INSTITUCION)[number];

export const NOMBRES_MODALIDAD: Record<ModalidadInstitucion, string> = {
  PRESENCIAL: 'Presencial (usa aulas y espacios físicos)',
  VIRTUAL: 'Virtual (sin espacios físicos)',
};

export const POLITICAS_AFORO_AULA = ['BLOQUEAR', 'ADVERTIR'] as const;
export type PoliticaAforoAula = (typeof POLITICAS_AFORO_AULA)[number];

/** M04: cuándo se libera el cupo del grupo cuando un estudiante se retira o se traslada. */
export const POLITICAS_CUPO_SALIDA = ['INMEDIATA', 'AL_APROBAR_PAZ_Y_SALVO'] as const;
export type PoliticaCupoSalida = (typeof POLITICAS_CUPO_SALIDA)[number];

export interface Institution {
  _id: string;
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  administrador_id: string | null;
  logo_url: string | null;
  /** Ciudad y departamento: los usan los documentos oficiales (certificados de M26). */
  ciudad?: string | null;
  departamento?: string | null;
  correo_secretaria: string | null;
  horario_atencion: string | null;
  /** Estructura de tiempo base que se carga en cada jornada (M01/M05); M09 usa las franjas resultantes. */
  plantilla_franjas: FranjaPlantilla[];
  modalidad: ModalidadInstitucion;
  /** M10: qué pasa si el cupo de un grupo excede el aforo de su aula. */
  politica_aforo_aula: PoliticaAforoAula;
  /** M04: los docentes también pueden cargar y confirmar el paz y salvo de fin de año. */
  paz_y_salvo_docentes?: boolean;
  /** M01/M26: título de bachiller que se otorga por defecto; un grupo del último grado puede tener el suyo. */
  titulo_bachiller_defecto?: string;
  /** M04: cuándo se libera el cupo de quien sale durante el año; por defecto, al registrar la salida. */
  politica_cupo_salida?: PoliticaCupoSalida;
  estado: EstadoActivo;
}

export interface Campus {
  _id: string;
  institucion_id: string;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  telefono: string | null;
  es_principal: boolean;
  estado: EstadoActivo;
}

export const TIPOS_FRANJA = ['CLASE', 'DESCANSO'] as const;
export type TipoFranja = (typeof TIPOS_FRANJA)[number];

export const NOMBRES_TIPO_FRANJA: Record<TipoFranja, string> = { CLASE: 'Clase', DESCANSO: 'Descanso' };

/** Días de la semana en formato ISO (1 = lunes ... 7 = domingo), como los guarda el backend. */
export const NOMBRES_DIA_SEMANA: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};
export const DIAS_SEMANA_ISO = [1, 2, 3, 4, 5, 6, 7] as const;

/** Bloque de clase o descanso de una jornada, con horas reales. */
export interface Franja {
  nombre: string;
  tipo: TipoFranja;
  hora_inicio: string;
  hora_fin: string;
}

/** Bloque de la plantilla institucional: solo duración, se encadena desde el inicio de cada jornada. */
export interface FranjaPlantilla {
  nombre: string;
  tipo: TipoFranja;
  duracion_min: number;
}

export interface JornadaOperativa {
  _id: string;
  sede_id: string | { _id: string; nombre: string };
  nombre: Jornada;
  hora_inicio: string;
  hora_fin: string;
  /** Días en que opera la jornada (1 lunes ... 7 domingo). */
  dias_habiles: number[];
  franjas: Franja[];
}

export type EstadoAnioLectivo = 'PLANIFICACION' | 'EN_CURSO' | 'CERRADO';

export const TIPOS_EVENTO_CALENDARIO = [
  'RECESO',
  'VACACIONES',
  'DESARROLLO_INSTITUCIONAL',
  'RECUPERACION_PERIODO',
  'RECUPERACION_FINAL',
] as const;
export type TipoEventoCalendario = (typeof TIPOS_EVENTO_CALENDARIO)[number];

export const NOMBRES_TIPO_EVENTO: Record<TipoEventoCalendario, string> = {
  RECESO: 'Receso escolar',
  VACACIONES: 'Vacaciones',
  DESARROLLO_INSTITUCIONAL: 'Desarrollo institucional',
  RECUPERACION_PERIODO: 'Recuperación de periodo',
  RECUPERACION_FINAL: 'Recuperación final',
};

export interface EventoCalendario {
  _id: string;
  tipo: TipoEventoCalendario;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_numero: number | null;
  fecha_limite_resultados: string | null;
}

export interface PeriodoSede {
  numero: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_apertura_notas: string | null;
  fecha_cierre_notas: string | null;
}

export interface CalendarioSede {
  sede_id: string;
  periodos: PeriodoSede[];
}

export interface ResumenSemanas {
  semanas_minimas: number;
  semanas_lectivas: number;
  semanas_faltantes: number;
  cumple_minimo: boolean;
  semanas_por_periodo: Array<{ numero: number; semanas: number }>;
}

// M32/CU-ADM-04: niveles cualitativos nacionales de desempeño (Decreto 1290, art. 5). Los 4 son
// obligatorios por ley; la institución ajusta etiqueta y cortes numéricos, no la lista de niveles.
export const NIVELES_DESEMPENO = ['BAJO', 'BASICO', 'ALTO', 'SUPERIOR'] as const;
export type NivelDesempeno = (typeof NIVELES_DESEMPENO)[number];

export interface RangoCualitativo {
  nivel: NivelDesempeno;
  etiqueta: string;
  valor_minimo: number;
  valor_maximo: number;
  es_aprobatorio: boolean;
}

export interface EscalaEvaluacion {
  nota_minima: number;
  nota_maxima: number;
  nota_aprobatoria: number;
  precision_decimales: number;
  rangos: RangoCualitativo[];
}

// M32/CU-ADM-04: componentes evaluativos del SIEE (Decreto 1290) para la nota de asignatura.
export const COMPONENTES_SIEE = ['COGNITIVO_SABER', 'PROCEDIMENTAL_HACER', 'ACTITUDINAL_SER'] as const;
export type ComponenteSiee = (typeof COMPONENTES_SIEE)[number];

export type PonderacionComponentes = Record<ComponenteSiee, number>;

// M12: el molde de la planilla. Los bloques forman el 100% de la nota de una asignatura y cada uno limita cuántas casillas
// (actividades o notas sueltas) admite; la institución los define por año lectivo.
export interface ComponenteEvaluativo {
  clave: string;
  nombre: string;
  porcentaje: number;
  /** Cuántas casillas (actividades y notas) admite este bloque en la planilla de una clase y periodo. */
  max_casillas: number;
}

export interface AcademicYear {
  _id: string;
  institucion_id: string;
  year: number;
  nombre: string;
  calendario: Calendario;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoAnioLectivo;
  periodos: Periodo[];
  eventos: EventoCalendario[];
  calendarios_sede: CalendarioSede[];
  /** SIEE (CU-ADM-04): null hasta que el ADMIN la configure. */
  escala_evaluacion: EscalaEvaluacion | null;
  /** SIEE (CU-ADM-04): null hasta que el ADMIN la personalice (respaldo 40/40/20). */
  ponderacion_componentes: PonderacionComponentes | null;
  /** Los configurados por el ADMIN; vacío mientras rija el respaldo Saber/Hacer/Ser. */
  componentes_evaluativos: ComponenteEvaluativo[];
  /** Los que realmente rigen el cálculo (los configurados o el respaldo). */
  componentes_efectivos: ComponenteEvaluativo[];
  /** La escala y el molde de la planilla se pueden cambiar hasta que se registre la primera nota del año. */
  evaluacion_editable: boolean;
  cerrado_at: string | null;
  resumen_semanas: ResumenSemanas;
}

export interface Prorroga {
  _id: string;
  academic_year_id: string;
  periodo_numero: number;
  docente_id: { _id: string; nombre: string; apellido: string } | null;
  group_id: { _id: string; nomenclatura: string } | null;
  hasta: string;
  justificacion: string;
  revocada: boolean;
  vigente: boolean;
  createdAt: string;
}

export interface VerificacionCierre {
  puede_cerrar: boolean;
  verificaciones: Array<{ clave: string; descripcion: string; cumple: boolean; detalle: string | null }>;
}

export interface Grade {
  _id: string;
  nivel: 'PREESCOLAR' | 'PRIMARIA' | 'SECUNDARIA' | 'MEDIA';
  numero: number;
  nombre: string;
  estado: EstadoActivo;
}

export const ESTADOS_GRUPO = ['ACTIVE', 'CLOSED'] as const;
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number];

export interface Group {
  _id: string;
  sede_id: string | { _id: string; nombre: string };
  academic_year_id: string;
  grade_id: string | { _id: string; nivel: string; numero: number; nombre: string };
  jornada_id: string | { _id: string; nombre: Jornada; hora_inicio?: string; hora_fin?: string };
  /** Salón titular (M10), opcional. */
  aula_id?: string | { _id: string; nombre: string; capacidad: number } | null;
  nomenclatura: string;
  max_capacity: number;
  cupos_ocupados: number;
  cupos_disponibles?: number;
  /** Título de bachiller de este grupo (último grado); null/ausente = hereda el de la institución. */
  titulo_bachiller?: string | null;
  estado: EstadoGrupo;
  director_grupo_id: string | { _id: string; nombre: string; apellido: string } | null;
}

// --- M10: Espacios físicos ---

export const TIPOS_ESPACIO = [
  'AULA_REGULAR',
  'LABORATORIO',
  'SALA_INFORMATICA',
  'ESPACIO_DEPORTIVO',
  'AUDITORIO',
  'TALLER_TECNICO',
] as const;
export type TipoEspacio = (typeof TIPOS_ESPACIO)[number];

export const NOMBRES_TIPO_ESPACIO: Record<TipoEspacio, string> = {
  AULA_REGULAR: 'Aula regular',
  LABORATORIO: 'Laboratorio de ciencias',
  SALA_INFORMATICA: 'Sala de informática / sistemas',
  ESPACIO_DEPORTIVO: 'Espacio deportivo / cancha',
  AUDITORIO: 'Auditorio / aula máxima',
  TALLER_TECNICO: 'Taller técnico',
};

export const ESTADOS_ESPACIO = ['DISPONIBLE', 'EN_MANTENIMIENTO', 'INACTIVO'] as const;
export type EstadoEspacio = (typeof ESTADOS_ESPACIO)[number];

export const NOMBRES_ESTADO_ESPACIO: Record<EstadoEspacio, string> = {
  DISPONIBLE: 'Disponible',
  EN_MANTENIMIENTO: 'En mantenimiento',
  INACTIVO: 'Inactivo',
};

export const RECURSOS_ESPACIO = ['VIDEO_BEAM_TV', 'CLIMATIZACION', 'INTERNET', 'RED_CABLEADA', 'LAVAMANOS_GAS'] as const;
export type RecursoEspacio = (typeof RECURSOS_ESPACIO)[number];

export const NOMBRES_RECURSO_ESPACIO: Record<RecursoEspacio, string> = {
  VIDEO_BEAM_TV: 'Video beam / TV',
  CLIMATIZACION: 'Aire acondicionado / ventiladores',
  INTERNET: 'Conectividad a internet',
  RED_CABLEADA: 'Puntos de red cableada',
  LAVAMANOS_GAS: 'Lavamanos / gas para laboratorio',
};

export interface GrupoAsignadoEspacio {
  _id: string;
  nomenclatura: string;
  grado: string;
  max_capacity: number;
  jornada: { _id: string; nombre: Jornada; hora_inicio: string; hora_fin: string } | null;
}

export interface Espacio {
  _id: string;
  sede_id: { _id: string; nombre: string };
  nombre: string;
  tipo_espacio: TipoEspacio;
  capacidad: number;
  estado: EstadoEspacio;
  piso_bloque: string | null;
  recursos: RecursoEspacio[];
  computadores_operativos: number;
  areas_exclusivas: string[];
  admite_grupos_simultaneos: boolean;
  /** Grupos ACTIVOS que lo usan como salón titular (del año pedido). */
  grupos_asignados: GrupoAsignadoEspacio[];
  /** Algún grupo asignado tiene más cupo que el aforo del espacio. */
  sobrecupo: boolean;
}

export interface Area {
  _id: string;
  nombre: string;
  codigo: string;
  estado: EstadoActivo;
}

export interface ChecklistItem {
  tipo_documento: TipoDocumentoMatricula;
  nombre_personalizado?: string | null;
  /** Copia del catálogo al agregar el documento (los anteriores no la tienen: se lee de las constantes de partida). */
  indicacion?: string | null;
  categoria?: string | null;
  obligatorio?: boolean;
  cargado_por_tipo?: 'FAMILIA' | 'PERSONAL' | null;
  estado: EstadoDocumentoMatricula;
  archivo_path: string | null;
  comentario: string | null;
  fecha_carga: string | null;
  revisado_por: string | { _id: string; nombre: string; apellido: string } | null;
  /** Cuándo secretaría vio el original y lo dio por bueno sin archivo (quién: `revisado_por`). */
  fecha_verificacion_fisica?: string | null;
}

/** Secretaría lo vio en físico y lo aprobó, pero todavía no tiene archivo en el sistema. */
export const soloVerificadoEnFisico = (c: Pick<ChecklistItem, 'estado' | 'archivo_path' | 'fecha_verificacion_fisica'>): boolean =>
  c.estado === 'APROBADO' && !c.archivo_path && Boolean(c.fecha_verificacion_fisica);

export const SITUACIONES_ESTUDIANTE = ['DISPONIBLE', 'MATRICULADO', 'REINGRESO', 'GRADUADO', 'USUARIO_INACTIVO'] as const;
export type SituacionEstudiante = (typeof SITUACIONES_ESTUDIANTE)[number];

/** Un estudiante frente a la matrícula del año (GET /enrollments/estudiantes-situacion). */
export interface SituacionEstudianteMatricula {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  tipo_documento: TipoDocumento;
  estado_expediente: EstadoEstudiante | null;
  /** Lo registrado en su hoja de vida (M03): al matricularlo, orientación recibe la solicitud sin que se escriba de nuevo. */
  tiene_discapacidad?: boolean;
  /** Lo que respondió la familia sobre si continúa el año (renovación); null si no ha respondido. */
  continuidad?: 'CONTINUA' | 'NO_CONTINUA' | null;
  situacion: SituacionEstudiante;
  matricula: { _id: string; estado: EstadoMatricula; grupo: string; folio: string | null } | null;
}

export type LugarUbicacion = 'GRADO' | 'EGRESADO' | 'SIN_GRADO';

/** Dónde le toca matricularse a un estudiante, derivado del cierre de M19 y de sus matrículas anteriores (no es un dato guardado). */
export interface UbicacionEstudiante {
  /** La pestaña donde aparece: su grado si ya está matriculado o se retiró este año, si no el que dice su historial. */
  lugar: LugarUbicacion;
  grado_id: string | null;
  grado_numero: number | null;
  /** Lo que dice su historial; difiere de lo anterior si lo matricularon en otro grado (p. ej. promovido por decisión). */
  esperado: { lugar: LugarUbicacion; grado_numero: number | null };
  esperado_grado_id: string | null;
  difiere: boolean;
  ultimo_grado_cursado: number | null;
  ultimo_grado_cursado_id: string | null;
  fuente: 'MATRICULA_ACTUAL' | 'RETIRO_DEL_ANIO' | 'PROMOCION' | 'RETIRO_PREVIO' | 'PROPUESTA' | 'PERFIL_GRADUADO' | 'SIN_HISTORIAL';
  aviso: string;
}

/** Un estudiante con su situación de matrícula y su ubicación por grado (GET /enrollments/estudiantes-por-grado). */
export interface EstudiantePorGrado extends SituacionEstudianteMatricula {
  ubicacion: UbicacionEstudiante;
}

export interface Enrollment {
  _id: string;
  student_id: string | { _id: string; nombre: string; apellido: string; numero_documento: string; tipo_documento: TipoDocumento };
  group_id: string | { _id: string; nomenclatura: string };
  academic_year_id: string;
  /** null mientras esta PREINSCRITO: el folio se asigna al formalizar la matrícula. */
  folio_matricula: string | null;
  numero_libro: number | null;
  numero_folio: number | null;
  tipo_ingreso: TipoIngreso;
  estado: EstadoMatricula;
  fecha_matricula: string;
  fecha_limite_compromiso: string | null;
  /** Plazo para entregar documentos y legalizar el cupo mientras está PREINSCRITO. */
  fecha_limite_legalizacion: string | null;
  motivo_retiro: string | null;
  checklist: ChecklistItem[];
  /** `IMPORTACION_SIMAT` = la creó o formalizó la importación desde SIMAT. */
  origen?: 'IMPORTACION_SIMAT' | null;
  importacion_simat_id?: string | null;
}

// ---------------------------------------------------------------------------
// M06 — Plan de estudios, áreas y asignaturas
// ---------------------------------------------------------------------------

export const NIVELES_EDUCATIVOS = ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'] as const;
export type NivelEducativo = (typeof NIVELES_EDUCATIVOS)[number];

export const TIPOS_ASIGNATURA = ['OBLIGATORIA', 'OPTATIVA'] as const;
export type TipoAsignatura = (typeof TIPOS_ASIGNATURA)[number];

export const METODOS_CALCULO_EVALUACION = ['PONDERADO', 'ARITMETICO'] as const;
export type MetodoCalculoEvaluacion = (typeof METODOS_CALCULO_EVALUACION)[number];

export interface Area {
  _id: string;
  institucion_id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
  estado: EstadoActivo;
}

export interface Subject {
  _id: string;
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  estado: EstadoActivo;
  niveles_educativos: NivelEducativo[];
}

export interface AsignaturaGrado {
  subject_id: string;
  intensidad_horaria_semanal: number;
}

export interface PonderacionAsignatura {
  subject_id: string;
  porcentaje: number;
}

export interface EvaluacionArea {
  area_id: string;
  metodo_calculo: MetodoCalculoEvaluacion;
  asignaturas: PonderacionAsignatura[];
}

export interface AsignaturaPersonalizadaGrupo {
  subject_id: string;
  intensidad_horaria_semanal: number;
  observacion: string;
}

export interface PersonalizacionGrupo {
  group_id: string;
  intensidades_personalizadas: AsignaturaPersonalizadaGrupo[];
  asignaturas_agregadas: AsignaturaPersonalizadaGrupo[];
  evaluaciones_area_personalizadas: EvaluacionArea[];
}

export interface PersonalizacionJornada {
  jornada_id: string;
  intensidades_personalizadas: AsignaturaPersonalizadaGrupo[];
  asignaturas_agregadas: AsignaturaPersonalizadaGrupo[];
  evaluaciones_area_personalizadas?: EvaluacionArea[];
}

export interface GradoPlan {
  grade_id: string;
  sede_id?: string | null;
  jornada_id?: string | null;
  asignaturas: AsignaturaGrado[];
  evaluaciones_area: EvaluacionArea[];
  jornadas_personalizadas?: PersonalizacionJornada[];
  personalizaciones_grupo: PersonalizacionGrupo[];
}

export interface StudyPlan {
  _id: string;
  institucion_id: string;
  academic_year_id: string;
  grades: GradoPlan[];
}

export interface SetupInstitutionResult {
  institution: Institution;
  sede_principal: Campus;
  academic_year: AcademicYear;
}

// --- M03: Expediente y hoja de vida del estudiante ---

export const GENEROS = ['M', 'F', 'OTRO'] as const;
export type Genero = (typeof GENEROS)[number];

export const REGIMENES_SALUD = ['CONTRIBUTIVO', 'SUBSIDIADO', 'EXCEPCION', 'NO_ASEGURADO'] as const;
export type RegimenSalud = (typeof REGIMENES_SALUD)[number];

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type GrupoSanguineo = (typeof GRUPOS_SANGUINEOS)[number];

export const GRUPOS_ETNICOS = ['NINGUNO', 'INDIGENA', 'AFRODESCENDIENTE', 'ROM', 'RAIZAL', 'PALENQUERO'] as const;
export type GrupoEtnico = (typeof GRUPOS_ETNICOS)[number];

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

/** Ley 1581 de 2012, art. 6: autorizacion explicita para tratar datos sensibles de salud. */
export interface AutorizacionDatosSensibles {
  otorgada: boolean;
  otorgado_por_nombre?: string | null;
  fecha?: string | null;
  registrado_por_id?: string | null;
}

export interface StudentProfile {
  _id: string;
  user_id: string;
  primer_nombre?: string | null;
  segundo_nombre?: string | null;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
  lugar_expedicion?: string | null;
  fecha_nacimiento: string;
  genero?: Genero;
  // eps/regimen_salud/rh: puede llegar undefined (un DOCENTE no las ve, ver backend ocultarSaludAdministrativa).
  eps?: string | null;
  regimen_salud?: RegimenSalud;
  rh?: GrupoSanguineo;
  alergias_condiciones?: string | null;
  direccion_residencia?: string | null;
  barrio_vereda?: string | null;
  municipio?: string | null;
  estrato?: number;
  /** Grupo del SISBEN IV (A1…D21); vacío si no está en el SISBEN. */
  sisben_grupo?: string | null;
  pais_origen?: string | null;
  pais_nacimiento?: string | null;
  nacionalidad_2?: string | null;
  correo_contacto?: string | null;
  grupo_etnico: GrupoEtnico;
  /** El valor de SIMAT tal cual (pueblo indígena, «Negritudes»). */
  etnia_detalle?: string | null;
  victima_conflicto: boolean;
  tiene_discapacidad: boolean;
  tiene_talento_excepcional: boolean;
  descripcion_inclusion?: string | null;
  institucion_procedencia?: string | null;
  estado: EstadoEstudiante;
  autorizacion_datos_sensibles?: AutorizacionDatosSensibles;
  simat_per_id?: string | null;
  simat_nui?: string | null;
  /** Presente solo en quienes llegaron por la importación desde SIMAT: su información está pendiente de revisión hasta que alguien la confirme. */
  origen_simat?: { lote_id: string; fecha: string; revision: 'PENDIENTE' | 'REVISADA'; revisada_por?: string | null; fecha_revision?: string | null } | null;
}

export interface Guardian {
  _id: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombre: string;
  apellido: string;
  telefono_principal: string;
  telefono_secundario?: string | null;
  email?: string | null;
  ocupacion?: string | null;
  direccion?: string | null;
  user_id: string | null;
  estado: EstadoActivo;
}

export interface StudentGuardianRelation {
  _id: string;
  student_id: string;
  guardian_id: Guardian;
  parentesco: Parentesco;
  es_principal: boolean;
  autorizado_retiro: boolean;
}

export interface StudentDirectoryItem extends User {
  perfil?: StudentProfile;
  acudiente_principal: { nombre: string; apellido: string; telefono_principal: string; email?: string | null } | null;
}

export interface StudentFicha360 {
  estudiante: User;
  perfil: StudentProfile | null;
  acudientes: StudentGuardianRelation[];
  matriculas: Array<
    Omit<Enrollment, 'group_id' | 'academic_year_id'> & {
      group_id: { _id: string; nomenclatura: string } | string;
      academic_year_id: { _id: string; year: number; calendario: Calendario } | string;
    }
  >;
}

// --- M04: Admisiones (sitio publico + revision interna) ---

export const ESTADOS_SOLICITUD = ['PENDIENTE', 'ADMITIDO', 'MATRICULADO', 'RECHAZADA'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export interface PublicSede {
  _id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  es_principal: boolean;
  jornadas: Jornada[];
}

export interface PublicInstitutionInfo {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  logo_url: string | null;
  /** Fecha (ms) de la foto del login, o null si no hay: sirve de versión en la URL de la imagen. */
  imagen_login_version: number | null;
  correo_secretaria: string | null;
  horario_atencion: string | null;
  sedes: PublicSede[];
  niveles_educativos: string[];
  klassy_version: string;
}

/** Lo que ve el acudiente en el sitio público cuando la solicitud está APROBADA. */
export interface DocumentoPreinscripcion {
  tipo_documento: TipoDocumentoMatricula;
  nombre: string;
  estado: EstadoDocumentoMatricula;
  /** Motivo del rechazo, para que sepa qué corregir. */
  comentario: string | null;
}

export interface PreinscripcionDetalle {
  grado: string;
  grupo: string;
  sede: string;
  jornada: string;
  fecha_limite_legalizacion: string | null;
  plazo_vencido: boolean;
  matricula_estado: EstadoMatricula;
  folio_matricula: string | null;
  documentos: DocumentoPreinscripcion[];
  puede_subir_documentos: boolean;
}

export interface AdmissionRequest {
  _id: string;
  nombre_aspirante: string;
  apellido_aspirante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string;
  grado_deseado_id: string | { _id: string; nombre: string; nivel: string; numero: number };
  sede_deseada_id: string | { _id: string; nombre: string } | null;
  jornada_deseada: Jornada | null;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_telefono: string;
  acudiente_email: string;
  /** Los registra secretaría en la inscripción del mostrador; la solicitud pública no los trae. */
  acudiente_tipo_documento?: TipoDocumento | null;
  acudiente_numero_documento?: string | null;
  acudiente_parentesco?: Parentesco | null;
  observaciones: string;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  student_user_id: string | null;
  enrollment_id: string | null;
  origen?: 'PUBLICA' | 'SECRETARIA';
  /** El año al que apunta (el siguiente durante la prematrícula). null en las solicitudes anteriores. */
  academic_year_id?: string | null;


  /** Documentos recibidos con la solicitud (la API nunca trae la ruta del archivo). */
  documentos?: Array<{ tipo_documento: string; fecha_carga: string }>;
  createdAt: string;
}

// --- M08: Gestor de Docentes y Carga Académica ---

export const TIPOS_ASIGNACION_DOCENTE = [
  'CLASE',
  'DIRECCION_GRUPO',
  'PROYECTO_TRANSVERSAL',
  'OTRO',
] as const;
export type TipoAsignacionDocente = (typeof TIPOS_ASIGNACION_DOCENTE)[number];

export interface TeacherAssignment {
  _id: string;
  docente_id: {
    _id: string;
    nombre: string;
    apellido: string;
    numero_documento: string;
    email: string;
    estado?: EstadoActivo;
  } | string;
  academic_year_id: {
    _id: string;
    year: number;
    calendario?: Calendario;
    estado?: string;
  } | string;
  tipo_asignacion: TipoAsignacionDocente;
  group_id?: {
    _id: string;
    nomenclatura: string;
    sede_id?: { _id: string; nombre: string } | string;
    grade_id?: { _id: string; nombre: string; numero: number; nivel?: string } | string;
    jornada_id?: { _id: string; nombre: string } | string;
    max_capacity?: number;
  } | string | null;
  subject_id?: {
    _id: string;
    nombre: string;
    abreviatura: string;
    area_id?: { _id: string; nombre: string; codigo: string } | string;
    tipo?: string;
  } | string | null;
  horas_semanales: number;
  proyecto_nombre?: string;
  observaciones?: string;
  estado: EstadoActivo;
  createdAt: string;
}

export interface DocenteCargaResumen {
  docente: {
    _id: string;
    nombre: string;
    apellido: string;
    numero_documento: string;
    email: string;
  };
  horas_clase: number;
  horas_direccion: number;
  horas_proyectos: number;
  tiene_direccion_grupo: boolean;
  horas_totales: number;
  estado_carga: 'SUB_CARGA' | 'NORMAL' | 'SOBRE_CARGA' | 'SIN_CARGA';
  tope_horas?: number | null;
  /** 1 = 100% de la jornada lectiva; null si el docente no tiene clases. */
  fraccion_carga?: number | null;
  nivel_predominante?: NivelEducativo | 'MULTINIVEL' | null;
  total_asignaciones: number;
  asignaciones: TeacherAssignment[];
}

// --- M07: Planeación documental (plan de área anual y plan de aula por periodo, ambos en PDF) ---

export const ESTADOS_PLAN = ['EN_REVISION', 'APROBADO', 'DEVUELTO'] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];
/** A los tres estados guardados se suma «sin cargar», que no existe como documento. */
export type EstadoPlanVista = EstadoPlan | 'SIN_CARGAR';

export const NOMBRES_ESTADO_PLAN: Record<EstadoPlanVista, string> = {
  SIN_CARGAR: 'Sin cargar',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  DEVUELTO: 'Devuelto con comentarios',
};

export interface PersonaPlaneacion {
  _id: string;
  nombre: string;
  apellido: string;
}

export type AccionRevisionPlan = 'APROBADO' | 'DEVUELTO' | 'REABIERTO';

export interface RevisionPlan {
  accion: AccionRevisionPlan;
  /** Versión del documento que se revisó. */
  version: number;
  comentario: string;
  fecha: string;
  /** Aprobación heredada de una adopción: no la dio una persona al revisar. */
  automatica: boolean;
  revisor: PersonaPlaneacion | null;
}

export interface VersionPlan {
  numero: number;
  titulo: string;
  descripcion: string;
  archivo: { nombre: string; bytes: number };
  origen: 'CARGADA' | 'ADOPTADA';
  adoptado_de: { docente: PersonaPlaneacion | null; version: number } | null;
  subido_por: PersonaPlaneacion | null;
  /** Instante de la radicación, con fecha y hora. */
  fecha: string;
}

export interface ResumenPlan {
  _id: string;
  estado: EstadoPlan;
  version_actual: number;
  titulo: string;
  descripcion: string;
  archivo_nombre: string;
  radicado_en: string | null;
  origen: 'CARGADA' | 'ADOPTADA';
  adoptado_de: { docente: PersonaPlaneacion | null } | null;
  ultima_revision: RevisionPlan | null;
}

export interface PermisosPlanArea {
  cargar: boolean;
  revisar: boolean;
  reabrir: boolean;
  ver_archivo: boolean;
}

export type MotivoAreaPendiente = 'SIN_LIDER' | 'SIN_CARGAR' | 'EN_REVISION' | 'DEVUELTO';

export interface AreaResumida {
  _id: string;
  nombre: string;
  codigo?: string;
}

/** «Diurna» y «nocturna» agrupan las jornadas operativas (mañana, tarde y única; nocturna y sabatina). */
export const ALCANCES_JORNADA = ['TODAS', 'DIURNA', 'NOCTURNA'] as const;
export type AlcanceJornada = (typeof ALCANCES_JORNADA)[number];

export const NOMBRES_ALCANCE_JORNADA: Record<AlcanceJornada, string> = { TODAS: 'Todas las jornadas', DIURNA: 'Diurna', NOCTURNA: 'Nocturna' };

export const NOMBRES_NIVEL_EDUCATIVO: Record<NivelEducativo, string> = {
  PREESCOLAR: 'Preescolar',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  MEDIA: 'Media',
};

/** Qué parte de la institución cubre un líder de área: niveles (vacío = todos), jornada y sedes (vacío = todas). */
export interface AlcanceLiderArea {
  niveles: NivelEducativo[];
  jornada: AlcanceJornada;
  sedes: Array<{ _id: string; nombre: string }>;
  /** Ya armado por el servidor: «Primaria · Diurna · Todas las sedes». */
  texto: string;
}

/** Un líder de área (docente + lo que cubre). El plan de área anual es suyo y de nadie más. */
export interface LiderArea {
  _id: string;
  area_id: string;
  docente: { _id: string; nombre: string; apellido: string; estado?: EstadoActivo } | null;
  niveles: NivelEducativo[];
  jornada: AlcanceJornada;
  sedes: Array<{ _id: string; nombre: string }>;
  alcance_texto: string;
  estado: EstadoActivo;
  /** Ya cargó planes de área: quitarlo lo desactiva en vez de borrarlo. */
  tiene_planes: boolean;
}

export interface DatosLiderArea {
  docente_id: string;
  niveles: NivelEducativo[];
  jornada: AlcanceJornada;
  sedes_ids: string[];
}

export interface FilaPlanArea {
  /** El líder, o `area:sin-lider` en la fila que avisa lo que ningún líder cubre. */
  clave: string;
  lider_area_id: string | null;
  area: AreaResumida & { codigo: string };
  /** null en la fila «sin líder». */
  alcance: AlcanceLiderArea | null;
  /** Solo en la fila «sin líder»: las partes (nivel, jornada, sede) que nadie cubre; vacío si el área no tiene líder y aún no se sabe dónde se dicta. */
  sin_cubrir: string[] | null;
  lider: PersonaPlaneacion | null;
  /** false = ya no lidera (se conserva porque dejó planes). */
  vigente: boolean;
  soy_lider: boolean;
  /** Tiene al menos una asignatura obligatoria en el plan de estudios del año: sin su plan aprobado no se activa el año. */
  obligatoria: boolean;
  estado: EstadoPlanVista;
  plan: ResumenPlan | null;
  pendiente_para_activar: MotivoAreaPendiente | null;
  puede: PermisosPlanArea;
}

export interface DetallePlanArea extends ResumenPlan {
  area: AreaResumida & { codigo: string };
  lider_area_id: string;
  alcance: AlcanceLiderArea;
  lider: PersonaPlaneacion | null;
  academic_year_id: string;
  anio: number | null;
  versiones: VersionPlan[];
  revisiones: RevisionPlan[];
  puede: PermisosPlanArea;
}

export interface DocumentoReferencia {
  _id: string;
  titulo: string;
  descripcion: string;
  area: (AreaResumida & { codigo: string }) | null;
  grados: Array<{ _id: string; nombre: string; numero: number }>;
  archivo: { nombre: string; bytes: number };
  subido_por: PersonaPlaneacion | null;
  createdAt: string;
  updatedAt: string;
}

export type EstadoVentanaEntrega = 'NO_ABIERTA' | 'ABIERTA' | 'VENCIDA';

export interface VentanaEntrega {
  /** Días de calendario (medianoche UTC): se muestran con `lib/fechas`, nunca con `toLocaleDateString`. */
  apertura: string;
  limite: string;
  estado: EstadoVentanaEntrega | null;
}

/** La primera radicación del plan de aula: de ahí sale la etiqueta «entregado fuera de plazo». */
export interface RadicacionPlanAula {
  fecha: string;
  fecha_limite: string | null;
  fuera_de_plazo: boolean;
}

export interface ResumenPlanAula extends ResumenPlan {
  periodo_numero: number;
  radicacion: RadicacionPlanAula;
}

export interface PlanAdoptable {
  plan_id: string;
  docente: PersonaPlaneacion | null;
  titulo: string;
  descripcion: string;
  aprobado_en: string | null;
}

export type CodigoBloqueoCarga = 'ANIO_CERRADO' | 'PLAN_AREA_PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'VENTANA_NO_ABIERTA';

export interface PeriodoTarjetaPlanAula {
  numero: number;
  nombre: string;
  ventana: VentanaEntrega | null;
  estado: EstadoPlanVista;
  plan: ResumenPlanAula | null;
  puede_cargar: boolean;
  /** Si el docente radica hoy por primera vez, ¿quedaría marcado «entregado fuera de plazo»? Lo decide el servidor con su misma regla. */
  radicaria_fuera_de_plazo: boolean;
  bloqueo: { codigo: CodigoBloqueoCarga; mensaje: string } | null;
  /** Planes aprobados de un docente anterior que se pueden adoptar en este periodo. */
  adoptables: PlanAdoptable[];
}

/** Una tarjeta por asignatura y grado que dicta el docente (el plan de aula es por grado, no por grupo). */
export interface TarjetaPlanAula {
  area: AreaResumida;
  asignatura: AreaResumida;
  grado: { _id: string; nombre: string; numero: number };
  grupos: string[];
  /** El plan de área que aplica a esta clase (el del líder que cubre su nivel, jornada y sede); casi siempre un solo plan aprobado. */
  plan_area: { area_id: string; estado: EstadoPlanVista; planes_aprobados_ids: string[]; detalle: string | null };
  periodos: PeriodoTarjetaPlanAula[];
}

export interface AnioPlaneacion {
  _id: string;
  year: number;
  estado: EstadoAnioLectivo;
}

export interface MisPlanesAula {
  anio: AnioPlaneacion;
  tarjetas: TarjetaPlanAula[];
}

export interface FilaBandejaPlanAula {
  clave: string;
  docente: PersonaPlaneacion | null;
  area: AreaResumida;
  asignatura: AreaResumida;
  grado: { _id: string; nombre: string; numero: number };
  grupos: string[];
  periodo_numero: number;
  periodo_nombre: string;
  ventana: VentanaEntrega | null;
  estado: EstadoPlanVista;
  plan: ResumenPlanAula | null;
  /** El docente ya no dicta esa asignatura en ese grado: el plan quedó en el histórico del periodo. */
  archivado: boolean;
  puede: { revisar: boolean; reabrir: boolean };
}

export interface BandejaPlanesAula {
  anio: AnioPlaneacion;
  resumen: {
    esperados: number;
    sin_cargar: number;
    en_revision: number;
    aprobados: number;
    devueltos: number;
    fuera_de_plazo: number;
    archivados: number;
  };
  filas: FilaBandejaPlanAula[];
}

export interface DetallePlanAula extends ResumenPlanAula {
  academic_year_id: string;
  anio: number;
  docente: PersonaPlaneacion | null;
  area: AreaResumida | null;
  asignatura: AreaResumida | null;
  grado: { _id: string; nombre: string; numero: number } | null;
  archivado: boolean;
  versiones: VersionPlan[];
  revisiones: RevisionPlan[];
  puede: { revisar: boolean; reabrir: boolean; ver_archivo: boolean };
}

/** El plan de aula de una clase en un periodo, para el visor del formulario de actividades. */
export interface PlanDeAsignacion {
  periodo_numero: number;
  estado: EstadoPlanVista;
  aprobado: boolean;
  plan: ResumenPlanAula | null;
}

export interface VentanaPeriodo {
  numero: number;
  nombre: string;
  estado_periodo: EstadoPeriodoAcademico;
  fecha_inicio: string;
  fecha_fin: string;
  apertura: string;
  limite: string;
  apertura_personalizada: boolean;
  limite_personalizado: boolean;
  estado: EstadoVentanaEntrega;
}

export interface VentanasAnio {
  anio: AnioPlaneacion;
  periodos: VentanaPeriodo[];
}

// --- M13: Asistencia ---

export type TonoEstadoAsistencia = 'green' | 'orange' | 'red' | 'blue' | 'neutral';

/** Estado parametrizable por institución; las banderas (no el nombre) definen cómo cuenta en reportes y boletín. */
export interface EstadoAsistencia {
  _id: string;
  nombre: string;
  abreviatura: string;
  tono: TonoEstadoAsistencia;
  cuenta_como_falla: boolean;
  es_retardo: boolean;
  es_justificada: boolean;
  es_predeterminado: boolean;
  orden: number;
  estado: EstadoActivo;
}

export type EstadoJustificacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface FilaPlanilla {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  /** null = todavía sin registrar: la planilla ofrece el estado predeterminado. */
  state_id: string | null;
  novedad: string;
  registro_id: string | null;
  justificacion: EstadoJustificacion | null;
}

export interface PlanillaAsistencia {
  /** null hasta que se guarde la primera vez; con él se justifica una falla de la planilla. */
  attendance_id: string | null;
  grupo: { _id: string; nomenclatura: string };
  asignatura: { _id: string; nombre: string };
  fecha: string;
  periodo_numero: number | null;
  /** Por qué no se puede tomar asistencia ese día (M05); null si se puede. */
  bloqueo: string | null;
  planilla_guardada: boolean;
  estados: EstadoAsistencia[];
  estudiantes: FilaPlanilla[];
}

export interface InasistenciaEstudiante {
  attendance_id: string;
  registro_id: string;
  fecha: string;
  periodo_numero: number;
  asignatura: string;
  grupo: string;
  estado: { _id: string; nombre: string; tono: TonoEstadoAsistencia; es_justificada: boolean };
  novedad: string;
  justificacion: { _id: string; estado: EstadoJustificacion; motivo: string } | null;
}

export interface JustificacionAsistencia {
  _id: string;
  student_id: { _id: string; nombre: string; apellido: string; numero_documento: string };
  acudiente_id: { _id: string; nombre: string; apellido: string } | null;
  motivo: string;
  archivo_nombre: string | null;
  tiene_soporte: boolean;
  estado: EstadoJustificacion;
  revisado_por: { _id: string; nombre: string; apellido: string } | null;
  fecha_revision: string | null;
  comentario_revision: string | null;
  createdAt: string;
  inasistencia: {
    fecha: string | null;
    periodo_numero: number | null;
    grupo: string | null;
    asignatura: string | null;
    estado: string | null;
  };
}

export const DIMENSIONES_ESTADISTICA = ['estudiante', 'grupo', 'asignatura', 'periodo'] as const;
export type DimensionEstadistica = (typeof DIMENSIONES_ESTADISTICA)[number];

export interface TotalesAsistencia {
  total_registros: number;
  asistencias: number;
  retardos: number;
  fallas: number;
  fallas_justificadas: number;
  fallas_injustificadas: number;
  porcentaje_ausentismo: number;
  por_estado: Record<string, number>;
}

export interface FilaEstadistica extends TotalesAsistencia {
  clave: string;
  etiqueta: string;
}

export interface EstadisticasAsistencia {
  estados: Array<Pick<EstadoAsistencia, '_id' | 'nombre' | 'abreviatura' | 'tono'>>;
  total: TotalesAsistencia;
  filas: FilaEstadistica[];
}

// --- M13: Planilla clásica (cuadrícula mensual) ---

export interface ClaseAsistencia {
  group_id: string;
  subject_id: string;
  grupo: string;
  grado: string;
  asignatura: string;
  docente: string;
  /** El docente la dicta él mismo; si es false solo la consulta (director de grupo o staff). */
  editable: boolean;
}

export interface CeldaCuadricula {
  state_id: string;
  novedad: string;
  registro_id: string;
  justificacion: EstadoJustificacion | null;
}

export interface DiaCuadricula {
  fecha: string;
  periodo_numero: number;
  /** Por qué no se puede editar ese día (futuro, periodo cerrado...); null si se puede. */
  bloqueo: string | null;
  attendance_id: string | null;
}

export interface CuadriculaAsistencia {
  grupo: { _id: string; nomenclatura: string; grado: string };
  asignatura: { _id: string; nombre: string };
  docente: string | null;
  mes: string;
  editable: boolean;
  estados: EstadoAsistencia[];
  estudiantes: Array<{ student_id: string; nombre: string; apellido: string; numero_documento: string }>;
  dias: DiaCuadricula[];
  /** estudiante -> fecha -> celda; una celda ausente es un día todavía sin registrar. */
  celdas: Record<string, Record<string, CeldaCuadricula>>;
}

type ItemDeDocumento = { tipo_documento: string; nombre_personalizado?: string | null; indicacion?: string | null; categoria?: string | null };

/** El nombre que se ve de un documento del checklist: el copiado del catálogo o, en los anteriores, el de partida. */
export const nombreDeItem = (c: ItemDeDocumento): string => c.nombre_personalizado || NOMBRES_DOCUMENTO_MATRICULA[c.tipo_documento] || c.tipo_documento;
export const indicacionDeItem = (c: ItemDeDocumento): string => c.indicacion || INDICACIONES_DOCUMENTO_MATRICULA[c.tipo_documento] || '';
export const categoriaDeItem = (c: ItemDeDocumento): CategoriaDocumentoMatricula =>
  ((c.categoria as CategoriaDocumentoMatricula | null | undefined) ?? CATEGORIAS_DOCUMENTO_MATRICULA[c.tipo_documento]) || 'INSTITUCIONAL';
