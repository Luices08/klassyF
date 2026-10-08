import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let servidor: MongoMemoryReplSet | null = null;

/**
 * MongoDB real en memoria, con réplica (las transacciones de `runTransaction` la exigen). Solo para pruebas de
 * integración: no se instala nada fuera de `devDependencies` y nunca toca la base de la instalación.
 */
export async function iniciarBaseDeDatos(): Promise<void> {
  servidor = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(servidor.getUri(), { dbName: 'klassy_pruebas' });
}

export async function limpiarBaseDeDatos(): Promise<void> {
  const colecciones = await mongoose.connection.db!.collections();
  await Promise.all(colecciones.map((c) => c.deleteMany({})));
}

export async function detenerBaseDeDatos(): Promise<void> {
  await mongoose.disconnect();
  await servidor?.stop();
  servidor = null;
}
