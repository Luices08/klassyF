/**
 * Respaldo al terminar cada fase: la base (mongodump) y la carpeta de archivos (los PDF de planes y soportes viven en disco,
 * no en Mongo). Restaurar deja la simulación exactamente en ese punto, para retomar con `--desde`.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function correr(comando: string, args: string[]): void {
  const r = spawnSync(comando, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.error) throw new Error(`No se pudo ejecutar ${comando}: ${r.error.message}. ¿Están instaladas las herramientas de MongoDB?`);
  if (r.status !== 0) throw new Error(`${comando} terminó con código ${r.status}: ${r.stderr.toString().slice(-500)}`);
}

function nombreArchivo(clave: string): string {
  return clave.replace(/[^a-zA-Z0-9-]+/g, '_');
}

export function respaldar(uri: string, uploadsDir: string, respaldosDir: string, clave: string): string {
  fs.mkdirSync(respaldosDir, { recursive: true });
  const base = path.join(respaldosDir, nombreArchivo(clave));
  correr('mongodump', [`--uri=${uri}`, `--archive=${base}.db.gz`, '--gzip', '--quiet']);
  fs.mkdirSync(uploadsDir, { recursive: true });
  correr('tar', ['-czf', `${base}.archivos.tgz`, '-C', path.dirname(uploadsDir), path.basename(uploadsDir)]);
  return base;
}

export function existeRespaldo(respaldosDir: string, clave: string): boolean {
  return fs.existsSync(path.join(respaldosDir, `${nombreArchivo(clave)}.db.gz`));
}

export function restaurar(uri: string, uploadsDir: string, respaldosDir: string, clave: string): void {
  const base = path.join(respaldosDir, nombreArchivo(clave));
  if (!fs.existsSync(`${base}.db.gz`)) throw new Error(`No hay respaldo de la fase ${clave} en ${respaldosDir}.`);
  correr('mongorestore', [`--uri=${uri}`, `--archive=${base}.db.gz`, '--gzip', '--drop', '--quiet']);
  // Se vacía el contenido y no la carpeta: en Docker es un volumen montado y no se puede borrar.
  fs.mkdirSync(uploadsDir, { recursive: true });
  for (const entrada of fs.readdirSync(uploadsDir)) fs.rmSync(path.join(uploadsDir, entrada), { recursive: true, force: true });
  correr('tar', ['-xzf', `${base}.archivos.tgz`, '-C', path.dirname(uploadsDir)]);
}
