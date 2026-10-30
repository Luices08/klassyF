/**
 * Corre en orden el catálogo base y las migraciones de la base, una tras otra; se detiene en la primera que falle.
 *
 * Uso (en el VPS):
 *   docker compose run --rm herramientas npm run migrar                 seed + migraciones idempotentes; las demás solo se simulan
 *   docker compose run --rm herramientas npm run migrar -- --aplicar    además aplica matricula-unica, lideres-de-area y documentos-antiguos
 *
 * No hace respaldo (el contenedor no tiene acceso a mongodump ni a los archivos): antes, `./deploy/respaldar.sh`.
 * `migrate:retirar-banco-curricular` borra colecciones: aquí solo se simula y aplicarla es a mano.
 */
import { spawnSync } from 'child_process';

const aplicar = process.argv.includes('--aplicar');

// El orden importa: superadmin-to-admin trabaja sobre el campo `rol` que roles-multiples convierte en `roles`.
const IDEMPOTENTES = [
  'seed',
  'migrate:superadmin-to-admin',
  'migrate:roles-multiples',
  'migrate:estado-por-defecto',
  'migrate:m05-anio-lectivo',
  'migrate:folio-al-matricular',
  'migrate:anio-repetible',
  'migrate:certificados-sede',
  'migrate:requisitos-documentales',
  'migrate:retirar-campos-convivencia',
  'sembrar:tipos-titulacion',
];
const CON_SIMULACION = ['migrate:matricula-unica', 'migrate:lideres-de-area', 'migrate:documentos-antiguos'];

function correr(script: string, argumentos: string[] = []): void {
  const args = ['run', script, ...(argumentos.length ? ['--', ...argumentos] : [])];
  console.log(`\n==> npm ${args.join(' ')}`);
  const resultado = spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) {
    console.error(`\n[migrar] Falló «${script}». Se detuvo aquí; lo anterior ya quedó aplicado.`);
    process.exit(resultado.status ?? 1);
  }
}

for (const script of IDEMPOTENTES) correr(script);
for (const script of CON_SIMULACION) correr(script, aplicar ? ['--aplicar'] : []);
correr('migrate:retirar-banco-curricular');

console.log(
  aplicar
    ? '\n[migrar] Listo. retirar-banco-curricular solo se simuló; para aplicarla: npm run migrate:retirar-banco-curricular -- --aplicar'
    : '\n[migrar] Listo. Revise las simulaciones de arriba y, si están bien, corra de nuevo con: npm run migrar -- --aplicar'
);
