import { GrupoEtnico, GrupoSanguineo, GRUPOS_SANGUINEOS, Jornada, TipoDocumento } from '../constants/enums';
import {
  CAMPOS_DE_IDENTIDAD,
  COLUMNAS_SIMAT,
  ColumnaSimat,
  GRADO_MAX_SOPORTADO,
  GRADO_MIN_SOPORTADO,
  JORNADA_SIMAT,
} from '../constants/importacionSimat';
import { normalizarGrupoSisben } from '../constants/sisben';
import { claveDeNombre } from './importacion';

/**
 * Lectura y normalización del archivo plano de SIMAT. Todo lo de aquí es puro (sin base de datos) para poder probarlo con casos sintéticos:
 * el archivo real trae documentos, EPS y discapacidad de menores y no debe usarse como fixture.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------------------------------------------------

/** `Sisben IV`, `SISBEN_IV` y `sisbén iv` son la misma columna: sin tildes, en mayúsculas y solo letras y números. */
export function normalizarEncabezadoSimat(encabezado: unknown): string {
  return String(encabezado ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const COLUMNAS = Object.keys(COLUMNAS_SIMAT) as ColumnaSimat[];
const ALIAS = new Map<string, ColumnaSimat>(
  COLUMNAS.flatMap((columna) => COLUMNAS_SIMAT[columna].alias.map((a) => [normalizarEncabezadoSimat(a), columna] as const))
);

export interface MapaDeColumnas {
  indices: Partial<Record<ColumnaSimat, number>>;
  /** Obligatorias que no están en el encabezado. */
  faltantes: ColumnaSimat[];
  /** Opcionales ausentes: se avisa qué no se podrá sincronizar. */
  opcionalesAusentes: ColumnaSimat[];
}

/** Ubica cada columna conocida por su NOMBRE (no por posición): el orden y las columnas de más no importan. */
export function mapearColumnas(encabezados: readonly unknown[]): MapaDeColumnas {
  const indices: Partial<Record<ColumnaSimat, number>> = {};
  encabezados.forEach((encabezado, i) => {
    const columna = ALIAS.get(normalizarEncabezadoSimat(encabezado));
    if (columna && indices[columna] === undefined) indices[columna] = i;
  });
  return {
    indices,
    faltantes: COLUMNAS.filter((c) => COLUMNAS_SIMAT[c].obligatoria && indices[c] === undefined),
    opcionalesAusentes: COLUMNAS.filter((c) => !COLUMNAS_SIMAT[c].obligatoria && indices[c] === undefined),
  };
}

/** ¿Esta fila de encabezados parece la de datos de SIMAT? Sirve para elegir la hoja correcta (el archivo trae también una tabla dinámica). */
export function pareceEncabezadoSimat(encabezados: readonly unknown[]): boolean {
  const mapa = mapearColumnas(encabezados);
  return mapa.faltantes.length === 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Valores de celda
// ---------------------------------------------------------------------------------------------------------------------

/** El valor de una celda como texto limpio, venga como texto, número, fecha o texto con formato. */
export function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString();
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  if (typeof valor === 'object') {
    const v = valor as { richText?: Array<{ text: string }>; text?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (v.text !== undefined) return String(v.text ?? '').trim();
    return '';
  }
  return String(valor).replace(/\s+/g, ' ').trim();
}

const esVacio = (texto: string): boolean => {
  const k = claveDeNombre(texto);
  return k === '' || k === 'no aplica' || k === 'no_aplica' || k === 'n/a' || k === 'na' || k === 'ninguno';
};

/** Número de documento como TEXTO (Excel lo entrega como número y quitaría ceros; los NES traen letras). null = inválido. */
export function documentoDeCelda(valor: unknown): string | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor <= 0) return null;
    return String(valor);
  }
  const texto = textoDeCelda(valor).toUpperCase().replace(/\s+/g, '').replace(/\.0+$/, '');
  return /^[A-Z0-9]{3,20}$/.test(texto) ? texto : null;
}

