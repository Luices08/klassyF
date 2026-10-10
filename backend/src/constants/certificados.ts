/**
 * Secretaría académica y certificados (M26). Qué lleva cada documento y cómo se autentica salen de aquí y de
 * `ConfiguracionCertificados`; nada de esto está quemado en el servicio. Los documentos se identifican por clave.
 */
import { EstadoMatricula } from './enums';

export const CLAVES_CERTIFICADO = ['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA', 'PAZ_SALVO', 'CERTIFICADO_ESTUDIOS'] as const;
export type ClaveCertificado = (typeof CLAVES_CERTIFICADO)[number];

/**
 * Datos que un documento necesita de un módulo que aún no existe. Mientras la fuente no responda, el documento solo
 * admite vista previa: lo expedido se congela, así que no se emite oficial con un dato ausente (hay que anular y reexpedir).
 */
export type FuenteCertificado = 'PROMOCION';

/** Una opción del selector de destinatario o motivo. `frase` es el cierre del documento (sin la fecha). */
export interface OpcionDestinatario {
  clave: string;
  etiqueta: string;
  frase: string;
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
  /** Opciones del selector de destinatario/motivo; la primera es la predeterminada. «Otro» se agrega siempre al final. */
  destinatarios: OpcionDestinatario[];
  /** Cierre cuando eligen «Otro»: `{texto}` es lo que se escribió. */
  frase_otro: string;
  requiere?: FuenteCertificado[];
}

const A_QUIEN_INTERESE: OpcionDestinatario = { clave: 'A_QUIEN_INTERESE', etiqueta: 'A quien interese', frase: 'Se expide a quien interese' };

export const CERTIFICADOS: DefinicionCertificado[] = [
  {
    clave: 'CONSTANCIA_ESTUDIO',
    nombre: 'Constancia de estudio',
    prefijo: 'CE',
    descripcion: 'Acredita que el estudiante está cursando el grado en el año lectivo.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'],
    destinatarios: [
      A_QUIEN_INTERESE,
      { clave: 'CAJA_COMPENSACION', etiqueta: 'Caja de Compensación Familiar (subsidio)', frase: 'Se expide para presentar ante la Caja de Compensación Familiar, para el trámite del subsidio' },
      { clave: 'EPS', etiqueta: 'Entidad Promotora de Salud (EPS / ADRES)', frase: 'Se expide para presentar ante la Entidad Promotora de Salud (EPS) o la ADRES' },
      { clave: 'VISA_MIGRACION', etiqueta: 'Trámite de visa / migración', frase: 'Se expide para trámites de visa o ante las autoridades de migración' },
      { clave: 'PROCESO_JUDICIAL', etiqueta: 'Proceso judicial / Juzgado de Familia', frase: 'Se expide para presentar ante el juzgado o la autoridad judicial que lo requiera' },
    ],
    frase_otro: 'Se expide para presentar ante {texto}',
  },
  {
    clave: 'CERTIFICADO_MATRICULA',
    nombre: 'Certificado de matrícula',
    prefijo: 'CM',
    descripcion: 'Certifica la matrícula con su folio del Libro de Matrícula.',
    // Un retirado conserva su folio (es un asiento del libro): el certificado dice que la matrícula fue retirada.
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    destinatarios: [
      A_QUIEN_INTERESE,
      { clave: 'LEGALIZACION_CUPO', etiqueta: 'Legalización de cupo / traslado', frase: 'Se expide para la legalización del cupo o el traslado del estudiante' },
    ],
    frase_otro: 'Se expide para presentar ante {texto}',
  },
  {
    clave: 'PAZ_SALVO',
    nombre: 'Paz y salvo',
    prefijo: 'PS',
    descripcion: 'Certifica que el estudiante no adeuda compromisos en las dependencias del colegio.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
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
    destinatarios: [
      A_QUIEN_INTERESE,
      { clave: 'TRASLADO_INSTITUCION', etiqueta: 'Traslado de institución educativa', frase: 'Se expide para el traslado a otra institución educativa' },
      { clave: 'EDUCACION_SUPERIOR', etiqueta: 'Ingreso a educación superior / Universidad', frase: 'Se expide para el ingreso a la educación superior' },
      { clave: 'CONVALIDACION', etiqueta: 'Convalidación / Homologación de estudios', frase: 'Se expide para la convalidación u homologación de estudios' },
    ],
    frase_otro: 'Se expide para presentar ante {texto}',
    requiere: ['PROMOCION'],
  },
];

export const definicionCertificado = (clave: ClaveCertificado): DefinicionCertificado => {
  const def = CERTIFICADOS.find((c) => c.clave === clave);
  if (!def) throw new Error(`Tipo de certificado desconocido: ${clave}`);
  return def;
};

export const codigoDeCertificado = (clave: ClaveCertificado, anio: number, consecutivo: number): string =>
  `${definicionCertificado(clave).prefijo}-${anio}-${String(consecutivo).padStart(4, '0')}`;

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

export const POLITICA_INICIAL: Record<ClaveCertificado, PoliticaDeCertificado> = {
  CONSTANCIA_ESTUDIO: { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
  CERTIFICADO_MATRICULA: { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
  PAZ_SALVO: { rectoria: 'OPCIONAL_APAGADO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
  // El documento maestro pide las firmas de Rector(a) y Secretario(a); el colegio puede volverlas OBLIGATORIO en Firmas y sellos.
  CERTIFICADO_ESTUDIOS: { rectoria: 'OPCIONAL_ENCENDIDO', secretaria: 'OPCIONAL_ENCENDIDO', sello: 'OPCIONAL_ENCENDIDO' },
};

export const CARGO_RECTORIA_INICIAL = 'Rector(a)';
export const CARGO_SECRETARIA_INICIAL = 'Secretaría Académica';

// --- Imágenes de firma y sello ---

export const MAX_BYTES_IMAGEN_AUTENTICACION = 500 * 1024;
export const TIPOS_IMAGEN_AUTENTICACION = ['image/png', 'image/jpeg'] as const;

export const ESTADOS_CERTIFICADO = ['VIGENTE', 'ANULADO'] as const;
export type EstadoCertificado = (typeof ESTADOS_CERTIFICADO)[number];

export const MAX_DESTINATARIO = 120;

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
