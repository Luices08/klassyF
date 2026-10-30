/**
 * Migración única: las solicitudes de admisión pasan de los estados de la prematrícula con cupos reservados
 * (PENDIENTE, EN_REVISION, CUPO_RESERVADO, EN_ESPERA, APROBADA) a los actuales (PENDIENTE, ADMITIDO, MATRICULADO, RECHAZADA).
 *   - EN_REVISION, CUPO_RESERVADO y EN_ESPERA -> PENDIENTE (el cupo reservado ya no existe: se quita `reserva`).
 *   - APROBADA con matrícula (la preinscrita o la formalizada) -> MATRICULADO, para que la familia siga viendo su preinscripción.
 *   - APROBADA sin matrícula -> ADMITIDO.
 * Con --aplicar también elimina las colecciones de la lista de espera y la ventana de prematrícula, que ya no tienen modelo.
 * Por defecto solo simula. Es idempotente. Hacer respaldo de Mongo antes de aplicar.
 *
 * Uso: npm run migrate:solicitudes-admision [-- --aplicar]
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';

const COLECCIONES_RETIRADAS = ['listaesperarematriculas', 'configuracionprematriculas'];

async function run(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  await mongoose.connect(env.mongoUri);
  const db = mongoose.connection.db!;
  const solicitudes = db.collection('admissionrequests');
  console.log(`[migrate] ${aplicar ? 'APLICANDO' : 'SIMULACIÓN (usa --aplicar para escribir)'}`);

  const aPendiente = { estado: { $in: ['EN_REVISION', 'CUPO_RESERVADO', 'EN_ESPERA'] } };
  const aprobadasConMatricula = { estado: 'APROBADA', enrollment_id: { $ne: null } };
  const aprobadasSinMatricula = { estado: 'APROBADA', $or: [{ enrollment_id: null }, { enrollment_id: { $exists: false } }] };
  const conReserva = { reserva: { $exists: true } };

  const conteos = {
    a_pendiente: await solicitudes.countDocuments(aPendiente),
    aprobadas_a_matriculado: await solicitudes.countDocuments(aprobadasConMatricula),
    aprobadas_a_admitido: await solicitudes.countDocuments(aprobadasSinMatricula),
    con_reserva: await solicitudes.countDocuments(conReserva),
  };
  console.log('[migrate]', conteos);

  if (aplicar) {
    await solicitudes.updateMany(aPendiente, { $set: { estado: 'PENDIENTE' } });
    await solicitudes.updateMany(aprobadasConMatricula, { $set: { estado: 'MATRICULADO' } });
    await solicitudes.updateMany(aprobadasSinMatricula, { $set: { estado: 'ADMITIDO' } });
    await solicitudes.updateMany(conReserva, { $unset: { reserva: '' } });
  }

  const existentes = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const nombre of COLECCIONES_RETIRADAS) {
    if (!existentes.has(nombre)) continue;
    const n = await db.collection(nombre).countDocuments();
    console.log(`[migrate] Colección ${nombre}: ${n} documento(s)${aplicar ? ' -> eliminada' : ''}.`);
    if (aplicar) await db.collection(nombre).drop();
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