/** `TI:TARJETA DE IDENTIDAD` -> `TI`. El PPT llega con la ñ dañada, por eso se lee solo lo que está antes de los dos puntos. */
export function tipoDocumentoDeSimat(valor: unknown): { tipo: TipoDocumento | null; texto: string } {
  const texto = textoDeCelda(valor);
  const base = claveDeNombre(texto.split(':')[0] ?? '').toUpperCase().replace(/\s+/g, '');
  const soportados: readonly string[] = ['TI', 'RC', 'CC', 'CE', 'PEP', 'PPT', 'NES'];
  if (soportados.includes(base)) return { tipo: base as TipoDocumento, texto };
  if (base.startsWith('PPT')) return { tipo: 'PPT', texto };
  return { tipo: null, texto: texto || base };
}

export function generoDeSimat(valor: unknown): 'M' | 'F' | null {
  const k = claveDeNombre(textoDeCelda(valor));
  if (k === 'masculino' || k === 'm' || k === 'hombre') return 'M';
  if (k === 'femenino' || k === 'f' || k === 'mujer') return 'F';
  return null;
}

const MS_DIA = 86_400_000;
const EPOCA_EXCEL = 25_569;

function aInstante(valor: unknown): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number') {
    // Serial de Excel (días desde 1899-12-30, con la hora en la fracción).
    return valor > 1 && valor < 80_000 ? new Date(Math.round((valor - EPOCA_EXCEL) * MS_DIA)) : null;
  }
  const texto = textoDeCelda(valor);
  if (/^\d+(\.\d+)?$/.test(texto)) return aInstante(Number(texto));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  const latina = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  const p = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]] : latina ? [latina[3], latina[2], latina[1], latina[4], latina[5], latina[6]] : null;
  if (!p) return null;
  const [anio = 0, mes = 0, dia = 0, h = 0, mi = 0, s = 0] = p.map((x) => Number(x ?? 0));
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, h, mi, s));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? fecha : null;
}

/** Fecha de calendario (medianoche UTC) como `AAAA-MM-DD`. null = inválida. */
export function fechaDeCelda(valor: unknown): string | null {
  const d = aInstante(valor);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Fecha y hora de la matrícula en SIMAT. La celda es hora local de Colombia (UTC-5) sin zona: se lleva al instante real. */
export function fechaHoraDeCelda(valor: unknown): string | null {
  const d = aInstante(valor);
  return d ? new Date(d.getTime() + 5 * 3_600_000).toISOString() : null;
}

/** `ESTRATO 2` -> 2. «ESTRATO 0» y «NO APLICA» no son un estrato de los que Klassy guarda (1 a 6): quedan vacíos. */
export function estratoDeSimat(valor: unknown): { valor: number | null; cero: boolean } {
  const texto = textoDeCelda(valor);
  const numero = /(\d)/.exec(texto)?.[1];
  if (numero === undefined) return { valor: null, cero: false };
  const n = Number(numero);
  return n >= 1 && n <= 6 ? { valor: n, cero: false } : { valor: null, cero: n === 0 };
}

/** `O +` -> `O+`. */
export function sangreDeSimat(valor: unknown): GrupoSanguineo | null {
  const texto = textoDeCelda(valor).toUpperCase().replace(/\s+/g, '');
  return (GRUPOS_SANGUINEOS as readonly string[]).includes(texto) ? (texto as GrupoSanguineo) : null;
}

export interface EtniaSimat {
  grupo: GrupoEtnico;
  /** El valor de SIMAT tal cual; null cuando no se informó. */
  detalle: string | null;
  informada: boolean;
}

/** Los 26 valores de SIMAT a las seis categorías de Klassy; el pueblo o «Negritudes» se conserva aparte en `detalle`. */
export function etniaDeSimat(valor: unknown): EtniaSimat {
  const texto = textoDeCelda(valor);
  if (esVacio(texto)) return { grupo: 'NINGUNO', detalle: null, informada: false };
  const k = claveDeNombre(texto);
  if (k.startsWith('afro') || k.startsWith('negritud') || k.startsWith('negro')) return { grupo: 'AFRODESCENDIENTE', detalle: texto, informada: true };
  if (k === 'raizal') return { grupo: 'RAIZAL', detalle: texto, informada: true };
  if (k === 'palenquero' || k === 'palanquero') return { grupo: 'PALENQUERO', detalle: texto, informada: true };
  if (k === 'rom' || k.startsWith('rom ') || k.includes('gitano')) return { grupo: 'ROM', detalle: texto, informada: true };
  return { grupo: 'INDIGENA', detalle: texto, informada: true };
}

/**
 * El primer teléfono utilizable de un campo que a veces trae varios (`3156716162/3217341666`, `3195652098-3127979749`).
 * Celular de 10 dígitos que empieza por 3, o fijo de 7 dígitos. null = ninguno.
 */
export function telefonoDeSimat(valor: unknown): string | null {
  const texto = typeof valor === 'number' ? String(Math.trunc(valor)) : textoDeCelda(valor);
  const valido = (d: string): string | null => {
    if (d.length === 10 && d.startsWith('3')) return d;
    if (d.length === 12 && d.startsWith('573')) return d.slice(2);
    if (d.length === 7 && !/^(\d)\1+$/.test(d)) return d;
    return null;
  };
  for (const parte of texto.split(/[/,;|\-]/)) {
    const directo = valido(parte.replace(/\D/g, ''));
    if (directo) return directo;
  }
  // Un número escrito con espacios (312 797 4925) o dos celulares pegados (3156716162 3217341666).
  const todos = texto.replace(/\D/g, '');
  return valido(todos) ?? /3\d{9}/.exec(todos)?.[0] ?? null;
}

export function correoDeSimat(valor: unknown): string | null {
  const texto = textoDeCelda(valor).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) ? texto : null;
}

