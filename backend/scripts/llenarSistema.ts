/**
 * Llena la instalación con el Colegio Los Corazones y TODA su historia: 2024 y 2025 completos y cerrados (matrículas, notas,
 * asistencia, convivencia, recuperaciones, promoción, graduados, rematrícula) y 2026 hasta hoy. Es la simulación multi-año
 * (`npm run sim`, ver scripts/simulacion/LEEME.md) con la configuración de Los Corazones, más las migraciones al final.
 *
 * Usa la misma base que la aplicación (la del `.env`, sin tocarlo). La historia solo se puede vivir sobre una base vacía: si la base
 * ya tiene datos que no creó la simulación, el script se detiene y solo la vacía con `--vaciar-base`, después de respaldarla.
 *
 * Controlado: corre fase por fase, guarda un respaldo al terminar cada una (si hay mongodump) y, si algo falla, volver a correrlo
 * (sin `--vaciar-base`) retoma desde la fase que quedó a medias. Los demás argumentos van a la simulación (`--desde=`, `--rehacer`,
 * `--sin-respaldo`, `--corte=AAAA-MM-DD`, `--listar`).
 *
 * Uso en el VPS: docker compose run -d --name llenar herramientas npm run llenar:sistema -- --vaciar-base
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const CONFIG = path.join(__dirname, 'simulacion', 'config', 'los-corazones.json');
const VACIAR = '--vaciar-base';

function fallar(mensaje: string): never {
  console.error(`\n[llenar] ${mensaje}`);
  process.exit(1);
}

async function prepararBase(uri: string, vaciar: boolean, respaldosDir: string, tieneMongodump: boolean): Promise<void> {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) fallar('No se pudo abrir la base.');
  const [usuarios, fases] = await Promise.all([db.collection('users').countDocuments(), db.collection('sim_fases').countDocuments()]);
  const ajena = usuarios > 0 && fases === 0;
  if (ajena && !vaciar) {
    await mongoose.disconnect();
    fallar(
      `La base «${db.databaseName}» ya tiene ${usuarios} usuario(s) que no creó la simulación. La historia solo se carga sobre una base vacía.\n` +
        `         Para BORRAR lo que tiene y cargar Los Corazones con su historia, vuelve a correr con ${VACIAR} (se respalda antes).`
    );
  }
  if (vaciar && (usuarios > 0 || fases > 0)) {
    if (tieneMongodump) {
      fs.mkdirSync(respaldosDir, { recursive: true });
      const archivo = path.join(respaldosDir, `antes-de-llenar-${new Date().toISOString().replace(/[:.]/g, '-')}.db.gz`);
      const r = spawnSync('mongodump', [`--uri=${uri}`, `--archive=${archivo}`, '--gzip', '--quiet'], { stdio: 'inherit' });
      if (r.status !== 0) {
        await mongoose.disconnect();
        fallar('No se pudo respaldar la base: no se borró nada.');
      }
      console.log(`[llenar] Respaldo de la base anterior: ${archivo} (se restaura con mongorestore --drop).`);
    } else {
      console.log('[llenar] Aviso: no está mongodump; la base se vacía sin respaldo propio (usa ./deploy/respaldar.sh antes si lo necesitas).');
    }
    await db.dropDatabase();
    console.log(`[llenar] Base «${db.databaseName}» vaciada.`);
  }
  await mongoose.disconnect();
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0';
  const argumentos = process.argv.slice(2);
  const vaciar = argumentos.includes(VACIAR);
  const extra = argumentos.filter((a) => a !== VACIAR);
  const respaldosDir = process.env.SIM_RESPALDOS_DIR || path.resolve('respaldos-sim');
  const tieneMongodump = !spawnSync('mongodump', ['--version'], { stdio: 'ignore' }).error;

  if (process.env.NODE_ENV === 'production' && !process.env.CERT_HMAC_SECRET) {
    console.log('[llenar] Aviso: no hay CERT_HMAC_SECRET en el .env. Los cierres de promoción se firmarán con una clave de desarrollo y el servidor no podrá verificar sus huellas ni expedir certificados hasta que se defina.');
  }
  if (!tieneMongodump && !extra.includes('--sin-respaldo')) {
    console.log('[llenar] Aviso: no está mongodump; se corre sin respaldo por fase (si algo falla habrá que repetir desde el inicio).');
    extra.push('--sin-respaldo');
  }
  if (!extra.includes('--listar')) await prepararBase(uri, vaciar, respaldosDir, tieneMongodump);

  const uploads = process.env.SIM_UPLOADS_DIR || process.env.UPLOADS_DIR || path.resolve('uploads');
  const entorno = {
    ...process.env,
    SIM_MONGO_URI: uri,
    SIM_BASE_DE_TRABAJO: '1',
    // La misma carpeta que lee el backend: los PDF de planes, entregas y soportes quedan donde la aplicación los busca.
    SIM_UPLOADS_DIR: uploads,
    SIM_RESPALDOS_DIR: respaldosDir,
  };

  const PASOS: Array<[string, string[]]> = [
    ['sim', [`--config=${CONFIG}`, ...extra]],
    ['migrar', ['--aplicar']],
  ];
  for (const [script, args] of PASOS) {
    const npmArgs = ['run', script, '--', ...args];
    console.log(`\n==> npm ${npmArgs.join(' ')}`);
    const resultado = spawnSync('npm', npmArgs, { stdio: 'inherit', env: entorno, shell: process.platform === 'win32' });
    if (resultado.status !== 0) fallar(`Falló «${script}». Vuelve a correr el mismo comando SIN ${VACIAR}: retoma desde la fase que quedó a medias.`);
    if (extra.includes('--listar')) return;
  }
  // En Docker este script corre como root y el backend como `node` (uid 1000): sin esto no podría escribir en las carpetas creadas aquí.
  if (process.getuid?.() === 0) spawnSync('chown', ['-R', '1000:1000', uploads], { stdio: 'inherit' });

  console.log('\n[llenar] Listo: Colegio Los Corazones con 2024, 2025 y 2026 hasta hoy.');
  console.log('[llenar] ADMIN: documento 1000000001, contraseña SIM_ADMIN_PASSWORD (por defecto KlassySim2024*).');
  console.log('[llenar] Personal, docentes, estudiantes y acudientes: su documento y SIM_USUARIOS_PASSWORD (por defecto Klassy2024*).');
}

main().catch((err) => fallar(String(err instanceof Error ? err.message : err)));
