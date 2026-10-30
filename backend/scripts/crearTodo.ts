/**
 * Deja una instalación lista de punta a punta con un solo comando: migraciones y catálogo base, el colegio (`crear:colegio`),
 * sus personas de prueba (`crear:usuarios`) y, ya con institución, los tipos de certificado de titulación. Se detiene en el
 * primer paso que falle; todos se pueden volver a correr sin duplicar.
 *
 * Uso: npm run crear:todo   (en el VPS, con respaldo antes: ./deploy/respaldar.sh y luego
 *      docker compose run --rm herramientas npm run crear:todo)
 */
import { spawnSync } from 'child_process';

const config = process.argv.find((a) => a.startsWith('--config='));

const PASOS: Array<[string, string[]]> = [
  ['migrar', ['--aplicar']],
  ['crear:colegio', config ? [config] : []],
  ['crear:usuarios', config ? [config] : []],
  ['sembrar:tipos-titulacion', []],
];

for (const [script, argumentos] of PASOS) {
  const args = ['run', script, ...(argumentos.length ? ['--', ...argumentos] : [])];
  console.log(`\n==> npm ${args.join(' ')}`);
  const resultado = spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) {
    console.error(`\n[crear:todo] Falló «${script}». Se detuvo aquí; lo anterior ya quedó hecho.`);
    process.exit(resultado.status ?? 1);
  }
}
console.log('\n[crear:todo] Listo.');