/** País, o null cuando no se informó («NO APLICA», «NO ESPECIFICADO»). */
export function paisDeSimat(valor: unknown): string | null {
  const texto = textoDeCelda(valor);
  const k = claveDeNombre(texto).replace(/_/g, ' ');
  return esVacio(texto) || k === 'no especificado' ? null : texto.toUpperCase();
}

export function barrioDeSimat(valor: unknown): string | null {
  const texto = textoDeCelda(valor);
  return texto === '' ? null : texto.toUpperCase();
}

// Del más específico al más general: «sordoceguera» contiene «ceguera».
const PATRONES_DISCAPACIDAD: ReadonlyArray<readonly [string, string]> = [
  ['SORDOCEGUERA', 'SORDOCEGUERA'],
  ['CEGUERA', 'VISUAL_CEGUERA'],
  ['BAJAVISION', 'VISUAL_BAJA_VISION'],
  ['AUTISTA', 'TEA'],
  ['INTELECTUAL', 'INTELECTUAL'],
  ['MULTIPLE', 'MULTIPLE'],
  ['SENAS', 'AUDITIVA_SORDERA'],
  ['AUDITIVA', 'AUDITIVA_HIPOACUSIA'],
  ['FISICA', 'FISICA'],
  ['PSICOSOCIAL', 'PSICOSOCIAL'],
];

export interface ApoyoSimat {
  texto: string;
  /** Código de `CondicionApoyo` (M16) que le corresponde, o null si no calza. Orientación valora: aquí solo se transcribe. */
  condicion: string | null;
}

export function discapacidadDeSimat(valor: unknown): ApoyoSimat | null {
  const texto = textoDeCelda(valor);
  if (esVacio(texto)) return null;
  const clave = normalizarEncabezadoSimat(texto);
  return { texto, condicion: PATRONES_DISCAPACIDAD.find(([patron]) => clave.includes(patron))?.[1] ?? null };
}

export function trastornoDeSimat(valor: unknown): string | null {
  const texto = textoDeCelda(valor);
  return esVacio(texto) ? null : texto;
}

export function talentoDeSimat(valor: unknown): boolean {
  return !esVacio(textoDeCelda(valor));
}

export function jornadaDeSimat(valor: unknown): Jornada | null {
  return JORNADA_SIMAT[normalizarEncabezadoSimat(valor)] ?? null;
}

export function gradoDeSimat(valor: unknown): number | null {
  const texto = textoDeCelda(valor);
  return /^-?\d+$/.test(texto) ? Number(texto) : null;
}

export const gradoEsSoportado = (grado: number): boolean => grado >= GRADO_MIN_SOPORTADO && grado <= GRADO_MAX_SOPORTADO;

/** Código de grupo de SIMAT como texto en mayúsculas: `601`, `-101`, `JRD`. */
export function grupoDeSimat(valor: unknown): string {
  return textoDeCelda(valor).toUpperCase();
}

