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

export const TIPOS_DOCUMENTO_MATRICULA = [
  'DOCUMENTO_IDENTIDAD',
  'CERTIFICADO_GRADO_ANTERIOR',
  'FOTO',
  'CARNE_EPS',
  'CARNE_VACUNAS',
] as const;
export type TipoDocumentoMatricula = (typeof TIPOS_DOCUMENTO_MATRICULA)[number];

export const NOMBRES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Documento de identidad',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado del grado anterior',
  FOTO: 'Foto 3x4',
  CARNE_EPS: 'Carné o afiliación a EPS',
  CARNE_VACUNAS: 'Carné de vacunas',
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
  rol: Rol;
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

export interface Institution {
  _id: string;
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  administrador_id: string | null;
  logo_url: string | null;
  correo_secretaria: string | null;
  horario_atencion: string | null;
  /** Estructura de tiempo base que se carga en cada jornada (M01/M05); M09 usa las franjas resultantes. */
  plantilla_franjas: FranjaPlantilla[];
  modalidad: ModalidadInstitucion;
  /** M10: qué pasa si el cupo de un grupo excede el aforo de su aula. */
  politica_aforo_aula: PoliticaAforoAula;
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
  estado: EstadoDocumentoMatricula;
  archivo_path: string | null;
  comentario: string | null;
  fecha_carga: string | null;
  revisado_por: string | { _id: string; nombre: string; apellido: string } | null;
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

export interface GradoPlan {
  grade_id: string;
  asignaturas: AsignaturaGrado[];
  evaluaciones_area: EvaluacionArea[];
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
  grupo_etnico: GrupoEtnico;
  victima_conflicto: boolean;
  tiene_discapacidad: boolean;
  tiene_talento_excepcional: boolean;
  descripcion_inclusion?: string | null;
  institucion_procedencia?: string | null;
  estado: EstadoEstudiante;
  autorizacion_datos_sensibles?: AutorizacionDatosSensibles;
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

export const ESTADOS_SOLICITUD = ['PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA'] as const;
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
  correo_secretaria: string | null;
  horario_atencion: string | null;
  sedes: PublicSede[];
  niveles_educativos: string[];
  klassy_version: string;
}

export interface PublicGrade {
  _id: string;
  nivel: string;
  numero: number;
  nombre: string;
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
  observaciones: string;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  student_user_id: string | null;
  enrollment_id: string | null;
  createdAt: string;
}

// --- M07: Banco de Referentes Curriculares Oficiales (MEN) ---
// MATRIZ_ICFES queda reservado en el enum: aun no hay documento fuente para
// sembrarlo. DBA, EBC y LINEAMIENTO tienen su propio contrato (discriminado
// por tipo_referente), sin campos nulos "por si acaso" de un diseño anterior.

export const TIPOS_REFERENTE = ['DBA', 'EBC', 'MATRIZ_ICFES', 'LINEAMIENTO'] as const;
export type TipoReferente = (typeof TIPOS_REFERENTE)[number];

export const GRUPOS_GRADOS_EBC = ['1-3', '4-5', '6-7', '8-9', '10-11'] as const;
export type GrupoGradosEbc = (typeof GRUPOS_GRADOS_EBC)[number];

interface ReferenteBase {
  _id: string;
  // Solo es null en un Lineamiento transversal (marco general, no propio de un área).
  area_id: { _id: string; nombre: string; codigo: string } | string | null;
  etiquetas: string[];
  version: string;
  fuente: string;
  // activo = Vigente, inactivo = Histórico.
  estado: EstadoActivo;
  createdAt: string;
}

export interface DbaReferente extends ReferenteBase {
  tipo_referente: 'DBA';
  grade_id: { _id: string; nombre: string; numero: number; nivel: string } | string;
  numero_dba: number;
  // Pensamiento (Matemáticas) / Factor (Lenguaje) / Entorno (C. Naturales) / Eje (C. Sociales).
  organizador: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  ejemplo?: string;
}

export interface EbcReferente extends ReferenteBase {
  tipo_referente: 'EBC';
  grupo_grados: GrupoGradosEbc;
  organizador: string;
  competencia: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  dba_relacionados: DbaReferente[] | string[];
}

export interface LineamientoReferente extends ReferenteBase {
  tipo_referente: 'LINEAMIENTO';
  titulo: string;
  contenido: string;
  orden: number;
}

export type ReferenteCurricular = DbaReferente | EbcReferente | LineamientoReferente;

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

// --- M07: Desarrollo Curricular y Workflow ---

export const ESTADOS_DESARROLLO_CURRICULAR = [
  'BORRADOR',
  'ENVIADO_REVISION',
  'DEVUELTO_OBSERVACIONES',
  'APROBADO',
] as const;
export type EstadoDesarrolloCurricular = (typeof ESTADOS_DESARROLLO_CURRICULAR)[number];

export interface RevisionHistorial {
  _id?: string;
  observacion: string;
  coordinador_id: { _id: string; nombre: string; apellido: string; email?: string } | string;
  fecha: string;
  estado_resultante: EstadoDesarrolloCurricular;
}

export interface VersionSnapshot {
  _id?: string;
  version: number;
  fecha: string;
  modificado_por: { _id: string; nombre: string; apellido: string } | string;
  dba_seleccionados: string[];
  competencias: string;
  contenidos_tematicos: string[];
  actividades_propuestas: string;
  criterios_evaluacion: string;
  estado: EstadoDesarrolloCurricular;
}

export interface CurricularDevelopment {
  _id: string;
  teacher_assignment_id: TeacherAssignment | string;
  periodo_numero: number;
  dba_seleccionados: DbaReferente[] | string[];
  competencias: string;
  contenidos_tematicos: string[];
  ejes_tematicos: string[];
  actividades_propuestas: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas: number;
  estado: EstadoDesarrolloCurricular;
  version: number;
  historial_revisiones: RevisionHistorial[];
  historial_versiones: VersionSnapshot[];
  createdAt: string;
  updatedAt: string;
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
