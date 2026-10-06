/**
 * Inclusión (M16): PIAR (Decreto 1421 de 2017) y plan de apoyo pedagógico. Las categorías de discapacidad vienen del reporte
 * SIMAT (contrato externo del MEN, versionado); todo lo que el colegio decide (plazos, textos del acta) vive en
 * `ConfiguracionInclusion`. Los documentos se identifican por clave, nunca por número de anexo (varía según la fuente).
 */

// --- Solicitud de apoyo (bandeja de entrada única) ---

export const ORIGENES_SOLICITUD_APOYO = ['MATRICULA', 'PREINSCRIPCION', 'DOCENTE', 'CONVIVENCIA', 'DIRECTO'] as const;
export type OrigenSolicitudApoyo = (typeof ORIGENES_SOLICITUD_APOYO)[number];

export const ESTADOS_SOLICITUD_APOYO = ['PENDIENTE', 'EN_VALORACION', 'CONVERTIDA', 'DESCARTADA'] as const;
export type EstadoSolicitudApoyo = (typeof ESTADOS_SOLICITUD_APOYO)[number];

/** Cómo termina la valoración de orientación. Solo ABRIR_PIAR y PLAN_APOYO crean un expediente. */
export const RESULTADOS_SOLICITUD_APOYO = ['ABRIR_PIAR', 'PLAN_APOYO', 'SEGUIMIENTO_PSICOSOCIAL', 'RUTA_SALUD', 'DESCARTAR'] as const;
export type ResultadoSolicitudApoyo = (typeof RESULTADOS_SOLICITUD_APOYO)[number];

// --- Expediente ---

/** El PIAR es solo para discapacidad; PLAN_APOYO (dificultades de aprendizaje) es liviano y no genera actas del MEN. */
export const TIPOS_EXPEDIENTE = ['PIAR', 'PLAN_APOYO'] as const;
export type TipoExpediente = (typeof TIPOS_EXPEDIENTE)[number];

export const ESTADOS_EXPEDIENTE = ['BORRADOR', 'EN_CONSTRUCCION', 'LISTO_PARA_ACUERDO', 'ACTIVO', 'CERRADO'] as const;
export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number];

/**
 * Categorías de discapacidad del reporte SIMAT. Lista a validar contra el anexo técnico vigente del MEN (cambia por versión);
 * por eso se versiona y `POR_CONFIRMAR` permite abrir el PIAR sin bloquear la atención mientras llega el soporte clínico.
 */
export const VERSION_CATEGORIAS_DISCAPACIDAD = 'SIMAT-validar';
export const CATEGORIAS_DISCAPACIDAD = [
  { codigo: 'POR_CONFIRMAR', nombre: 'Por confirmar' },
  { codigo: 'VISUAL_CEGUERA', nombre: 'Visual: ceguera' },
  { codigo: 'VISUAL_BAJA_VISION', nombre: 'Visual: baja visión diagnosticada' },
  { codigo: 'AUDITIVA_SORDERA', nombre: 'Auditiva: sordera profunda (usuario de LSC)' },
  { codigo: 'AUDITIVA_HIPOACUSIA', nombre: 'Auditiva: hipoacusia o baja audición' },
  { codigo: 'SORDOCEGUERA', nombre: 'Sordoceguera' },
  { codigo: 'INTELECTUAL', nombre: 'Intelectual (cognitiva)' },
  { codigo: 'FISICA', nombre: 'Física (movilidad)' },
  { codigo: 'PSICOSOCIAL', nombre: 'Psicosocial (mental)' },
  { codigo: 'SISTEMICA', nombre: 'Sistémica' },
  { codigo: 'MULTIPLE', nombre: 'Múltiple' },
  { codigo: 'TEA', nombre: 'Trastorno del espectro autista' },
] as const;
export const CODIGOS_CATEGORIA_DISCAPACIDAD = CATEGORIAS_DISCAPACIDAD.map((c) => c.codigo);
export type CategoriaDiscapacidad = (typeof CATEGORIAS_DISCAPACIDAD)[number]['codigo'];

