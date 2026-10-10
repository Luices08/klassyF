const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** Entero de 0 a 999 en letras («treinta y uno», «ciento cinco»). Fuera de rango devuelve las cifras tal cual. */
export function enLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 30) return UNIDADES[n] as string;
  if (n < 100) {
    const resto = n % 10;
    return resto === 0 ? (DECENAS[n / 10] as string) : `${DECENAS[Math.floor(n / 10)]} y ${UNIDADES[resto]}`;
  }
  if (n === 100) return 'cien';
  const resto = n % 100;
  return resto === 0 ? (CENTENAS[n / 100] as string) : `${CENTENAS[Math.floor(n / 100)]} ${enLetras(resto)}`;
}
