import { normalizarEncabezado } from './csv';

/**
 * Una celda de texto que empieza por = + - @ la interpreta Excel como fórmula (inyección al abrir el archivo). Al GENERAR
 * archivos se antepone un apóstrofo; Excel lo muestra como texto normal.
 */
export function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** YYYY-MM-DD o DD/MM/AAAA (lo que Excel guarda) -> YYYY-MM-DD; null si no es una fecha de calendario real. */
export function normalizarFecha(valor: string): string | null {
  const texto = valor.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  const latino = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  const partes = iso ? [iso[1], iso[2], iso[3]] : latino ? [latino[3], latino[2], latino[1]] : null;
  if (!partes) return null;
  const [anio = '', mes = '', dia = ''] = partes;

  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  const coincide = fecha.getUTCFullYear() === Number(anio) && fecha.getUTCMonth() === Number(mes) - 1 && fecha.getUTCDate() === Number(dia);
  return coincide ? `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}` : null;
}

/** SI/NO (sin importar mayúsculas ni tilde); vacío = `porDefecto`; cualquier otra cosa es un error (null). */
export function leerSiNo(valor: string, porDefecto: boolean): boolean | null {
  const v = normalizarEncabezado(valor);
  if (v === '') return porDefecto;
  if (v === 'si' || v === 'true' || v === '1') return true;
  if (v === 'no' || v === 'false' || v === '0') return false;
  return null;
}

/** ACTIVO/INACTIVO (vacío = activo); otra cosa es un error (null). */
export function leerEstado(valor: string): 'activo' | 'inactivo' | null {
  const v = normalizarEncabezado(valor);
  if (v === '' || v === 'activo') return 'activo';
  if (v === 'inactivo') return 'inactivo';
  return null;
}

/** Entero >= 0 (vacío = 0); otra cosa es un error (null). */
export function leerOrden(valor: string): number | null {
  if (valor.trim() === '') return 0;
  return /^\d{1,6}$/.test(valor.trim()) ? Number(valor.trim()) : null;
}

/** Número decimal con coma o punto (Excel en español guarda 0,3); vacío = null (sin dato); inválido = undefined. */
export function leerDecimal(valor: string): number | null | undefined {
  const texto = valor.trim().replace(',', '.');
  if (texto === '') return null;
  return /^\d+(\.\d+)?$/.test(texto) ? Number(texto) : undefined;
}

/** "a|b;c" -> ['a','b','c'], sin vacíos ni repetidos. */
export function partirLista(valor: string): string[] {
  return [...new Set(valor.split(/[|;]/).map((v) => v.trim()).filter(Boolean))];
}

/** Clave para comparar nombres sin importar mayúsculas, tildes ni espacios sobrantes. */
export const claveDeNombre = (valor: string): string =>
  valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
