/**
 * Migración única al rehacer M07 como planeación documental (PDF): retira lo que dejó el banco de referentes y el
 * desarrollo curricular estructurado.
 *   - Elimina las colecciones del banco (DBA, EBC, lineamientos) y de los desarrollos curriculares.
 *   - Quita de `activities` los campos `desarrollo_curricular_id`, `dba_id` y `competencia_evaluada`.
 *   - Quita de `ajusteasignaturas` el campo `dba_ids` (el objetivo flexibilizado en texto libre se conserva).
 * No toca los PIAR ya emitidos: sus documentos congelan su propio texto. Es idempotente.
 *
 * DESTRUCTIVA: por defecto solo SIMULA y cuenta lo que haría. Antes de aplicarla haz un respaldo de la base de datos.
 *
 * Uso:
 *   npm run migrate:retirar-banco-curricular            (simula)
 *   npm run migrate:retirar-banco-curricular -- --aplicar
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';

const aplicar = process.argv.includes('--aplicar');

// Los modelos ya no existen en el código: se localizan por el nombre que Mongoose les puso a las colecciones.
const COLECCIONES_A_ELIMINAR = ['referentecurriculars', 'curriculardevelopments'];

const CAMPOS_A_QUITAR: Array<{ coleccion: string; campos: string[] }> = [
  { coleccion: 'activities', campos: ['desarrollo_curricular_id', 'dba_id', 'competencia_evaluada'] },
  { coleccion: 'ajusteasignaturas', campos: ['dba_ids'] },
];

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] Conectado a MongoDB. Modo: ${aplicar ? 'APLICAR' : 'simulación (no se cambia nada)'}.`);

  const db = mongoose.connection.db!;
  const existentes = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const nombre of COLECCIONES_A_ELIMINAR) {
    if (!existentes.has(nombre)) {
      console.log(`[migrate] ${nombre}: no existe, nada que eliminar.`);
      continue;
    }
    const total = await db.collection(nombre).countDocuments();
    if (aplicar) await db.collection(nombre).drop();
    console.log(`[migrate] ${nombre}: ${total} documento(s) ${aplicar ? 'eliminados con la colección' : 'se eliminarían con la colección'}.`);
  }

  for (const { coleccion, campos } of CAMPOS_A_QUITAR) {
    if (!existentes.has(coleccion)) {
      console.log(`[migrate] ${coleccion}: no existe, nada que limpiar.`);
      continue;
    }
    const filtro = { $or: campos.map((campo) => ({ [campo]: { $exists: true } })) };
    const afectados = await db.collection(coleccion).countDocuments(filtro);
    if (aplicar && afectados > 0) {
      await db.collection(coleccion).updateMany(filtro, { $unset: Object.fromEntries(campos.map((campo) => [campo, ''])) });
    }
    console.log(`[migrate] ${coleccion}: ${afectados} documento(s) ${aplicar ? 'sin' : 'perderían'} ${campos.join(', ')}.`);
  }

  await mongoose.disconnect();
  console.log(aplicar ? '[migrate] Listo.' : '[migrate] Simulación terminada. Con un respaldo hecho, repite con --aplicar.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
