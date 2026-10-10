/**
 * Migracion unica (M26): los certificados expedidos antes de que se guardara la sede (`sede_id`) no se pueden asignar a una
 * secretaria por sede; solo el ADMIN los veria. Este script completa `sede_id` a partir de la matricula y su grupo. Es idempotente
 * y no toca el resto del documento (el contenido expedido es inmutable: aqui se usa el driver nativo solo para este campo).
 *
 * Uso: npm run migrate:certificados-sede
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import CertificadoEmitido from '../src/models/certificadoEmitido.model';
import Enrollment from '../src/models/enrollment.model';
import Group from '../src/models/group.model';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  const pendientes = await CertificadoEmitido.collection.find({ $or: [{ sede_id: { $exists: false } }, { sede_id: null }] }, { projection: { enrollment_id: 1 } }).toArray();
  let actualizados = 0;
  let sinSede = 0;
  for (const c of pendientes) {
    const matricula = await Enrollment.findById(c.enrollment_id).select('group_id');
    const grupo = matricula ? await Group.findById(matricula.group_id).select('sede_id') : null;
    if (!grupo) {
      sinSede += 1;
      continue;
    }
    await CertificadoEmitido.collection.updateOne({ _id: c._id }, { $set: { sede_id: grupo.sede_id } });
    actualizados += 1;
  }
  console.log(`[migrate] certificadoemitidos: ${actualizados} con sede completada, ${sinSede} sin matrícula o grupo (solo los ve el ADMIN).`);

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
