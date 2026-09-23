/**
 * Seed inicial:
 *  - Crea el primer usuario SUPERADMIN (idempotente, usa variables SEED_* del .env).
 *  - Carga el catalogo estandar de grados (Transicion a Once, Ley 115/1994).
 *
 * Uso: npm run seed
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { ROLES } from '../src/constants/roles';
import { NivelEducativo } from '../src/constants/enums';
import Grade from '../src/models/grade.model';
import User from '../src/models/user.model';

interface GradoSeed {
  nivel: NivelEducativo;
  numero: number;
  nombre: string;
}

const GRADOS_COLOMBIA: GradoSeed[] = [
  { nivel: 'PREESCOLAR', numero: 0, nombre: 'Transición' },
  { nivel: 'PRIMARIA', numero: 1, nombre: 'Primero' },
  { nivel: 'PRIMARIA', numero: 2, nombre: 'Segundo' },
  { nivel: 'PRIMARIA', numero: 3, nombre: 'Tercero' },
  { nivel: 'PRIMARIA', numero: 4, nombre: 'Cuarto' },
  { nivel: 'PRIMARIA', numero: 5, nombre: 'Quinto' },
  { nivel: 'SECUNDARIA', numero: 6, nombre: 'Sexto' },
  { nivel: 'SECUNDARIA', numero: 7, nombre: 'Séptimo' },
  { nivel: 'SECUNDARIA', numero: 8, nombre: 'Octavo' },
  { nivel: 'SECUNDARIA', numero: 9, nombre: 'Noveno' },
  { nivel: 'MEDIA', numero: 10, nombre: 'Décimo' },
  { nivel: 'MEDIA', numero: 11, nombre: 'Once' },
];

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SEED_SUPERADMIN_EMAIL as string;
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] SUPERADMIN ya existe (${email}), se omite.`);
    return;
  }

  const user = new User({
    nombre: process.env.SEED_SUPERADMIN_NOMBRE,
    apellido: process.env.SEED_SUPERADMIN_APELLIDO,
    tipo_documento: process.env.SEED_SUPERADMIN_TIPO_DOCUMENTO,
    numero_documento: process.env.SEED_SUPERADMIN_NUMERO_DOCUMENTO,
    email,
    rol: ROLES.SUPERADMIN,
    estado: 'activo',
  });
  user.password = process.env.SEED_SUPERADMIN_PASSWORD as string;
  await user.save();

  console.log(`[seed] SUPERADMIN creado: ${email}`);
}

async function seedGrades(): Promise<void> {
  for (const grade of GRADOS_COLOMBIA) {
    await Grade.findOneAndUpdate({ numero: grade.numero }, grade, { upsert: true });
  }
  console.log(`[seed] Catalogo de ${GRADOS_COLOMBIA.length} grados sincronizado.`);
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[seed] Conectado a MongoDB.');

  await seedSuperAdmin();
  await seedGrades();

  await mongoose.disconnect();
  console.log('[seed] Listo.');
}

run().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
