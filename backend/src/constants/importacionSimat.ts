import { Jornada } from './enums';

/** Importación masiva de matrículas desde el archivo plano que SIMAT exporta (M04). Análisis: doc/Analisis_Importacion_SIMAT_Klassy.md */

export const FORMATOS_SIMAT = ['xlsx', 'csv', 'txt'] as const;
export type FormatoSimat = (typeof FORMATOS_SIMAT)[number];

export const MAX_BYTES_SIMAT = 25 * 1024 * 1024;
/** Filas de la propia institución; las de otras instituciones (el archivo de la ETC trae todas) no cuentan ni se guardan. */
export const MAX_FILAS_SIMAT = 8000;
export const DIAS_COMPROMISO_POR_DEFECTO = 30;
export const CUPO_POR_DEFECTO_GRUPO = 40;
/** Una simulación sin aplicar se descarta sola: guarda datos de menores que no deben quedar esperando. */
export const DIAS_VIGENCIA_SIMULACION = 7;
export const MINUTOS_RESERVA_LOTE = 10;
export const SEGUNDOS_ENTRE_REVISIONES_LOTE = 30;

export const ESTADOS_LOTE_SIMAT = ['SIMULADO', 'EN_COLA', 'APLICANDO', 'APLICADO', 'FALLIDO', 'DESCARTADO'] as const;
export type EstadoLoteSimat = (typeof ESTADOS_LOTE_SIMAT)[number];

/** Lo que el sistema decide de cada fila ANTES de escribir nada. */
export const CLASIFICACIONES_SIMAT = ['NUEVO', 'ANTIGUO', 'OMITIDA', 'CONFLICTO', 'ERROR'] as const;
export type ClasificacionSimat = (typeof CLASIFICACIONES_SIMAT)[number];

export const ETIQUETA_CLASIFICACION: Record<ClasificacionSimat, string> = {
  NUEVO: 'Estudiante nuevo',
  ANTIGUO: 'Ya registrado',
  OMITIDA: 'Omitida',
  CONFLICTO: 'Requiere decisión',
  ERROR: 'Con errores',
};

/** Por qué una fila no se importa (o se importa con reservas). Son claves estables: la pantalla las muestra tal cual. */
export const MOTIVOS_SIMAT = {
  ESTADO_NO_MATRICULADO: 'En SIMAT no figura como matriculado.',
  RETIRADO_EN_SIMAT: 'En SIMAT figura retirado: no se matricula. Si en Klassy sigue matriculado, es una diferencia por revisar.',
  GRADO_NO_SOPORTADO: 'El grado (ciclos de jóvenes y adultos o aceleración) aún no está soportado en Klassy.',
  GRADO_SIN_CATALOGO: 'El grado no existe o está inactivo en el catálogo de grados de Klassy.',
  JORNADA_NO_SOPORTADA: 'La jornada de SIMAT no tiene equivalente en Klassy.',
  JORNADA_SIN_CONFIGURAR: 'La sede no tiene configurada esa jornada en Klassy.',
  SEDE_NO_REGISTRADA: 'La sede (código DANE) no está registrada en Klassy.',
  SEDE_SIN_ACCESO: 'La sede no está entre las que el usuario tiene asignadas.',
  TIPO_DOCUMENTO_NO_SOPORTADO: 'El tipo de documento no existe en Klassy.',
  DOCUMENTO_INVALIDO: 'El número de documento es inválido.',
  DOCUMENTO_REPETIDO: 'El documento aparece más de una vez en el archivo.',
  DATOS_INCOMPLETOS: 'Faltan datos obligatorios (nombres, apellido o fecha de nacimiento).',
  FECHA_INVALIDA: 'Una fecha no es válida.',
  DOCUMENTO_DE_OTRO_ROL: 'El documento pertenece a otra persona del sistema que no es estudiante.',
  POSIBLE_DUPLICADO: 'Hay un estudiante con el mismo nombre y fecha de nacimiento y distinto documento: revisar antes de crear otro.',
  CAMBIO_DE_DOCUMENTO: 'El identificador SIMAT ya está en Klassy con otro documento: revisar el cambio de tipo o número de documento.',
  REINGRESO_SIN_AUTORIZAR: 'Estaba retirado o inactivo en Klassy: reincorporarlo es una decisión explícita.',
  MATRICULA_EN_OTRO_GRUPO: 'Ya tiene matrícula este año en otro grupo distinto al de SIMAT.',
  MATRICULA_RETIRADA: 'Su matrícula de este año figura retirada en Klassy.',
  GRUPO_SIN_CUPO: 'El grupo no tiene cupo disponible.',
  GRUPO_NO_SE_PUDO_CREAR: 'No se pudo crear el grupo.',
  ESTUDIANTE_INACTIVO: 'La cuenta del estudiante está inactiva.',
} as const;
export type MotivoSimat = keyof typeof MOTIVOS_SIMAT;