export const TIPOS_NECESIDAD_PLAN_APOYO = [
  'TDAH_INATENTO',
  'TDAH_HIPERACTIVO_IMPULSIVO',
  'TDAH_MIXTO',
  'DIFICULTAD_LECTOESCRITURA',
  'DIFICULTAD_CALCULO',
  'REZAGO_PEDAGOGICO_TRANSITORIO',
  'OTRA',
] as const;
export type TipoNecesidadPlanApoyo = (typeof TIPOS_NECESIDAD_PLAN_APOYO)[number];

// --- Anexo 2 (PIAR) ---

export const TIPOS_BARRERA = ['ACTITUDINAL', 'COMUNICATIVA', 'FISICA', 'PEDAGOGICA', 'SOCIAL_CONTEXTO', 'EVALUATIVA', 'ORGANIZATIVA'] as const;
export type TipoBarrera = (typeof TIPOS_BARRERA)[number];

/** Anexo 3 del formato (ejemplos de ajustes razonables) como categorías para clasificar cada ajuste. */
export const CATEGORIAS_AJUSTE = ['ACTIVIDADES', 'MATERIALES', 'ESPACIOS', 'COMUNICACION', 'APOYOS_HUMANOS', 'AYUDAS_TECNOLOGICAS', 'EVALUACION', 'OTRO'] as const;
export type CategoriaAjuste = (typeof CATEGORIAS_AJUSTE)[number];

export const EFECTIVIDAD_AJUSTE = ['MUY_EFECTIVO', 'PARCIALMENTE_EFECTIVO', 'NO_EFECTIVO', 'NO_APLICADO'] as const;
export type EfectividadAjuste = (typeof EFECTIVIDAD_AJUSTE)[number];

/** Filas "otras" de la tabla de ajustes del PIAR: las atiende el director de grupo con orientación. */
export const DIMENSIONES_TRANSVERSALES = ['SOCIALIZACION', 'PARTICIPACION', 'AUTONOMIA', 'AUTOCONTROL'] as const;
export type DimensionTransversal = (typeof DIMENSIONES_TRANSVERSALES)[number];

/** Plan de Mejoramiento Institucional del formato: matriz actores × acciones × estrategias. */
export const ACTORES_PMI = ['FAMILIA', 'DOCENTES', 'DIRECTIVOS', 'ADMINISTRATIVOS', 'PARES'] as const;
export type ActorPmi = (typeof ACTORES_PMI)[number];

export const FRECUENCIAS_COMPROMISO = ['DIARIA', 'SEMANAL', 'PERMANENTE'] as const;
export type FrecuenciaCompromiso = (typeof FRECUENCIAS_COMPROMISO)[number];

export const NIVELES_FORMACION_FAMILIAR = ['NINGUNO', 'PRIMARIA', 'BACHILLERATO', 'TECNICO', 'TECNOLOGO', 'UNIVERSITARIO'] as const;
export type NivelFormacionFamiliar = (typeof NIVELES_FORMACION_FAMILIAR)[number];

// --- Documentos que genera el sistema ---

export const CLAVES_DOCUMENTO_PIAR = ['ANEXO_INFO_GENERAL', 'PIAR_AJUSTES', 'ACTA_ACUERDO_FAMILIA', 'INFORME_ANUAL', 'ACTA_OFICIAL_PIAR', 'PLAN_APOYO'] as const;
export type ClaveDocumentoPiar = (typeof CLAVES_DOCUMENTO_PIAR)[number];

export interface DefinicionDocumentoPiar {
  clave: ClaveDocumentoPiar;
  nombre: string;
  /** Texto, no identificador: la numeración del anexo cambia según la fuente (MEN, secretarías). */
  numero_anexo: string | null;
  version_formato: string;
  prefijo: string;
  /** Lleva datos clínicos: solo orientación y ADMIN lo emiten y descargan. */
  confidencial: boolean;
  /** Firma institucional exclusiva del ADMIN (rector). */
  firma_admin: boolean;
  tipos_expediente: readonly TipoExpediente[];
}

