/**
 * Secretaría académica y certificados (M26). Los TIPOS de documento son datos (`TipoCertificado`): Secretaría y el ADMIN los crean,
 * editan, archivan y eliminan. Lo que hay aquí son los VALORES DE PARTIDA que se siembran una sola vez (como `POLITICA_INICIAL` o la
 * plantilla de planilla de M12) y los catálogos cerrados que el código sí necesita conocer (las fuentes de datos de otros módulos).
 * Los documentos se identifican por una clave estable.
 */
import { EstadoMatricula } from './enums';

/** Clave estable de un tipo de documento (`CONSTANCIA_ESTUDIO`, o la que se genera al crear uno nuevo). */
export type ClaveCertificado = string;
export const PATRON_CLAVE_CERTIFICADO = /^[A-Z0-9_]{2,40}$/;

/**
 * Datos que un documento toma de otro módulo y que el código sabe leer. El usuario solo ENCIENDE la capacidad en el tipo: nunca crea
 * datos (la plantilla los coloca, no los inventa). Una fuente nueva es una entrada aquí y su lectura en el servicio de expedición.
 * - VALORACIONES: la tabla de valoraciones finales y el concepto de promoción (M17/M19). Mientras la promoción no exista (M19), el
 *   documento solo admite vista previa: lo expedido se congela, así que no se emite oficial con un dato ausente.
 * - DEPENDENCIAS: la confirmación de «sin pendientes» en cada dependencia configurada del paz y salvo.
 */
export const FUENTES_CERTIFICADO = ['VALORACIONES', 'DEPENDENCIAS'] as const;
export type FuenteCertificado = (typeof FUENTES_CERTIFICADO)[number];
export const ETIQUETA_FUENTE: Record<FuenteCertificado, { nombre: string; descripcion: string }> = {
  VALORACIONES: { nombre: 'Valoraciones y promoción', descripcion: 'Incluye la tabla de notas finales y el concepto de promoción. Solo se expide con todas las notas definitivas.' },
  DEPENDENCIAS: { nombre: 'Dependencias (paz y salvo)', descripcion: 'Al expedir se confirma que no hay pendientes en cada dependencia activa.' },
};

/** Un tipo pasa por estos estados: BORRADOR (se redacta, no se expide) → ACTIVO (se ofrece) → ARCHIVADO (no se ofrece; lo expedido sigue verificándose). */
export const ESTADOS_TIPO_CERTIFICADO = ['BORRADOR', 'ACTIVO', 'ARCHIVADO'] as const;
export type EstadoTipoCertificado = (typeof ESTADOS_TIPO_CERTIFICADO)[number];

/** Estados de matrícula con los que tiene sentido expedir algo. */
export const ESTADOS_MATRICULA_EXPEDIBLES: EstadoMatricula[] = ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'];

export const MAX_TIPOS_CERTIFICADO = 40;
export const MAX_NOMBRE_TIPO = 80;
export const MAX_DESCRIPCION_TIPO = 200;
export const PATRON_PREFIJO_CERTIFICADO = /^[A-Z]{2,4}$/;

/**
 * Entidades que una opción del selector puede tomar de otro módulo en lugar de escribirse a mano. La plantilla no crea el dato: lo lee el
 * servicio y, si no existe (o no hay autorización para usarlo), la opción no se puede elegir y el mensaje dice por qué.
 * - EPS: la EPS que M03 tiene registrada del estudiante. Es un dato de salud (Ley 1581/2012, art. 5 y 6): solo se usa con la autorización
 *   del responsable legal registrada, solo su nombre (nunca el régimen) y solo cuando esa opción se elige.
 */
export const FUENTES_ENTIDAD = ['EPS'] as const;
export type FuenteEntidad = (typeof FUENTES_ENTIDAD)[number];
export const MARCA_ENTIDAD = '{entidad}';

/** Una opción del selector de destinatario o motivo. `frase` es el cierre del documento (sin la fecha); con `fuente_entidad` lleva `{entidad}`. */
export interface OpcionDestinatario {
  clave: string;
  etiqueta: string;
  frase: string;
  fuente_entidad?: FuenteEntidad | null;
}

export const CLAVE_DESTINATARIO_OTRO = 'OTRO';
export const ETIQUETA_DESTINATARIO_OTRO = 'Otro (especificar…)';

export interface DefinicionCertificado {
  clave: ClaveCertificado;
  nombre: string;
  /** Prefijo del consecutivo anual: `CE-2026-0001`. */
  prefijo: string;
  descripcion: string;
  /** Estados de matrícula con los que se puede expedir. */
  estados_matricula: EstadoMatricula[];
  /** Fuentes de datos de otros módulos que este documento usa (las enciende quien configura el tipo). */
  fuentes: FuenteCertificado[];
  /** Variables que la plantilla no puede perder (además de los mínimos que ya exigen las fuentes y la identificación del estudiante). */
  variables_obligatorias: string[];
  /** Qué se estampa por defecto y si se puede cambiar al expedir. */
  politica: PoliticaDeCertificado;
}

