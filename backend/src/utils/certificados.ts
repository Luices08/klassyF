import { createHmac, randomBytes } from 'crypto';
import {
  ClaveCertificado,
  ELEMENTOS_AUTENTICACION,
  ETIQUETA_ELEMENTO,
  ElementoAutenticacion,
  ModoElemento,
  PoliticaDeCertificado,
} from '../constants/certificados';
import { serializacionEstable } from './comiteConvivencia';

/** Imagen ya guardada de una firma o sello: se nombra por su huella, así lo emitido siempre puede volver a imprimirse igual. */
export interface ImagenGuardada {
  hash: string;
  ext: string;
}

export interface FirmaPersona {
  aplicada: boolean;
  nombre: string | null;
  cargo: string;
  usuario_id: string | null;
  imagen: ImagenGuardada | null;
}

/** Lo que se congela al expedir: el PDF se dibuja SOLO desde aquí y la huella cubre todo, incluidas las firmas elegidas. */
export interface SnapshotCertificado {
  version_formato: 1;
  tipo: ClaveCertificado;
  encabezado: {
    institucion: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
    sede: string;
    jornada: string;
    anio: number | null;
  };
  estudiante: { nombre: string; apellido: string; tipo_documento: string; numero_documento: string };
  matricula: {
    estado: string;
    grado: string;
    grupo: string;
    anio: number | null;
    folio_matricula: string | null;
    numero_libro: number | null;
    numero_folio: number | null;
    fecha_matricula: string;
  };
  destinatario: string | null;
  fecha_expedicion: string;
  firmas: {
    rectoria: FirmaPersona;
    secretaria: FirmaPersona;
    sello: { aplicado: boolean; imagen: ImagenGuardada | null };
  };
}

// --- Huella y verificación ---

/**
 * Huella del documento: HMAC-SHA256 con un secreto del servidor (no de la base). Así quien edite la base directamente
 * no puede recalcular una huella coherente: sin la clave, el documento alterado deja de verificar.
 */
export function huellaDeCertificado(clave: string, contenido: { tipo: ClaveCertificado; codigo: string; snapshot: unknown }): string {
  return createHmac('sha256', clave).update(serializacionEstable({ tipo: contenido.tipo, codigo: contenido.codigo, snapshot: contenido.snapshot })).digest('hex');
}

/** Token opaco del QR (128 bits): no se deduce del consecutivo, así los certificados no se pueden enumerar. */
export const generarTokenVerificacion = (): string => randomBytes(16).toString('base64url');

/** La clave corta que se imprime en el pie y que acompaña al código para verificar sin QR. */
export const claveCorta = (huella: string): string => huella.slice(0, 12).toUpperCase();

export const compararClave = (a: string, b: string): boolean => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Muestra solo los últimos 3 caracteres del documento: quien verifica tiene el papel en la mano y lo compara. */
export function enmascararDocumento(documento: string): string {
  const limpio = documento.trim();
  return limpio.length <= 3 ? limpio : `${'•'.repeat(limpio.length - 3)}${limpio.slice(-3)}`;
}

// --- Switches de firmas y sellos ---

export interface EstadoDeElemento {
  /** Con qué valor aparece el switch al abrir la expedición. */
  valor_inicial: boolean;
  /** Obligatorio y disponible: el switch queda encendido y sin poderse apagar. */
  bloqueado: boolean;
  obligatorio: boolean;
  /** Hay imagen y quien expide puede aplicarla. */
  disponible: boolean;
  /** Por qué no está disponible (se muestra en el tooltip del switch). */
  motivo: string | null;
}

export function describirElemento(elemento: ElementoAutenticacion, modo: ModoElemento, tieneImagen: boolean, puedeAplicar: boolean): EstadoDeElemento {
  if (modo === 'NO_APLICA') return { valor_inicial: false, bloqueado: true, obligatorio: false, disponible: false, motivo: 'No aplica a este documento.' };
  let motivo: string | null = null;
  if (!tieneImagen) motivo = `Falta cargar la imagen de «${ETIQUETA_ELEMENTO[elemento]}» en Firmas y sellos.`;
  else if (!puedeAplicar) motivo = 'Solo el administrador puede aplicar la firma de Rectoría.';
  const disponible = motivo === null;
  const obligatorio = modo === 'OBLIGATORIO';
  return { valor_inicial: disponible && (obligatorio || modo === 'OPCIONAL_ENCENDIDO'), bloqueado: disponible && obligatorio, obligatorio, disponible, motivo };
}

export interface EntradaElementos {
  politica: PoliticaDeCertificado;
  tieneImagen: Record<ElementoAutenticacion, boolean>;
  puedeAplicar: Record<ElementoAutenticacion, boolean>;
}

export function estadoDeElementos(e: EntradaElementos): Record<ElementoAutenticacion, EstadoDeElemento> {
  return Object.fromEntries(
    ELEMENTOS_AUTENTICACION.map((el) => [el, describirElemento(el, e.politica[el], e.tieneImagen[el], e.puedeAplicar[el])])
  ) as Record<ElementoAutenticacion, EstadoDeElemento>;
}

/**
 * Decide qué se estampa a partir de lo que pidió quien expide y de la política del colegio. Lo no pedido toma el valor
 * inicial de la política; pedir algo que no aplica, no tiene imagen o no se puede aplicar es un error, nunca se ignora
 * en silencio; y apagar un elemento obligatorio también.
 */
export function resolverElementos(e: EntradaElementos, solicitado: Partial<Record<ElementoAutenticacion, boolean>>): { aplicados: Record<ElementoAutenticacion, boolean>; errores: string[] } {
  const errores: string[] = [];
  const estados = estadoDeElementos(e);
  const aplicados = {} as Record<ElementoAutenticacion, boolean>;
  for (const el of ELEMENTOS_AUTENTICACION) {
    const estado = estados[el];
    const pedido = solicitado[el];
    const etiqueta = ETIQUETA_ELEMENTO[el];
    if (e.politica[el] === 'NO_APLICA') {
      if (pedido === true) errores.push(`«${etiqueta}» no aplica a este documento.`);
      aplicados[el] = false;
    } else if (estado.obligatorio) {
      if (!estado.disponible) errores.push(`«${etiqueta}» es obligatoria en este documento y no está disponible: ${estado.motivo}`);
      else if (pedido === false) errores.push(`«${etiqueta}» es obligatoria en este documento.`);
      aplicados[el] = estado.disponible;
    } else if (pedido === true) {
      if (!estado.disponible) errores.push(`No se puede aplicar «${etiqueta}»: ${estado.motivo}`);
      aplicados[el] = estado.disponible;
    } else {
      aplicados[el] = pedido === false ? false : estado.valor_inicial;
    }
  }
  return { aplicados, errores };
}