/** Columnas que se leen por NOMBRE (no por posición) con los alias con que han aparecido. Ver `normalizarEncabezadoSimat`. */
export const COLUMNAS_SIMAT = {
  ano: { alias: ['ANO', 'AÑO', 'VIGENCIA'], obligatoria: true },
  estado: { alias: ['ESTADO'], obligatoria: true },
  dane: { alias: ['DANE', 'DANEESTABLECIMIENTO', 'CODIGODANE', 'DANEINSTITUCION'], obligatoria: true },
  institucion: { alias: ['INSTITUCION', 'ESTABLECIMIENTO'], obligatoria: false },
  sede: { alias: ['SEDE', 'NOMBRESEDE'], obligatoria: false },
  dane_sede: { alias: ['CODIGODANESEDE', 'DANESEDE', 'CODDANESEDE'], obligatoria: true },
  jornada: { alias: ['JORNADA'], obligatoria: true },
  grado: { alias: ['GRADOCOD', 'GRADO', 'CODIGOGRADO'], obligatoria: true },
  grupo: { alias: ['GRUPO'], obligatoria: true },
  modelo: { alias: ['MODELO'], obligatoria: false },
  fecha_inicio: { alias: ['FECHAINI', 'FECHAINICIO', 'FECHAMATRICULA'], obligatoria: false },
  nui: { alias: ['NUI'], obligatoria: false },
  per_id: { alias: ['PERID', 'IDPERSONA'], obligatoria: false },
  documento: { alias: ['DOC', 'DOCUMENTO', 'NUMERODOCUMENTO', 'NUMDOC'], obligatoria: true },
  tipo_documento: { alias: ['TIPODOC', 'TIPODOCUMENTO'], obligatoria: true },
  apellido1: { alias: ['APELLIDO1', 'PRIMERAPELLIDO'], obligatoria: true },
  apellido2: { alias: ['APELLIDO2', 'SEGUNDOAPELLIDO'], obligatoria: false },
  nombre1: { alias: ['NOMBRE1', 'PRIMERNOMBRE'], obligatoria: true },
  nombre2: { alias: ['NOMBRE2', 'SEGUNDONOMBRE'], obligatoria: false },
  genero: { alias: ['GENERO', 'SEXO'], obligatoria: false },
  fecha_nacimiento: { alias: ['FECHANACIMIENTO', 'FECHANAC'], obligatoria: true },
  barrio: { alias: ['BARRIO', 'BARRIOVEREDA'], obligatoria: false },
  eps: { alias: ['EPS'], obligatoria: false },
  tipo_sangre: { alias: ['TIPODESANGRE', 'TIPOSANGRE', 'RH', 'GRUPOSANGUINEO'], obligatoria: false },
  estrato: { alias: ['ESTRATO'], obligatoria: false },
  sisben: { alias: ['SISBENIV', 'SISBEN'], obligatoria: false },
  discapacidad: { alias: ['DISCAPACIDAD'], obligatoria: false },
  trastornos: { alias: ['TRAESPAPRESCOLAR', 'TRASTORNOSAPRENDIZAJE'], obligatoria: false },
  talentos: { alias: ['LISTCAPEXCEPCIONALES', 'CAPACIDADESEXCEPCIONALES'], obligatoria: false },
  pais_origen: { alias: ['PAISORIGEN'], obligatoria: false },
  pais_nacimiento: { alias: ['PAISNACIMIENTO'], obligatoria: false },
  nacionalidad2: { alias: ['PAISNACIONALIDAD2', 'NACIONALIDAD2'], obligatoria: false },
  correo: { alias: ['CORREO', 'EMAIL', 'CORREOELECTRONICO'], obligatoria: false },
  telefono: { alias: ['TELEFONO', 'CELULAR'], obligatoria: false },
  etnia: { alias: ['ETNIA'], obligatoria: false },
} as const;
export type ColumnaSimat = keyof typeof COLUMNAS_SIMAT;