/** Un tipo sembrado al iniciar: además trae las opciones del selector de destinatario/motivo, que son de la plantilla. */
export interface TipoInicial extends DefinicionCertificado {
  /** Opciones del selector de destinatario/motivo; la primera es la predeterminada. «Otro» se agrega siempre al final. */
  destinatarios: OpcionDestinatario[];
  /** Cierre cuando eligen «Otro»: `{texto}` es lo que se escribió. */
  frase_otro: string;
}

export const A_QUIEN_INTERESE: OpcionDestinatario = { clave: 'A_QUIEN_INTERESE', etiqueta: 'A quien interese', frase: 'Se expide a quien interese' };
export const FRASE_OTRO_PREDETERMINADA = 'Se expide para presentar ante {texto}';

// --- Firmas y sellos ---

/** Lo que se puede estampar en el documento al expedirlo. El QR y la huella no son opcionales: no están aquí. */
export const ELEMENTOS_AUTENTICACION = ['rectoria', 'secretaria', 'sello'] as const;
export type ElementoAutenticacion = (typeof ELEMENTOS_AUTENTICACION)[number];

export const ETIQUETA_ELEMENTO: Record<ElementoAutenticacion, string> = {
  rectoria: 'Firma de Rectoría',
  secretaria: 'Firma de Secretaría Académica',
  sello: 'Sello institucional',
};

/**
 * Política del colegio para cada elemento en cada tipo de documento. `OPCIONAL_*` deja el switch libre en la expedición
 * (con ese valor de partida); `OBLIGATORIO` lo bloquea encendido; `NO_APLICA` lo bloquea apagado.
 */
export const MODOS_ELEMENTO = ['NO_APLICA', 'OPCIONAL_APAGADO', 'OPCIONAL_ENCENDIDO', 'OBLIGATORIO'] as const;
export type ModoElemento = (typeof MODOS_ELEMENTO)[number];

export type PoliticaDeCertificado = Record<ElementoAutenticacion, ModoElemento>;