export type AccionPorEstadoSimat = 'MATRICULAR' | 'RETIRADO' | 'OMITIR';

/** Solo «MATRICULADO» matricula. Un retirado se informa; el resto (asignado, nuevo, sin continuidad…) todavía no es una matrícula confirmada. */
export function accionPorEstadoSimat(valor: unknown): AccionPorEstadoSimat {
  const k = claveDeNombre(textoDeCelda(valor));
  if (k === 'matriculado') return 'MATRICULAR';
  if (k === 'retirado') return 'RETIRADO';
  return 'OMITIR';
}

// ---------------------------------------------------------------------------------------------------------------------
// La fila normalizada
// ---------------------------------------------------------------------------------------------------------------------

/** Una fila de SIMAT ya limpia. Solo contiene tipos JSON (se guarda en la simulación hasta que se aplica). */
export interface FilaSimat {
  numero: number;
  estado_simat: string;
  accion: AccionPorEstadoSimat;
  ano: number | null;
  dane: string;
  dane_sede: string;
  sede_nombre: string;
  jornada: Jornada | null;
  jornada_texto: string;
  grado: number | null;
  grado_texto: string;
  grupo: string;
  documento: string;
  tipo_documento: TipoDocumento | null;
  tipo_documento_texto: string;
  primer_apellido: string;
  segundo_apellido: string;
  primer_nombre: string;
  segundo_nombre: string;
  genero: 'M' | 'F' | null;
  fecha_nacimiento: string | null;
  fecha_matricula: string | null;
  per_id: string;
  nui: string;
  barrio: string | null;
  telefono: string | null;
  correo: string | null;
  eps: string | null;
  rh: GrupoSanguineo | null;
  estrato: number | null;
  sisben: string | null;
  grupo_etnico: GrupoEtnico;
  etnia_detalle: string | null;
  pais_origen: string | null;
  pais_nacimiento: string | null;
  nacionalidad_2: string | null;
  discapacidad: ApoyoSimat | null;
  trastorno: string | null;
  talento: boolean;
}

export interface FilaNormalizada {
  fila: FilaSimat;
  /** Problemas de los datos que impiden importar la fila (ERROR). */
  errores: string[];
  /** Cosas que se descartan o se dejan vacías sin impedir la importación. */
  avisos: string[];
}

export type FilaCruda = Partial<Record<ColumnaSimat, unknown>>;

const t = textoDeCelda;

