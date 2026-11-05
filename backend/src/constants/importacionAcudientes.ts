/**
 * Importación masiva de acudientes (M03): cada fila une a UN estudiante, que ya debe existir, con UN acudiente. Un acudiente con varios hijos
 * repite sus datos en varias filas. Es un formato propio de Klassy (SIMAT no exporta acudientes); sus columnas siguen los nombres que usa SIMAT.
 */

export const MAX_BYTES_ACUDIENTES = 10 * 1024 * 1024;
export const MAX_FILAS_ACUDIENTES = 8000;
/** Una simulación sin aplicar se descarta sola: guarda datos personales de menores y de sus familias. */
export const DIAS_VIGENCIA_SIMULACION_ACUDIENTES = 7;
export const MINUTOS_RESERVA_LOTE_ACUDIENTES = 10;
export const SEGUNDOS_ENTRE_REVISIONES_ACUDIENTES = 30;
export const TELEFONO_SIN_DATO = 'Sin teléfono';

export const CLASIFICACIONES_ACUDIENTES = ['NUEVO', 'VINCULAR', 'SIN_CAMBIOS', 'ERROR'] as const;
export type ClasificacionAcudientes = (typeof CLASIFICACIONES_ACUDIENTES)[number];

export const ETIQUETA_CLASIFICACION_ACUDIENTES: Record<ClasificacionAcudientes, string> = {
  NUEVO: 'Acudiente nuevo',
  VINCULAR: 'Acudiente ya registrado',
  SIN_CAMBIOS: 'Ya vinculado',
  ERROR: 'Con errores',
};

/** Por qué una fila no se importa. Son claves estables: la pantalla muestra el texto tal cual. */
export const MOTIVOS_ACUDIENTES = {
  DOC_ESTUDIANTE_INVALIDO: 'El documento del estudiante falta o es inválido.',
  TIPO_DOC_ESTUDIANTE_NO_SOPORTADO: 'El tipo de documento del estudiante no existe en Klassy.',
  ESTUDIANTE_NO_EXISTE: 'No hay un estudiante con ese documento. Importa o crea primero al estudiante y vuelve a subir el archivo.',
  DOC_ESTUDIANTE_DE_OTRO_ROL: 'Ese documento pertenece a una persona del sistema que no es estudiante.',
  DOC_ACUDIENTE_INVALIDO: 'El documento del acudiente falta o es inválido (letras y números, de 3 a 20).',
  TIPO_DOC_ACUDIENTE_NO_SOPORTADO: 'El tipo de documento del acudiente no existe en Klassy (CC, CE, PEP, PPT, TI, RC, NES).',
  ACUDIENTE_ES_EL_ESTUDIANTE: 'El documento del acudiente es el mismo del estudiante.',
  ACUDIENTE_ES_ESTUDIANTE: 'El documento del acudiente pertenece a otro estudiante del colegio.',
  DATOS_INCOMPLETOS: 'Faltan el primer nombre o el primer apellido del acudiente.',
  PARENTESCO_FALTANTE: 'Falta el parentesco: es el vínculo legal con el estudiante y no se adivina.',
  PARENTESCO_INVALIDO: 'El parentesco no es uno de: MADRE, PADRE, ABUELO(A), TIO(A), HERMANO(A), TUTOR LEGAL, OTRO.',
  VALOR_INVALIDO: 'Una columna de SI/NO trae un valor que no se entiende.',
  FILA_REPETIDA: 'Este estudiante y este acudiente ya aparecen en otra fila del archivo.',
  DOS_PRINCIPALES: 'Dos acudientes del mismo estudiante están marcados como principal en el archivo.',
  ESTUDIANTE_INACTIVO: 'La cuenta del estudiante está inactiva.',
} as const;
export type MotivoAcudientes = keyof typeof MOTIVOS_ACUDIENTES;