/** La que recibe un tipo nuevo: la firma de Secretaría y el sello encendidos; la de Rectoría solo si se pide. El ADMIN la ajusta. */
export const POLITICA_PREDETERMINADA: PoliticaDeCertificado = { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' };

// --- Tipos de partida (se siembran una sola vez; después son datos que el colegio edita o elimina) ---

export const TIPOS_INICIALES: TipoInicial[] = [
  {
    clave: 'CONSTANCIA_ESTUDIO',
    nombre: 'Constancia de estudio',
    prefijo: 'CE',
    descripcion: 'Acredita que el estudiante está cursando el grado en el año lectivo.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'],
    fuentes: [],
    variables_obligatorias: [],
    politica: { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
    destinatarios: [
      A_QUIEN_INTERESE,
      { clave: 'CAJA_COMPENSACION', etiqueta: 'Caja de Compensación Familiar (subsidio)', frase: 'Se expide para presentar ante la Caja de Compensación Familiar, para el trámite del subsidio' },
      { clave: 'EPS', etiqueta: 'Entidad Promotora de Salud (EPS / ADRES)', frase: 'Se expide para presentar ante la Entidad Promotora de Salud (EPS) o la ADRES' },
      { clave: 'VISA_MIGRACION', etiqueta: 'Trámite de visa / migración', frase: 'Se expide para trámites de visa o ante las autoridades de migración' },
      { clave: 'PROCESO_JUDICIAL', etiqueta: 'Proceso judicial / Juzgado de Familia', frase: 'Se expide para presentar ante el juzgado o la autoridad judicial que lo requiera' },
    ],
    frase_otro: FRASE_OTRO_PREDETERMINADA,
  },
  {
    clave: 'CERTIFICADO_MATRICULA',
    nombre: 'Certificado de matrícula',
    prefijo: 'CM',
    descripcion: 'Certifica la matrícula con su folio del Libro de Matrícula.',
    // Un retirado conserva su folio (es un asiento del libro): el certificado dice que la matrícula fue retirada.
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    fuentes: [],
    variables_obligatorias: ['matricula.registro_libro', 'matricula.fecha'],
    politica: { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
    destinatarios: [A_QUIEN_INTERESE, { clave: 'LEGALIZACION_CUPO', etiqueta: 'Legalización de cupo / traslado', frase: 'Se expide para la legalización del cupo o el traslado del estudiante' }],
    frase_otro: FRASE_OTRO_PREDETERMINADA,
  },
  {
    clave: 'PAZ_SALVO',
    nombre: 'Paz y salvo',
    prefijo: 'PS',
    descripcion: 'Certifica que el estudiante no adeuda compromisos en las dependencias del colegio.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    fuentes: ['DEPENDENCIAS'],
    variables_obligatorias: [],
    politica: { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
    destinatarios: [
      { clave: 'RETIRO_TRASLADO', etiqueta: 'Retiro definitivo / Traslado de institución', frase: 'Se expide por retiro definitivo o traslado de institución' },
      { clave: 'GRADUACION', etiqueta: 'Graduación / Culminación de bachillerato (11°)', frase: 'Se expide para la graduación o culminación del bachillerato' },
      { clave: 'CIERRE_ANIO', etiqueta: 'Cierre regular de año lectivo', frase: 'Se expide por cierre regular del año lectivo' },
    ],
    frase_otro: 'Se expide por el siguiente motivo: {texto}',
  },
  {
    clave: 'CERTIFICADO_ESTUDIOS',
    nombre: 'Certificado de estudio (con notas)',
    prefijo: 'CS',
    descripcion: 'Certifica el grado cursado con sus valoraciones finales y el concepto de promoción.',
    // Las notas se leen del boletín (M17), que solo existe para matrículas activas.
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'],
    fuentes: ['VALORACIONES'],
    variables_obligatorias: [],
    // El documento maestro pide las firmas de Rector(a) y Secretario(a); el colegio puede volverlas OBLIGATORIO en Firmas y sellos.
    politica: { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
    destinatarios: [
      A_QUIEN_INTERESE,
      { clave: 'TRASLADO_INSTITUCION', etiqueta: 'Traslado de institución educativa', frase: 'Se expide para el traslado a otra institución educativa' },
      { clave: 'EDUCACION_SUPERIOR', etiqueta: 'Ingreso a educación superior / Universidad', frase: 'Se expide para el ingreso a la educación superior' },
      { clave: 'CONVALIDACION', etiqueta: 'Convalidación / Homologación de estudios', frase: 'Se expide para la convalidación u homologación de estudios' },
    ],
    frase_otro: FRASE_OTRO_PREDETERMINADA,
  },
];

/** Las claves de los tipos de partida no se reutilizan al crear uno nuevo (la plantilla de partida de cada una solo sirve a su tipo). */
export const CLAVES_TIPOS_INICIALES: readonly string[] = TIPOS_INICIALES.map((t) => t.clave);

export const codigoDeCertificado = (prefijo: string, anio: number, consecutivo: number): string => `${prefijo}-${anio}-${String(consecutivo).padStart(4, '0')}`;

// --- Imágenes de firma y sello ---

export const CARGO_RECTORIA_INICIAL = 'Rector(a)';
export const CARGO_SECRETARIA_INICIAL = 'Secretaría Académica';

export const MAX_BYTES_IMAGEN_AUTENTICACION = 500 * 1024;
export const TIPOS_IMAGEN_AUTENTICACION = ['image/png', 'image/jpeg'] as const;

export const ESTADOS_CERTIFICADO = ['VIGENTE', 'ANULADO'] as const;
export type EstadoCertificado = (typeof ESTADOS_CERTIFICADO)[number];

export const MAX_DESTINATARIO = 120;

// --- Quién solicita el documento (queda registrado, no se imprime) ---

/**
 * Quien pide el documento y a quien se entrega. Un certificado trae datos personales de un menor (Ley 1581/2012, art. 7; Ley 1098/2006):
 * saber a quién se entregó es parte de la trazabilidad. Lo que se pide depende del tipo de solicitante, no del documento.
 */
export const TIPOS_SOLICITANTE = ['ACUDIENTE', 'ESTUDIANTE', 'TERCERO', 'AUTORIDAD'] as const;
export type TipoSolicitante = (typeof TIPOS_SOLICITANTE)[number];
export const ETIQUETA_SOLICITANTE: Record<TipoSolicitante, string> = {
  ACUDIENTE: 'Acudiente vinculado',
  ESTUDIANTE: 'El mismo estudiante (mayor de edad)',
  TERCERO: 'Tercero con autorización',
  AUTORIDAD: 'Entidad o autoridad (con oficio)',
};
export const MAYORIA_DE_EDAD = 18;

// --- Paz y salvo: dependencias que el colegio configura (valores de partida) ---

export interface DependenciaPazYSalvo {
  clave: string;
  nombre: string;
  activa: boolean;
}

export const DEPENDENCIAS_PAZ_Y_SALVO_INICIALES: DependenciaPazYSalvo[] = [
  { clave: 'academica', nombre: 'Académica', activa: true },
  { clave: 'biblioteca', nombre: 'Biblioteca', activa: true },
  { clave: 'financiera', nombre: 'Financiera / Administrativa', activa: true },
  { clave: 'inventario', nombre: 'Inventario y recursos', activa: true },
];
export const MAX_DEPENDENCIAS_PAZ_Y_SALVO = 12;
export const MAX_NOMBRE_DEPENDENCIA = 60;
export const MAX_MOTIVO_ANULACION = 300;