export function normalizarFila(cruda: FilaCruda, numero: number): FilaNormalizada {
  const errores: string[] = [];
  const avisos: string[] = [];

  const documento = documentoDeCelda(cruda.documento);
  const tipo = tipoDocumentoDeSimat(cruda.tipo_documento);
  if (documento === null) errores.push('El número de documento es inválido o está vacío.');

  const fechaNacimiento = fechaDeCelda(cruda.fecha_nacimiento);
  if (fechaNacimiento === null) errores.push('La fecha de nacimiento es inválida o está vacía.');
  else if (new Date(`${fechaNacimiento}T00:00:00Z`).getTime() > Date.now()) errores.push('La fecha de nacimiento es futura.');

  const primerNombre = t(cruda.nombre1).toUpperCase();
  const primerApellido = t(cruda.apellido1).toUpperCase();
  if (!primerNombre || !primerApellido) errores.push('Falta el primer nombre o el primer apellido.');

  const estrato = estratoDeSimat(cruda.estrato);
  if (estrato.cero) avisos.push('Estrato 0: Klassy guarda estratos de 1 a 6; se dejó vacío.');

  const sisbenTexto = t(cruda.sisben);
  const sisben = normalizarGrupoSisben(sisbenTexto);
  if (sisben === undefined) avisos.push(`SISBEN «${sisbenTexto}» no es un grupo válido (A1 a D21); se dejó vacío.`);

  const telefonoCrudo = cruda.telefono;
  const telefono = telefonoDeSimat(telefonoCrudo);
  if (telefono === null && t(telefonoCrudo) !== '' && t(telefonoCrudo) !== '0') avisos.push('El teléfono no tiene un número utilizable.');

  const rh = sangreDeSimat(cruda.tipo_sangre);
  if (rh === null && t(cruda.tipo_sangre) !== '') avisos.push(`Tipo de sangre «${t(cruda.tipo_sangre)}» no reconocido; se dejó vacío.`);

  const correoCrudo = t(cruda.correo);
  const correo = correoDeSimat(correoCrudo);
  if (correo === null && correoCrudo !== '') avisos.push('El correo no tiene un formato válido; se descartó.');

  const etnia = etniaDeSimat(cruda.etnia);

  return {
    errores,
    avisos,
    fila: {
      numero,
      estado_simat: t(cruda.estado).toUpperCase(),
      accion: accionPorEstadoSimat(cruda.estado),
      ano: /^\d{4}$/.test(t(cruda.ano)) ? Number(t(cruda.ano)) : null,
      dane: t(cruda.dane).replace(/\D/g, ''),
      dane_sede: t(cruda.dane_sede).replace(/\D/g, ''),
      sede_nombre: t(cruda.sede),
      jornada: jornadaDeSimat(cruda.jornada),
      jornada_texto: t(cruda.jornada),
      grado: gradoDeSimat(cruda.grado),
      grado_texto: t(cruda.grado),
      grupo: grupoDeSimat(cruda.grupo),
      documento: documento ?? '',
      tipo_documento: tipo.tipo,
      tipo_documento_texto: tipo.texto,
      primer_apellido: primerApellido,
      segundo_apellido: t(cruda.apellido2).toUpperCase(),
      primer_nombre: primerNombre,
      segundo_nombre: t(cruda.nombre2).toUpperCase(),
      genero: generoDeSimat(cruda.genero),
      fecha_nacimiento: fechaNacimiento,
      fecha_matricula: fechaHoraDeCelda(cruda.fecha_inicio),
      per_id: t(cruda.per_id),
      nui: t(cruda.nui).toUpperCase(),
      barrio: barrioDeSimat(cruda.barrio),
      telefono,
      correo,
      eps: esVacio(t(cruda.eps)) ? null : t(cruda.eps),
      rh,
      estrato: estrato.valor,
      sisben: sisben ?? null,
      grupo_etnico: etnia.grupo,
      etnia_detalle: etnia.detalle,
      pais_origen: paisDeSimat(cruda.pais_origen),
      pais_nacimiento: paisDeSimat(cruda.pais_nacimiento),
      nacionalidad_2: paisDeSimat(cruda.nacionalidad2),
      discapacidad: discapacidadDeSimat(cruda.discapacidad),
      trastorno: trastornoDeSimat(cruda.trastornos),
      talento: talentoDeSimat(cruda.talentos),
    },
  };
}

export const nombreCompletoDeFila = (f: Pick<FilaSimat, 'primer_nombre' | 'segundo_nombre' | 'primer_apellido' | 'segundo_apellido'>): string =>
  [f.primer_apellido, f.segundo_apellido, f.primer_nombre, f.segundo_nombre].filter(Boolean).join(' ');

/** Etiqueta de grado para pantallas: el código SIMAT tal cual cuando Klassy no lo conoce. */
export const etiquetaDeGrado = (f: Pick<FilaSimat, 'grado' | 'grado_texto'>): string => f.grado_texto || String(f.grado ?? '');

// ---------------------------------------------------------------------------------------------------------------------
// Sincronización de un estudiante que ya existe («actualización silenciosa»)
// ---------------------------------------------------------------------------------------------------------------------

export interface PerfilExistente {
  telefono?: string | null;
  /** Nombre y apellido que muestra Klassy (los arma el sistema de las cuatro partes). */
  nombre: string;
  apellido: string;
  fecha_nacimiento?: Date | string | null;
  genero?: string | null;
  barrio_vereda?: string | null;
  eps?: string | null;
  rh?: string | null;
  estrato?: number | null;
  sisben_grupo?: string | null;
  grupo_etnico?: string | null;
  etnia_detalle?: string | null;
  pais_origen?: string | null;
  pais_nacimiento?: string | null;
  nacionalidad_2?: string | null;
  correo_contacto?: string | null;
  simat_per_id?: string | null;
  simat_nui?: string | null;
  tiene_discapacidad?: boolean;
  tiene_talento_excepcional?: boolean;
  autorizacion_otorgada?: boolean;
}

