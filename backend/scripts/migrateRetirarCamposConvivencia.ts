/**
 * Migracion de limpieza de M15 (alineacion con el Decreto 1965 de 2013). Retira de los datos ya guardados dos campos que el sistema dejo
 * de usar y que ningun codigo lee:
 *  - `descuento_decimas` de las faltas del manual (nunca se aplico a una nota; descontar notas por conducta exige un procedimiento
 *    propio con derecho de contradiccion y vive en la evaluacion, no en el catalogo de faltas).
 *  - `remite_a_orientacion` de las medidas, de los pasos de los protocolos y de los pasos copiados a cada caso (la remision a orientacion
 *    es siempre manual: la hace convivencia desde el caso).
 * Las remisiones ya creadas por una medida o un paso se conservan tal cual (son historial de orientacion).
 *
 * Los modelos ya ignoran estos campos: el script solo deja la base limpia. Es idempotente. Por defecto solo SIMULA; con --aplicar escribe.
 * Hacer respaldo de Mongo antes de aplicar.
 *
 * Uso: npm run migrate:retirar-campos-convivencia [-- --aplicar]
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import CasoConvivencia from '../src/models/casoConvivencia.model';
import { MedidaConvivencia, ProtocoloConvivencia } from '../src/models/catalogosCaso.model';
import FaltaConvivencia from '../src/models/faltaConvivencia.model';

const aplicar = process.argv.includes('--aplicar');

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] Conectado a MongoDB. Modo: ${aplicar ? 'APLICAR' : 'SIMULACION (usa --aplicar para escribir)'}.`);

  // Driver nativo: el modelo ya no declara estos campos, asi que consultarlos por Mongoose no los vería.
  const tareas = [
    { nombre: 'faltas del manual (descuento_decimas)', coleccion: FaltaConvivencia.collection, filtro: { descuento_decimas: { $exists: true } }, quitar: { $unset: { descuento_decimas: '' } } },
    { nombre: 'medidas (remite_a_orientacion)', coleccion: MedidaConvivencia.collection, filtro: { remite_a_orientacion: { $exists: true } }, quitar: { $unset: { remite_a_orientacion: '' } } },
    {
      nombre: 'pasos de protocolos (remite_a_orientacion)',
      coleccion: ProtocoloConvivencia.collection,
      filtro: { 'pasos.remite_a_orientacion': { $exists: true } },
      quitar: { $unset: { 'pasos.$[].remite_a_orientacion': '' } },
    },
    {
      nombre: 'pasos de casos (remite_a_orientacion)',
      coleccion: CasoConvivencia.collection,
      filtro: { 'pasos.remite_a_orientacion': { $exists: true } },
      quitar: { $unset: { 'pasos.$[].remite_a_orientacion': '' } },
    },
  ];

  for (const tarea of tareas) {
    const pendientes = await tarea.coleccion.countDocuments(tarea.filtro);
    if (!aplicar) {
      console.log(`[migrate] ${tarea.nombre}: ${pendientes} documento(s) por limpiar.`);
      continue;
    }
    // Sin marcas de tiempo: limpiar un campo muerto no es una edicion del registro.
    const res = await tarea.coleccion.updateMany(tarea.filtro, tarea.quitar);
    console.log(`[migrate] ${tarea.nombre}: ${res.modifiedCount} documento(s) limpiados.`);
  }

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