/**
 * Punto de enganche para M21/M32: cuando exista el constructor de formatos, cada clave se personaliza desde allí.
 * M16 define QUÉ lleva cada documento; cómo se ve (logo, encabezado, textos) lo resolverá `encabezadoInstitucional`.
 */
export const DOCUMENTOS_PIAR: readonly DefinicionDocumentoPiar[] = [
  { clave: 'ANEXO_INFO_GENERAL', nombre: 'Información general del estudiante', numero_anexo: 'Anexo 1', version_formato: '1', prefijo: 'IG', confidencial: true, firma_admin: false, tipos_expediente: ['PIAR'] },
  { clave: 'PIAR_AJUSTES', nombre: 'Plan individual de ajustes razonables (PIAR)', numero_anexo: 'Anexo 2', version_formato: '1', prefijo: 'PIAR', confidencial: false, firma_admin: false, tipos_expediente: ['PIAR'] },
  { clave: 'ACTA_ACUERDO_FAMILIA', nombre: 'Acta de acuerdo con la familia', numero_anexo: 'Anexo 4', version_formato: '1', prefijo: 'AAF', confidencial: false, firma_admin: true, tipos_expediente: ['PIAR'] },
  { clave: 'INFORME_ANUAL', nombre: 'Informe anual de proceso pedagógico', numero_anexo: null, version_formato: '1', prefijo: 'IAP', confidencial: false, firma_admin: false, tipos_expediente: ['PIAR'] },
  { clave: 'ACTA_OFICIAL_PIAR', nombre: 'Acta oficial PIAR (paquete)', numero_anexo: null, version_formato: '1', prefijo: 'APIAR', confidencial: false, firma_admin: true, tipos_expediente: ['PIAR'] },
  { clave: 'PLAN_APOYO', nombre: 'Plan de apoyo pedagógico', numero_anexo: null, version_formato: '1', prefijo: 'PAP', confidencial: true, firma_admin: false, tipos_expediente: ['PLAN_APOYO'] },
];

export const definicionDocumento = (clave: ClaveDocumentoPiar): DefinicionDocumentoPiar =>
  DOCUMENTOS_PIAR.find((d) => d.clave === clave) as DefinicionDocumentoPiar;

export const ESTADOS_DOCUMENTO_PIAR = ['EMITIDO', 'FIRMADO', 'SUSTITUIDO'] as const;
export type EstadoDocumentoPiar = (typeof ESTADOS_DOCUMENTO_PIAR)[number];

export const ROLES_FIRMANTE = ['ACUDIENTE', 'ESTUDIANTE', 'DOCENTE', 'ORIENTADOR', 'DIRECTIVO'] as const;
export type RolFirmante = (typeof ROLES_FIRMANTE)[number];

// --- Archivos y límites ---

export const MAX_BYTES_SOPORTE = 5 * 1024 * 1024;
export const MAX_TEXTO_LARGO = 4000;
export const MAX_TEXTO_CORTO = 500;
export const MAX_SOPORTES_POR_EXPEDIENTE = 20;

/** Valores iniciales; el colegio los cambia en la configuración de inclusión (no hay valores quemados en las reglas). */
export const PLAZO_ELABORACION_DIAS_INICIAL = 90;
export const SEGUIMIENTOS_MINIMOS_INICIAL = 3;

export const DECLARACION_ESTABLECIMIENTO_INICIAL =
  'El establecimiento educativo ha realizado la valoración y definido los ajustes razonables que facilitarán al estudiante su proceso educativo.';
export const DECLARACION_FAMILIA_INICIAL =
  'La familia se compromete a cumplir y firmar los compromisos señalados en el PIAR y en las actas de acuerdo, para fortalecer los procesos escolares del estudiante y, en particular, a apoyar en casa con las siguientes actividades:';
export const VERSION_POLITICA_DATOS_INICIAL = '1';