export interface CambiosDeEstudiante {
  /** Campos de `User` a escribir. */
  usuario: { telefono?: string };
  /** Campos de `StudentProfile` a escribir. */
  perfil: Record<string, string | number | boolean | null>;
  /** Etiquetas legibles de lo que cambia (sin valores: puede ser salud). */
  campos: string[];
  /** Diferencias de identidad: se informan, no se aplican. */
  identidad: string[];
  /** Datos de salud que traía SIMAT y no se importaron por falta de autorización. */
  salud_omitida: boolean;
  /** Hay que dejar registrada la autorización de datos de salud declarada por el colegio. */
  requiere_autorizacion: boolean;
}

const mismo = (a: unknown, b: unknown): boolean => claveDeNombre(String(a ?? '')) === claveDeNombre(String(b ?? ''));
const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
const fechaIso = (v: Date | string | null | undefined): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));

/**
 * Qué cambia al sincronizar un estudiante existente con una fila de SIMAT.
 *  - Un valor vacío de SIMAT NUNCA borra un dato que Klassy ya tiene.
 *  - Los datos de salud (EPS y tipo de sangre) solo se tocan si el colegio declaró la autorización.
 *  - La identidad (nombre, fecha de nacimiento, género) no se sobrescribe: se informa la diferencia.
 *  - Si no cambia nada, `campos` queda vacío y quien llama no debe guardar (no se mueve `updatedAt`).
 */
export function cambiosDeEstudiante(existente: PerfilExistente, fila: FilaSimat, opciones: { autorizacion_salud: boolean }): CambiosDeEstudiante {
  const perfil: CambiosDeEstudiante['perfil'] = {};
  const usuario: CambiosDeEstudiante['usuario'] = {};
  const campos: string[] = [];
  const identidad: string[] = [];

  const actualizarTexto = (etiqueta: string, clave: string, actual: unknown, nuevo: string | null): void => {
    if (nuevo !== null && !mismo(actual, nuevo)) {
      perfil[clave] = nuevo;
      campos.push(etiqueta);
    }
  };

  if (fila.telefono !== null && soloDigitos(existente.telefono) !== fila.telefono) {
    usuario.telefono = fila.telefono;
    campos.push('Teléfono');
  }
  actualizarTexto('Barrio', 'barrio_vereda', existente.barrio_vereda, fila.barrio);
  if (fila.estrato !== null && existente.estrato !== fila.estrato) {
    perfil.estrato = fila.estrato;
    campos.push('Estrato');
  }
  if (fila.sisben !== null && existente.sisben_grupo !== fila.sisben) {
    perfil.sisben_grupo = fila.sisben;
    campos.push('Grupo SISBEN');
  }
  if (fila.grupo_etnico !== 'NINGUNO' && existente.grupo_etnico !== fila.grupo_etnico) {
    perfil.grupo_etnico = fila.grupo_etnico;
    campos.push('Grupo étnico');
  }
  actualizarTexto('Detalle étnico', 'etnia_detalle', existente.etnia_detalle, fila.etnia_detalle);
  actualizarTexto('País de origen', 'pais_origen', existente.pais_origen, fila.pais_origen);
  actualizarTexto('País de nacimiento', 'pais_nacimiento', existente.pais_nacimiento, fila.pais_nacimiento);
  actualizarTexto('Nacionalidad 2', 'nacionalidad_2', existente.nacionalidad_2, fila.nacionalidad_2);
  actualizarTexto('Correo de contacto', 'correo_contacto', existente.correo_contacto, fila.correo);
  actualizarTexto('Identificador SIMAT', 'simat_per_id', existente.simat_per_id, fila.per_id || null);
  actualizarTexto('NUI de SIMAT', 'simat_nui', existente.simat_nui, fila.nui || null);
  if (fila.discapacidad && !existente.tiene_discapacidad) {
    perfil.tiene_discapacidad = true;
    campos.push('Discapacidad');
  }
  if (fila.talento && !existente.tiene_talento_excepcional) {
    perfil.tiene_talento_excepcional = true;
    campos.push('Talento excepcional');
  }

  // Salud: dato sensible. Sin la autorización declarada no se importa.
  const traeSalud = Boolean(fila.eps || fila.rh);
  let requiere = false;
  if (opciones.autorizacion_salud) {
    const antes = campos.length;
    actualizarTexto('EPS', 'eps', existente.eps, fila.eps);
    actualizarTexto('Tipo de sangre', 'rh', existente.rh, fila.rh);
    requiere = campos.length > antes && !existente.autorizacion_otorgada;
  }

  // Identidad: se compara, no se escribe.
  const nombres = [fila.primer_nombre, fila.segundo_nombre].filter(Boolean).join(' ');
  const apellidos = [fila.primer_apellido, fila.segundo_apellido].filter(Boolean).join(' ');
  if (nombres && !mismo(existente.nombre, nombres)) identidad.push(CAMPOS_DE_IDENTIDAD[0]);
  if (apellidos && !mismo(existente.apellido, apellidos)) identidad.push(CAMPOS_DE_IDENTIDAD[1]);
  if (fila.fecha_nacimiento && existente.fecha_nacimiento && fechaIso(existente.fecha_nacimiento) !== fila.fecha_nacimiento) identidad.push(CAMPOS_DE_IDENTIDAD[2]);
  if (fila.genero && existente.genero && existente.genero !== fila.genero) identidad.push(CAMPOS_DE_IDENTIDAD[3]);

  return { usuario, perfil, campos, identidad, salud_omitida: traeSalud && !opciones.autorizacion_salud, requiere_autorizacion: requiere };
}