/**
 * Columnas de SIMAT que NO se leen jamás aunque estén en el archivo: el Sistema de Responsabilidad Penal para Adolescentes es un dato
 * reservado (Ley 1098 de 2006). No hay alias en `COLUMNAS_SIMAT` y por eso nada de eso entra a memoria, a la base ni al informe.
 */
export const COLUMNAS_SIMAT_IGNORADAS_A_PROPOSITO = ['HAESTADOVINCULADOSRPA', 'ESTAACTIVOSRPA'] as const;

/** Equivalencia de jornadas (clave normalizada sin tildes ni espacios). `COMPLETA` no tiene equivalente: ver MOTIVOS_SIMAT. */
export const JORNADA_SIMAT: Record<string, Jornada> = {
  MANANA: 'MANANA',
  TARDE: 'TARDE',
  UNICA: 'UNICA',
  NOCTURNA: 'NOCTURNA',
  FINDESEMANA: 'SABATINA',
  SABATINA: 'SABATINA',
};

/** Códigos de grado que Klassy puede representar (`Grade.numero`). SIMAT usa además 21–26 (ciclos) y 99 (aceleración): fuera de alcance por ahora. */
export const GRADO_MIN_SOPORTADO = -2;
export const GRADO_MAX_SOPORTADO = 11;

/** Discapacidad según SIMAT -> condición PIAR sembrada en M16 (`CONDICIONES_INICIALES`). Solo informativo para el motivo declarado. */
export const CONDICION_POR_DISCAPACIDAD_SIMAT: Record<string, string> = {
  VISUALBAJAVISIONIRREVERSIBLE: 'VISUAL_BAJA_VISION',
  DISCAPACIDADVISUALBAJAVISIONIRREVERSIBLE: 'VISUAL_BAJA_VISION',
  VISUALCEGUERA: 'VISUAL_CEGUERA',
  DISCAPACIDADVISUALCEGUERA: 'VISUAL_CEGUERA',
  TRASTORNODELESPECTROAUTISTA: 'TEA',
  DISCAPACIDADINTELECTUAL: 'INTELECTUAL',
  DISCAPACIDADMULTIPLE: 'MULTIPLE',
  DISCAPACIDADAUDITIVAUSUARIODELENGUADESENASCOLOMBIANA: 'AUDITIVA_SORDERA',
  DISCAPACIDADAUDITIVAUSUARIOLENGUADESENASCOLOMBIANA: 'AUDITIVA_SORDERA',
  DISCAPACIDADAUDITIVAUSUARIODELCASTELLANO: 'AUDITIVA_HIPOACUSIA',
  SORDOCEGUERA: 'SORDOCEGUERA',
  DISCAPACIDADFISICA: 'FISICA',
  DISCAPACIDADPSICOSOCIALMENTAL: 'PSICOSOCIAL',
};

/** Campos del perfil que la importación puede actualizar sin preguntar (nunca borran un dato con un vacío de SIMAT). */
export const CAMPOS_SINCRONIZABLES = [
  'telefono',
  'barrio_vereda',
  'eps',
  'rh',
  'estrato',
  'sisben_grupo',
  'grupo_etnico',
  'etnia_detalle',
  'pais_origen',
  'pais_nacimiento',
  'nacionalidad_2',
  'correo_contacto',
  'simat_per_id',
  'simat_nui',
  'tiene_discapacidad',
  'tiene_talento_excepcional',
] as const;
export type CampoSincronizable = (typeof CAMPOS_SINCRONIZABLES)[number];

/** Datos de identidad: si SIMAT difiere, NO se sobrescribe (afecta certificados y diplomas); se informa. */
export const CAMPOS_DE_IDENTIDAD = ['nombres', 'apellidos', 'fecha de nacimiento', 'género'] as const;

export const AUTORIZACION_SALUD_SIMAT =
  'Autorización de matrícula declarada por el colegio al importar desde SIMAT (Ley 1581 de 2012, art. 6)';
