import { EsquemaFoliatura, MAX_FOLIO, MAX_LARGO_CODIGO_FOLIO, MAX_LARGO_MASCARA } from '../constants/foliatura';

// Funciones puras de la foliatura del Libro de Matrícula: cómo se arma el código y cuál es el siguiente folio. Sin base de datos, con tests.

const PARTE = /\{(libro|folio|año|anio)(?::(\d{1,2}))?\}/g;
const LITERALES_PERMITIDOS = /^[A-Za-z0-9\-_/. ]*$/;

export interface PartesDelCodigo {
  libro: number;
  folio: number;
  anio: number;
}

const conCeros = (n: number, ancho: number | undefined): string => (ancho ? String(n).padStart(ancho, '0') : String(n));

/** Arma el código del folio reemplazando las partes de la máscara. `{año}` y `{anio}` son lo mismo. */
export function renderizarMascara(mascara: string, partes: PartesDelCodigo): string {
  return mascara.replace(PARTE, (_todo, nombre: string, ancho?: string) => {
    const n = nombre === 'libro' ? partes.libro : nombre === 'folio' ? partes.folio : partes.anio;
    return conCeros(n, ancho ? Number(ancho) : undefined);
  });
}

/**
 * Una máscara sirve si: tiene `{libro}` y `{folio}` (sin eso dos libros distintos darían el mismo código y el código es único), no tiene llaves
 * sueltas ni partes que no existen, solo usa letras, números y `- _ / . espacio`, y en el peor caso (libro de 5 cifras, folio de 7) no pasa del
 * largo permitido. Devuelve el problema en palabras, o null si está bien.
 */
export function validarMascara(mascara: string): string | null {
  if (!mascara.trim()) return 'Escribe cómo se arma el código del folio.';
  if (mascara.length > MAX_LARGO_MASCARA) return `La máscara no puede pasar de ${MAX_LARGO_MASCARA} caracteres.`;
  const sinPartes = mascara.replace(PARTE, '');
  if (/[{}]/.test(sinPartes)) return 'Hay una llave sin cerrar o una parte que no existe. Las partes válidas son {libro}, {folio:6} y {año}.';
  if (!LITERALES_PERMITIDOS.test(sinPartes)) return 'Solo se permiten letras, números y los signos - _ / . entre las partes.';
  const nombres = [...mascara.matchAll(PARTE)].map((m) => m[1]);
  if (!nombres.includes('folio')) return 'La máscara debe incluir {folio}: es el número consecutivo.';
  if (!nombres.includes('libro')) return 'La máscara debe incluir {libro}: sin él, el mismo folio de dos libros daría el mismo código.';
  const anchoDeFolio = Math.max(7, ...[...mascara.matchAll(PARTE)].filter((m) => m[1] === 'folio').map((m) => Number(m[2] ?? 0)));
  const peorCaso = renderizarMascara(mascara, { libro: 99_999, folio: 10 ** anchoDeFolio - 1, anio: 9999 });
  if (peorCaso.length > MAX_LARGO_CODIGO_FOLIO) return `Con libros y folios grandes el código pasaría de ${MAX_LARGO_CODIGO_FOLIO} caracteres (${peorCaso.length}). Acórtala.`;
  return null;
}

/** El libro donde cae un folio: el de la vigencia en el esquema anual, el que va corriendo en el continuo. */
export const libroDeFolio = (esquema: EsquemaFoliatura, anio: number, libroActual: number | null): number => (esquema === 'ANUAL' ? anio : (libroActual ?? 1));

export interface EstadoDeFoliatura {
  esquema: EsquemaFoliatura;
  capacidad_por_libro: number | null;
  libro_actual: number | null;
  /** Último folio asignado por libro. */
  contadores: ReadonlyMap<string, number> | Record<string, number>;
}

const ultimoDe = (contadores: EstadoDeFoliatura['contadores'], libro: number): number =>
  (contadores instanceof Map ? contadores.get(String(libro)) : (contadores as Record<string, number>)[String(libro)]) ?? 0;

/**
 * El libro y el folio que se asignaría ahora, sin consumirlos (lo que muestra la pantalla de configuración). En el continuo con capacidad, un
 * libro lleno abre el siguiente con el folio en 1.
 */
export function siguienteFolio(e: EstadoDeFoliatura, anio: number): { libro: number; folio: number } {
  const libro = libroDeFolio(e.esquema, anio, e.libro_actual);
  const ultimo = ultimoDe(e.contadores, libro);
  if (e.esquema === 'CONTINUO' && e.capacidad_por_libro !== null && ultimo >= e.capacidad_por_libro) return { libro: libro + 1, folio: 1 };
  return { libro, folio: Math.min(ultimo + 1, MAX_FOLIO) };
}
