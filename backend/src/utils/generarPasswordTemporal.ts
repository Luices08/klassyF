import crypto from 'crypto';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña temporal legible (sin caracteres ambiguos 0/O, 1/l/I) para comunicar por telefono/pantalla. */
export function generarPasswordTemporal(longitud = 10): string {
  const bytes = crypto.randomBytes(longitud);
  let password = '';
  for (let i = 0; i < longitud; i++) {
    password += ALFABETO[bytes[i]! % ALFABETO.length];
  }
  return password;
}
