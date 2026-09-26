/**
 * Recuperacion de acceso: resetea la contraseña del usuario ADMIN mas antiguo
 * a la definida en SEED_ADMIN_PASSWORD (.env) e imprime las credenciales de
 * login (numero_documento + password) para el nuevo login por documento.
 *
 * Uso: npm run reset-admin-password
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { ROLES } from '../src/constants/roles';
import User from '../src/models/user.model';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[reset-admin] Conectado a MongoDB.');

  const admin = await User.findOne({ rol: ROLES.ADMIN }).sort({ createdAt: 1 });
  if (!admin) {
    console.error('[reset-admin] No hay ningun usuario ADMIN en la base de datos. Corre "npm run seed" primero.');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const nuevaPassword = process.env.SEED_ADMIN_PASSWORD as string;
  admin.password = nuevaPassword;
  admin.estado = 'activo';
  await admin.save();

  console.log('[reset-admin] Contraseña actualizada. Credenciales de acceso:');
  console.log(`  Número de documento: ${admin.numero_documento}`);
  console.log(`  Contraseña: ${nuevaPassword}`);

  await mongoose.disconnect();
  console.log('[reset-admin] Listo.');
}

run().catch((err) => {
  console.error('[reset-admin] Error:', err);
  process.exit(1);
});
