import { createHmac, randomBytes } from 'crypto';
import {
  CLAVE_DESTINATARIO_OTRO,
  ClaveCertificado,
  ELEMENTOS_AUTENTICACION,
  ETIQUETA_DESTINATARIO_OTRO,
  ETIQUETA_ELEMENTO,
  ElementoAutenticacion,
  FuenteEntidad,
  MARCA_ENTIDAD,
  MAYORIA_DE_EDAD,
  ModoElemento,
  OpcionDestinatario,
  PoliticaDeCertificado,
  TipoSolicitante,
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

export interface BloqueResuelto {
  estilo: 'PREAMBULO' | 'FORMULA' | 'CUERPO' | 'DESTACADO' | 'TABLA_NOTAS';
  texto: string;
}

export interface ContenidoResuelto {
  /** Qué versión de la plantilla produjo este texto (para saber de dónde salió; el texto ya está aquí, congelado). */
  plantilla: { version: number; hash: string };
  titulo: string;
  bloques: BloqueResuelto[];
  vigencia_dias: number | null;
}

/** Una fila de la tabla de valoraciones: las celdas ya vienen como texto, M26 no interpreta su contenido. */
export interface FilaValoracion {
  nivel: 'AREA' | 'ASIGNATURA';
  celdas: string[];
}

/**
 * La tabla de valoraciones del certificado de estudio, ya armada. Cómo se presenta (qué columnas, si se ven áreas o asignaturas,
 * los decimales) lo decide quien la entrega (el boletín final de M17 y la escala de cada institución, M05); M26 solo la dibuja y
 * la congela en el documento.
 */
export interface TablaValoraciones {
  columnas: string[];
  filas: FilaValoracion[];
  /** Leyenda al pie de la tabla. */
  pie: string;
}

export interface DatosEstudios {
  tabla: TablaValoraciones;
  /** Todas las asignaturas tienen sus periodos definitivos. */
  completo: boolean;
  /** null mientras no exista la fuente (M19): sin él el documento no se expide como oficial. */
  promocion: { concepto: 'APROBO' | 'NO_APROBO' } | null;
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
    ciudad?: string | null;
    departamento?: string | null;
    /** El escudo con el que se expidió (M01 `logo_url`, guardado por su huella). Ausente en documentos anteriores. */
    escudo?: ImagenGuardada | null;
  };
  estudiante: { nombre: string; apellido: string; tipo_documento: string; numero_documento: string; lugar_expedicion?: string | null };
  /** Responsable legal que formalizó la matrícula (M03). Solo lo lleva el certificado de matrícula. */
  acudiente?: { nombre: string; tipo_documento: string; numero_documento: string; parentesco: string } | null;
  matricula: {
    estado: string;
    grado: string;
    grupo: string;
    anio: number | null;
    folio_matricula: string | null;
    numero_libro: number | null;
    numero_folio: number | null;
    fecha_matricula: string;
    /** Nivel del grado (M01), condición de ingreso (M04) y horario de la jornada (M01): ausentes en documentos anteriores. */
    nivel?: string;
    tipo_ingreso?: string;
    horario?: { inicio: string; fin: string };
  };
  /** Etiqueta del destinatario o motivo elegido (texto escrito, si fue «Otro»). Los documentos anteriores al selector guardan aquí texto libre. */
  destinatario: string | null;
  /** Cierre ya resuelto desde el selector. Ausente en documentos anteriores: el texto lo reconstruye desde `destinatario`. */
  destino?: { clave: string; frase: string };
  fecha_expedicion: string;
  /** El texto ya resuelto desde la plantilla vigente al expedir: el PDF se dibuja desde aquí. Ausente en documentos anteriores a las plantillas. */
  contenido?: ContenidoResuelto;
  /** Solo paz y salvo: las dependencias que se confirmaron sin pendientes y quién lo verificó. */
  paz_y_salvo?: { dependencias: string[]; verificado_por: string };
  /** Solo certificado de estudio: la malla con las valoraciones y, cuando exista M19, el concepto de promoción. */
  estudios?: DatosEstudios;
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

export function describirElemento(elemento: ElementoAutenticacion, modo: ModoElemento, tieneImagen: boolean, puedeAplicar: boolean, tieneFirmante = true): EstadoDeElemento {
  if (modo === 'NO_APLICA') return { valor_inicial: false, bloqueado: true, obligatorio: false, disponible: false, motivo: 'No aplica a este documento.' };
  let motivo: string | null = null;
  // Una firma sin firmante saldría sin nombre: primero se designa quién firma.
  if (!tieneFirmante) motivo = `Falta designar quién firma como «${ETIQUETA_ELEMENTO[elemento]}» en Firmas y sellos.`;
  else if (!tieneImagen) motivo = `Falta cargar la imagen de «${ETIQUETA_ELEMENTO[elemento]}» en Firmas y sellos.`;
  else if (!puedeAplicar) motivo = 'Solo el administrador puede aplicar la firma de Rectoría.';
  const disponible = motivo === null;
  const obligatorio = modo === 'OBLIGATORIO';
  return { valor_inicial: disponible && (obligatorio || modo === 'OPCIONAL_ENCENDIDO'), bloqueado: disponible && obligatorio, obligatorio, disponible, motivo };
}

export interface EntradaElementos {
  politica: PoliticaDeCertificado;
  tieneImagen: Record<ElementoAutenticacion, boolean>;
  puedeAplicar: Record<ElementoAutenticacion, boolean>;
  /** Si se omite, se asume que todos tienen firmante (el sello no tiene). */
  tieneFirmante?: Record<ElementoAutenticacion, boolean>;
}

export function estadoDeElementos(e: EntradaElementos): Record<ElementoAutenticacion, EstadoDeElemento> {
  return Object.fromEntries(
    ELEMENTOS_AUTENTICACION.map((el) => [el, describirElemento(el, e.politica[el], e.tieneImagen[el], e.puedeAplicar[el], e.tieneFirmante?.[el] ?? true)])
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

// --- Destinatario o motivo ---

export interface DestinoResuelto {
  clave: string;
  etiqueta: string;
  frase: string;
}

/** Por qué no se puede usar una opción que toma la entidad de otro módulo. */
const SIN_ENTIDAD: Record<FuenteEntidad, string> = {
  EPS: 'El estudiante no tiene una EPS registrada con la autorización de datos sensibles (M03): elige «Otro» y escribe la entidad.',
};

/** Lo que el servicio leyó de otros módulos para las opciones que toman la entidad de ahí (vacío = no hay dato o no hay autorización). */
export type EntidadesDisponibles = Partial<Record<FuenteEntidad, string | null>>;

export const motivoSinEntidad = (fuente: FuenteEntidad): string => SIN_ENTIDAD[fuente];

/**
 * Convierte lo elegido en el selector en el texto que queda congelado. Sin nada, o con «Otro» sin texto, se asume la
 * opción predeterminada del documento («A quien interese»). Una clave que no es de ese documento es un error, no se ignora.
 */
export function resolverDestinatario(
  def: { nombre: string; destinatarios: OpcionDestinatario[]; frase_otro: string },
  solicitado: { clave?: string | null; otro?: string | null } | null | undefined,
  entidades: EntidadesDisponibles = {}
): DestinoResuelto | { error: string; sin_dato?: boolean } {
  const predeterminada = def.destinatarios[0] as (typeof def.destinatarios)[number];
  const clave = solicitado?.clave?.trim() || predeterminada.clave;
  const otro = solicitado?.otro?.trim() ?? '';
  if (clave === CLAVE_DESTINATARIO_OTRO) {
    if (!otro) return predeterminada;
    return { clave, etiqueta: otro, frase: def.frase_otro.replace('{texto}', otro) };
  }
  const opcion = def.destinatarios.find((o) => o.clave === clave);
  if (!opcion) return { error: `«${clave}» no es un destinatario válido para «${def.nombre}».` };
  if (opcion.fuente_entidad) {
    const entidad = entidades[opcion.fuente_entidad]?.trim();
    if (!entidad) return { error: SIN_ENTIDAD[opcion.fuente_entidad], sin_dato: true };
    return { clave: opcion.clave, etiqueta: entidad, frase: opcion.frase.replace(MARCA_ENTIDAD, entidad) };
  }
  return { clave: opcion.clave, etiqueta: opcion.etiqueta, frase: opcion.frase };
}

/** Lo que ve el selector: las opciones del documento y, al final, «Otro». */
export const opcionesDeDestinatario = (def: { destinatarios: OpcionDestinatario[] }): Array<{ clave: string; etiqueta: string; fuente_entidad: FuenteEntidad | null }> => [
  ...def.destinatarios.map(({ clave, etiqueta, fuente_entidad }) => ({ clave, etiqueta, fuente_entidad: fuente_entidad ?? null })),
  { clave: CLAVE_DESTINATARIO_OTRO, etiqueta: ETIQUETA_DESTINATARIO_OTRO, fuente_entidad: null },
];

// --- Quién solicita el documento ---

export interface EntradaSolicitante {
  tipo: TipoSolicitante;
  /** Solo acudiente: el vínculo se comprueba contra los acudientes del estudiante. */
  guardian_id?: string | null;
  nombre?: string | null;
  tipo_documento?: string | null;
  numero_documento?: string | null;
  /** Relación con el estudiante (tercero) o número de oficio (autoridad). */
  detalle?: string | null;
  /** Tercero: confirma que presentó la autorización escrita y su documento de identidad. */
  presento_autorizacion?: boolean;
}

export interface AcudienteVinculado {
  guardian_id: string;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  parentesco: string;
}

export interface SolicitanteResuelto {
  tipo: TipoSolicitante;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  detalle: string | null;
  guardian_id: string | null;
}

/** Edad cumplida en una fecha (hora de Colombia): quien cumple 18 hoy ya es mayor de edad. */
export function esMayorDeEdad(fechaNacimiento: Date, ahora: Date = new Date()): boolean {
  const aCo = (f: Date) => f.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-').map(Number) as [number, number, number];
  const [ay, am, ad] = aCo(ahora);
  const [ny, nm, nd] = [fechaNacimiento.getUTCFullYear(), fechaNacimiento.getUTCMonth() + 1, fechaNacimiento.getUTCDate()];
  const edad = ay - ny - (am < nm || (am === nm && ad < nd) ? 1 : 0);
  return edad >= MAYORIA_DE_EDAD;
}

const texto = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * Valida a quien se entrega el documento. Función pura: el servicio le pasa lo que leyó de M03. Cada tipo de solicitante exige lo
 * suyo y pedir algo que no corresponde es un error, no se ignora: el acudiente tiene que estar vinculado al estudiante, el propio
 * estudiante tiene que ser mayor de edad, un tercero presenta autorización y una autoridad, su oficio.
 */
export function resolverSolicitante(
  entrada: EntradaSolicitante | null | undefined,
  contexto: { acudientes: AcudienteVinculado[]; estudiante: { nombre: string; tipo_documento: string; numero_documento: string; mayor_de_edad: boolean } }
): SolicitanteResuelto | { error: string } {
  if (!entrada) return { error: 'Indica quién solicita el documento: el acudiente, el propio estudiante (si es mayor de edad), un tercero con autorización o una autoridad.' };
  switch (entrada.tipo) {
    case 'ACUDIENTE': {
      const acudiente = contexto.acudientes.find((a) => a.guardian_id === entrada.guardian_id);
      if (!acudiente) return { error: 'El acudiente elegido no está vinculado a este estudiante (o está inactivo). Si no es su acudiente, regístralo como tercero con autorización.' };
      return { tipo: 'ACUDIENTE', nombre: acudiente.nombre, tipo_documento: acudiente.tipo_documento, numero_documento: acudiente.numero_documento, detalle: acudiente.parentesco, guardian_id: acudiente.guardian_id };
    }
    case 'ESTUDIANTE': {
      if (!contexto.estudiante.mayor_de_edad) return { error: 'Un estudiante menor de edad no solicita sus propios documentos: los pide su acudiente.' };
      const e = contexto.estudiante;
      return { tipo: 'ESTUDIANTE', nombre: e.nombre, tipo_documento: e.tipo_documento, numero_documento: e.numero_documento, detalle: null, guardian_id: null };
    }
    case 'TERCERO': {
      if (texto(entrada.nombre).length < 3 || texto(entrada.numero_documento).length < 3 || texto(entrada.detalle).length < 3) {
        return { error: 'Un tercero se identifica con su nombre, su documento y su relación con el estudiante.' };
      }
      if (entrada.presento_autorizacion !== true) return { error: 'Confirma que el tercero presentó la autorización escrita del acudiente y su documento de identidad.' };
      return { tipo: 'TERCERO', nombre: texto(entrada.nombre), tipo_documento: texto(entrada.tipo_documento) || null, numero_documento: texto(entrada.numero_documento), detalle: texto(entrada.detalle), guardian_id: null };
    }
    case 'AUTORIDAD': {
      if (texto(entrada.nombre).length < 3 || texto(entrada.detalle).length < 2) return { error: 'Una autoridad se identifica con el nombre de la entidad y el número de su oficio.' };
      return { tipo: 'AUTORIDAD', nombre: texto(entrada.nombre), tipo_documento: null, numero_documento: null, detalle: texto(entrada.detalle), guardian_id: null };
    }
  }
}

// --- Vigencia ---

export interface VigenciaDeDocumento {
  dias: number | null;
  /** Último instante en que el documento está vigente (fin de ese día, hora de Colombia); null si no tiene vigencia. */
  hasta: string | null;
  vencida: boolean;
}

/**
 * Hasta cuándo vale un documento que declara «vigencia de N días calendario a partir de su expedición». Los días se cuentan en hora
 * de Colombia y el último día vale hasta su cierre. Un documento sin vigencia (o anterior a las plantillas) no vence.
 */
export function vigenciaDeDocumento(snapshot: Pick<SnapshotCertificado, 'fecha_expedicion' | 'contenido'>, ahora: Date = new Date()): VigenciaDeDocumento {
  const dias = snapshot.contenido?.vigencia_dias ?? null;
  if (!dias) return { dias: null, hasta: null, vencida: false };
  const [y, m, d] = new Date(snapshot.fecha_expedicion).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-').map(Number) as [number, number, number];
  // Fin del día (23:59:59.999 en UTC-5) del último día de vigencia.
  const hasta = new Date(Date.UTC(y, m - 1, d + dias, 23, 59, 59, 999) + 5 * 60 * 60 * 1000);
  return { dias, hasta: hasta.toISOString(), vencida: ahora.getTime() > hasta.getTime() };
}