/** Columnas que se leen por NOMBRE (no por posición), con los alias con que pueden llegar. Ver `normalizarEncabezadoSimat`. */
export const COLUMNAS_ACUDIENTES = {
  tipo_doc_estudiante: { alias: ['TIPODOCEST', 'TIPODOCESTUDIANTE', 'TIPODOCUMENTOESTUDIANTE', 'TIPODOCEST'], obligatoria: false },
  doc_estudiante: { alias: ['DOCEST', 'DOCESTUDIANTE', 'DOCUMENTOESTUDIANTE', 'NUMERODOCUMENTOESTUDIANTE', 'DOCUMENTOEST'], obligatoria: true },
  nombre_estudiante: { alias: ['NOMBREESTUDIANTE', 'NOMBREEST', 'ESTUDIANTE'], obligatoria: false },
  tipo_documento: { alias: ['TIPODOCACUDIENTE', 'TIPODOCACUD', 'TIPODOCUMENTOACUDIENTE'], obligatoria: false },
  documento: { alias: ['DOCACUDIENTE', 'DOCACUD', 'DOCUMENTOACUDIENTE', 'NUMERODOCUMENTOACUDIENTE'], obligatoria: true },
  apellido1: { alias: ['APELLIDO1', 'PRIMERAPELLIDO', 'APELLIDO1ACUDIENTE'], obligatoria: true },
  apellido2: { alias: ['APELLIDO2', 'SEGUNDOAPELLIDO', 'APELLIDO2ACUDIENTE'], obligatoria: false },
  nombre1: { alias: ['NOMBRE1', 'PRIMERNOMBRE', 'NOMBRE1ACUDIENTE'], obligatoria: true },
  nombre2: { alias: ['NOMBRE2', 'SEGUNDONOMBRE', 'NOMBRE2ACUDIENTE'], obligatoria: false },
  parentesco: { alias: ['PARENTESCO'], obligatoria: true },
  genero: { alias: ['GENERO', 'SEXO'], obligatoria: false },
  direccion: { alias: ['DIRECCION', 'DIRECCIONRESIDENCIA'], obligatoria: false },
  barrio: { alias: ['BARRIO', 'BARRIOVEREDA'], obligatoria: false },
  telefono: { alias: ['TELEFONO', 'CELULAR', 'TELEFONO1'], obligatoria: false },
  telefono2: { alias: ['TELEFONO2', 'TELCONTACTO', 'CELULAR2'], obligatoria: false },
  correo: { alias: ['CORREO', 'EMAIL', 'CORREOELECTRONICO'], obligatoria: false },
  nivel_educativo: { alias: ['NIVELEDUCATIVO'], obligatoria: false },
  ocupacion: { alias: ['OCUPACION', 'PROFESION'], obligatoria: false },
  es_principal: { alias: ['ESPRINCIPAL', 'PRINCIPAL', 'RESPONSABLE', 'RESPONSABLELEGAL'], obligatoria: false },
  autorizado_retiro: { alias: ['AUTORIZADORETIRO', 'AUTORIZADOPARARETIRAR', 'AUTORIZADORETIRAR'], obligatoria: false },
} as const;
export type ColumnaAcudientes = keyof typeof COLUMNAS_ACUDIENTES;

/** Columnas que se leen pero no se guardan: no hay dónde ponerlas (o ningún módulo las usa). */
export const COLUMNAS_ACUDIENTES_SIN_DESTINO: readonly ColumnaAcudientes[] = ['nivel_educativo'];

/** Los encabezados de la plantilla, en el orden en que conviene diligenciarla. */
export const ENCABEZADOS_PLANTILLA_ACUDIENTES = [
  'TIPODOC_EST',
  'DOC_EST',
  'NOMBRE_ESTUDIANTE',
  'TIPODOC_ACUDIENTE',
  'DOC_ACUDIENTE',
  'APELLIDO1',
  'APELLIDO2',
  'NOMBRE1',
  'NOMBRE2',
  'PARENTESCO',
  'GENERO',
  'DIRECCION',
  'BARRIO',
  'TELEFONO',
  'TELEFONO2',
  'CORREO',
  'OCUPACION',
  'ES_PRINCIPAL',
  'AUTORIZADO_RETIRO',
] as const;

/** Parentescos tal como los escribe SIMAT, con (A) cuando el género decide: ver `parentescoDeAcudiente`. */
export const PARENTESCOS_ARCHIVO = ['MADRE', 'PADRE', 'ABUELO(A)', 'TIO(A)', 'HERMANO(A)', 'TUTOR LEGAL', 'OTRO'] as const;
