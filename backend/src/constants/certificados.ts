/**
 * Secretaría académica y certificados (M26). Qué lleva cada documento y cómo se autentica salen de aquí y de
 * `ConfiguracionCertificados`; nada de esto está quemado en el servicio. Los documentos se identifican por clave.
 */
import { EstadoMatricula } from './enums';

export const CLAVES_CERTIFICADO = ['CONSTANCIA_ESTUDIO', 'CERTIFICADO_MATRICULA'] as const;
export type ClaveCertificado = (typeof CLAVES_CERTIFICADO)[number];

export interface DefinicionCertificado {
  clave: ClaveCertificado;
  nombre: string;
  /** Prefijo del consecutivo anual: `CE-2026-0001`. */
  prefijo: string;
  descripcion: string;
  /** Estados de matrícula con los que se puede expedir. */
  estados_matricula: EstadoMatricula[];
}

export const CERTIFICADOS: DefinicionCertificado[] = [
  {
    clave: 'CONSTANCIA_ESTUDIO',
    nombre: 'Constancia de estudio',
    prefijo: 'CE',
    descripcion: 'Acredita que el estudiante está cursando el grado en el año lectivo.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'],
  },
  {
    clave: 'CERTIFICADO_MATRICULA',
    nombre: 'Certificado de matrícula',
    prefijo: 'CM',
    descripcion: 'Certifica la matrícula con su folio del Libro de Matrícula.',
    // Un retirado conserva su folio (es un asiento del libro): el certificado dice que la matrícula fue retirada.
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
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
};

export const CARGO_RECTORIA_INICIAL = 'Rector(a)';
export const CARGO_SECRETARIA_INICIAL = 'Secretaría Académica';

// --- Imágenes de firma y sello ---

export const MAX_BYTES_IMAGEN_AUTENTICACION = 500 * 1024;
export const TIPOS_IMAGEN_AUTENTICACION = ['image/png', 'image/jpeg'] as const;

export const ESTADOS_CERTIFICADO = ['VIGENTE', 'ANULADO'] as const;
export type EstadoCertificado = (typeof ESTADOS_CERTIFICADO)[number];

export const MAX_DESTINATARIO = 120;
export const MAX_MOTIVO_ANULACION = 300;
