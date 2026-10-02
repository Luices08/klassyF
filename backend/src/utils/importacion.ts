/**
 * Una celda de texto que empieza por = + - @ la interpreta Excel como fórmula (inyección al abrir el archivo). Al GENERAR
 * archivos se antepone un apóstrofo; Excel lo muestra como texto normal.
 */
export function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** ACTIVO/INACTIVO (vacío = activo); otra cosa es un error (null). */
export function leerEstado(valor: string): 'activo' | 'inactivo' | null {
  const v = claveDeNombre(valor);
  if (v === '' || v === 'activo') return 'activo';
  if (v === 'inactivo') return 'inactivo';
  return null;
}

/** Número decimal con coma o punto (Excel en español guarda 0,3); vacío = null (sin dato); inválido = undefined. */
export function leerDecimal(valor: string): number | null | undefined {
  const texto = valor.trim().replace(',', '.');
  if (texto === '') return null;
  return /^\d+(\.\d+)?$/.test(texto) ? Number(texto) : undefined;
}

/** Clave para comparar textos sin importar mayúsculas, tildes ni espacios sobrantes. */
export const claveDeNombre = (valor: string): string =>
  valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
