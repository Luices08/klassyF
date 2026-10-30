/**
 * Llena la instalación con el Colegio Los Corazones y TODA su historia: 2024 y 2025 completos y cerrados (matrículas, notas,
 * asistencia, convivencia, recuperaciones, promoción, graduados, rematrícula) y 2026 hasta hoy. Es la simulación multi-año
 * (`npm run sim`, ver scripts/simulacion/LEEME.md) con la configuración de Los Corazones, más las migraciones al final.
 *
 * Por qué una base aparte (`klassy_sim`): la historia solo se puede vivir año por año con el reloj movido, y la simulación se niega
 * a escribir en una base que no lleve «sim» en el nombre o que tenga usuarios que no creó. Así nunca pisa la base de trabajo.
 * Para que la aplicación muestre este colegio, el `.env` debe decir `MONGO_DB=klassy_sim` (backend y herramientas usan la misma).
 *
 * Controlado: corre fase por fase, guarda un respaldo al terminar cada una (si hay mongodump) y, si algo falla, volver a correrlo
 * retoma desde la fase que quedó a medias. Los argumentos se pasan a la simulación (`--desde=`, `--rehacer`, `--sin-respaldo`,
 * `--corte=AAAA-MM-DD`, `--listar`).
 *
 * Uso en el VPS: docker compose run --rm herramientas npm run llenar:sistema
 */
import { spawnSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = path.join(__dirname, 'simulacion', 'config', 'los-corazones.json');

function fallar(mensaje: string): never {
  console.error(`\n[llenar] ${mensaje}`);
  process.exit(1);
}

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0';
const base = (uri.split('?')[0] ?? '').split('/').pop() ?? '';
if (!/sim/i.test(base)) {
  fallar(
    `La base configurada es «${base}». La historia se carga en una base aparte cuyo nombre lleve «sim».\n` +
      '         En el .env del VPS pon MONGO_DB=klassy_sim y vuelve a correr este comando (tu base actual no se toca).'
  );
}
if (process.env.NODE_ENV === 'production' && !process.env.CERT_HMAC_SECRET) {
  fallar('Falta CERT_HMAC_SECRET en el .env: los cierres de promoción y los certificados se firman con esa clave y el servidor la exige.');
}

const tieneMongodump = !spawnSync('mongodump', ['--version'], { stdio: 'ignore' }).error;
const extra = process.argv.slice(2);
if (!tieneMongodump && !extra.includes('--sin-respaldo')) {
  console.log('[llenar] Aviso: no está mongodump; se corre sin respaldo por fase (si algo falla habrá que repetir desde el inicio).');
  extra.push('--sin-respaldo');
}

const entorno = {
  ...process.env,
  SIM_MONGO_URI: uri,
  // La misma carpeta que lee el backend: los PDF de planes, entregas y soportes quedan donde la aplicación los busca.
  SIM_UPLOADS_DIR: process.env.SIM_UPLOADS_DIR || process.env.UPLOADS_DIR || path.resolve('uploads'),
  SIM_RESPALDOS_DIR: process.env.SIM_RESPALDOS_DIR || path.resolve('respaldos-sim'),
};

const PASOS: Array<[string, string[]]> = [
  ['sim', [`--config=${CONFIG}`, ...extra]],
  ['migrar', ['--aplicar']],
];

for (const [script, argumentos] of PASOS) {
  const args = ['run', script, '--', ...argumentos];
  console.log(`\n==> npm ${args.join(' ')}`);
  const resultado = spawnSync('npm', args, { stdio: 'inherit', env: entorno, shell: process.platform === 'win32' });
  if (resultado.status !== 0) fallar(`Falló «${script}». Vuelve a correr el mismo comando: retoma desde la fase que quedó a medias.`);
  if (extra.includes('--listar')) process.exit(0);
}
// En Docker este script corre como root y el backend como `node` (uid 1000): sin esto no podría escribir en las carpetas creadas aquí.
if (process.getuid?.() === 0) spawnSync('chown', ['-R', '1000:1000', entorno.SIM_UPLOADS_DIR], { stdio: 'inherit' });
console.log('\n[llenar] Listo: Colegio Los Corazones con 2024, 2025 y 2026 hasta hoy.');
console.log('[llenar] ADMIN: documento 1000000001, contraseña la de SIM_ADMIN_PASSWORD (por defecto KlassySim2024*).');
console.log('[llenar] Personal, docentes, estudiantes y acudientes: su documento y SIM_USUARIOS_PASSWORD (por defecto Klassy2024*).');