// ---------------------------------------------------------------------------------------------------------------------
// Orden de aplicación
// ---------------------------------------------------------------------------------------------------------------------

/**
 * El orden en que se asientan las matrículas, y por tanto sus folios: la fecha en que SIMAT las registró y, a igual fecha, grado, grupo y
 * apellidos. Es determinista: reintentar el mismo archivo da el mismo orden.
 */
export function ordenarParaFolio<T extends Pick<FilaSimat, 'fecha_matricula' | 'grado' | 'grupo' | 'primer_apellido' | 'primer_nombre' | 'documento'>>(filas: readonly T[]): T[] {
  const tiempo = (f: T): number => (f.fecha_matricula ? Date.parse(f.fecha_matricula) : Number.MAX_SAFE_INTEGER);
  return [...filas].sort(
    (a, b) =>
      tiempo(a) - tiempo(b) ||
      (a.grado ?? 0) - (b.grado ?? 0) ||
      a.grupo.localeCompare(b.grupo, 'es', { numeric: true }) ||
      a.primer_apellido.localeCompare(b.primer_apellido, 'es') ||
      a.primer_nombre.localeCompare(b.primer_nombre, 'es') ||
      a.documento.localeCompare(b.documento)
  );
}

/** Llave para detectar a la misma persona escrita con otro documento: nombre completo y fecha de nacimiento. */
export function llaveDePersona(nombres: string, apellidos: string, fechaNacimiento: string | null): string {
  return `${claveDeNombre(apellidos)}|${claveDeNombre(nombres)}|${fechaNacimiento ?? ''}`;
}

/** Llave de un grupo de SIMAT: la sede y la jornada son parte de ella (dos sedes de Juan XXIII repiten los códigos 601, 701…). */
export const llaveDeGrupoSimat = (f: Pick<FilaSimat, 'dane_sede' | 'jornada' | 'grado' | 'grupo'>): string => `${f.dane_sede}|${f.jornada ?? ''}|${f.grado ?? ''}|${f.grupo}`;

/** Fecha límite del acta de compromiso: hoy + los días configurados. */
export function plazoDeCompromiso(dias: number, desde: Date = new Date()): Date {
  return new Date(desde.getTime() + dias * MS_DIA);
}

/** Detecta el delimitador de un CSV/TXT de SIMAT: coma, punto y coma, barra vertical o tabulador, el que más aparezca fuera de comillas en el encabezado. */
export function detectarDelimitadorSimat(contenido: string): ',' | ';' | '|' | '\t' {
  const primera = contenido.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const conteo: Record<string, number> = { ',': 0, ';': 0, '|': 0, '\t': 0 };
  let dentro = false;
  for (const c of primera) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && c in conteo) conteo[c]! += 1;
  }
  const [mejor] = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  return (mejor && mejor[1] > 0 ? mejor[0] : ',') as ',' | ';' | '|' | '\t';
}
