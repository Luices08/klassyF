import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongoUri);

  console.log(`[db] Conectado a MongoDB -> ${mongoose.connection.name}`);

  mongoose.connection.on('error', (err: Error) => {
    console.error('[db] Error de conexion MongoDB:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB desconectado.');
  });
}
