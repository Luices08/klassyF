/**
 * Migración única al segmentar los líderes de área (M07): antes cada área tenía un solo líder en `areas.lider_id` y un plan de
 * área por área; ahora cada líder es un registro (`LiderArea`) con su alcance —niveles, diurna/nocturna y sedes— y el plan de
 * área cuelga de él.
 *   - Crea un `LiderArea` con el alcance por defecto (todos los niveles, todas las jornadas, todas las sedes) por cada área con líder.
 *   - Liga cada plan de área existente al líder de su área (si el área ya no tiene líder, crea uno inactivo con quien subió el plan).
 *   - Quita `areas.lider_id` y reemplaza el índice único de `planareas` (año + área) por el de (año + líder).
 * Es idempotente. Por defecto solo SIMULA; antes de aplicarla haz un respaldo de la base de datos.
 *
 * Uso:
 *   npm run migrate:lideres-de-area            (simula)
 *   npm run migrate:lideres-de-area -- --aplicar
 */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import Area from '../src/models/area.model';
import LiderArea from '../src/models/liderArea.model';
import PlanArea from '../src/models/planArea.model';

const aplicar = process.argv.includes('--aplicar');

interface PlanViejo {
  _id: Types.ObjectId;
  area_id: Types.ObjectId;
  versiones?: Array<{ subido_por?: Types.ObjectId }>;
}

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] Conectado a MongoDB. Modo: ${aplicar ? 'APLICAR' : 'simulación (no se cambia nada)'}.`);

  // 1. Un líder con alcance por defecto por cada área que tenía `lider_id` (campo que el modelo ya no declara: se lee en crudo).
  const areasConLider = await Area.collection.find({ lider_id: { $ne: null } }).toArray();
  let creados = 0;
  for (const area of areasConLider) {
    if (await LiderArea.exists({ area_id: area._id, docente_id: area.lider_id })) continue;
    creados += 1;
    if (aplicar) await LiderArea.create({ area_id: area._id, docente_id: area.lider_id, niveles: [], jornada: 'TODAS', sedes_ids: [] });
  }
  console.log(`[migrate] areas: ${areasConLider.length} con líder; ${creados} registro(s) de líder ${aplicar ? 'creados' : 'se crearían'}.`);

  // 2. Cada plan de área existente se liga al líder de su área.
  const sinLider = (await PlanArea.collection.find({ lider_area_id: { $exists: false } }).toArray()) as unknown as PlanViejo[];
  let ligados = 0;
  let inactivosCreados = 0;
  for (const plan of sinLider) {
    let lider = await LiderArea.findOne({ area_id: plan.area_id, estado: { $ne: 'inactivo' } }).sort({ createdAt: 1 });
    if (!lider) lider = await LiderArea.findOne({ area_id: plan.area_id }).sort({ createdAt: 1 });
    // En simulación el líder de un área con `lider_id` aún no existe: no se cuenta como uno inactivo.
    if (!lider && !areasConLider.some((a) => String(a._id) === String(plan.area_id)) && plan.versiones?.[0]?.subido_por) {
      inactivosCreados += 1;
      if (aplicar) {
        lider = await LiderArea.create({ area_id: plan.area_id, docente_id: plan.versiones[0].subido_por, niveles: [], jornada: 'TODAS', sedes_ids: [], estado: 'inactivo' });
      }
    }
    ligados += 1;
    if (aplicar && lider) await PlanArea.collection.updateOne({ _id: plan._id }, { $set: { lider_area_id: lider._id } });
  }
  console.log(`[migrate] planareas: ${sinLider.length} sin líder ligado; ${ligados} ${aplicar ? 'ligados' : 'se ligarían'} (${inactivosCreados} con un líder inactivo creado a partir de quien subió el plan).`);

  // 3. Fuera el campo viejo y los índices al día (el único de año+área ya no aplica: un área puede tener varios planes).
  const conCampoViejo = await Area.collection.countDocuments({ lider_id: { $exists: true } });
  if (aplicar) {
    if (conCampoViejo > 0) await Area.collection.updateMany({ lider_id: { $exists: true } }, { $unset: { lider_id: '' } });
    await PlanArea.syncIndexes();
    await LiderArea.syncIndexes();
  }
  console.log(`[migrate] areas: ${conCampoViejo} documento(s) ${aplicar ? 'sin' : 'perderían'} lider_id; índices de planareas ${aplicar ? 'sincronizados' : 'se sincronizarían'}.`);

  await mongoose.disconnect();
  console.log(aplicar ? '[migrate] Listo.' : '[migrate] Simulación terminada. Con un respaldo hecho, repite con --aplicar.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
