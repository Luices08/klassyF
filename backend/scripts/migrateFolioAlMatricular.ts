/**
 * Migracion unica: el folio del Libro de Matricula ahora se asigna al formalizar
 * la matricula (PREINSCRITO -> MATRICULADO_*), no al preinscribir. Este script:
 *   1. Reemplaza los indices unicos de folio por versiones parciales (que ignoran
 *      los null; los viejos impedirian tener mas de un PREINSCRITO sin folio).
 *   2. Libera el folio de las matriculas que siguen PREINSCRITO.
 *   3. Reajusta cada contador del libro al mayor folio que sigue en uso, para que
 *      los folios liberados al final del libro se reutilicen. Los huecos que queden
 *      en medio no se pueden corregir sin renumerar folios ya emitidos: se reportan.
 * Es idempotente.
 *
 * Uso: npm run migrate:folio-al-matricular
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import Counter from '../src/models/counter.model';
import Enrollment from '../src/dominios/registro/matriculas/enrollment.model';

const INDICES_FOLIO = ['folio_matricula_1', 'numero_libro_1_numero_folio_1'];
// L{libro}-F{folio}-{año}
const PATRON_FOLIO = /^L(\d+)-F(\d+)-(\d{4})$/;

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('[migrate] Conectado a MongoDB.');

  const coleccion = Enrollment.collection;

  const indices = await coleccion.indexes();
  for (const nombre of INDICES_FOLIO) {
    const existente = indices.find((i) => i.name === nombre);
    if (existente && !existente.partialFilterExpression) {
      await coleccion.dropIndex(nombre);
      console.log(`[migrate] Índice ${nombre} (no parcial) eliminado.`);
    }
  }

  const liberadas = await coleccion.updateMany(
    { estado: 'PREINSCRITO', folio_matricula: { $ne: null } },
    { $set: { folio_matricula: null, numero_libro: null, numero_folio: null } }
  );
  console.log(`[migrate] ${liberadas.modifiedCount} folio(s) de matrículas PREINSCRITAS liberados.`);

  await Enrollment.createIndexes();
  console.log('[migrate] Índices parciales de folio creados.');

  // Mayor folio en uso y cantidad de folios por contador (libro, año).
  const enUso = new Map<string, number[]>();
  const conFolio = await coleccion.find({ folio_matricula: { $type: 'string' } }, { projection: { folio_matricula: 1 } }).toArray();
  for (const m of conFolio) {
    const partes = PATRON_FOLIO.exec(String(m.folio_matricula));
    if (!partes) continue;
    const clave = `MAT-${partes[3]}-L${Number(partes[1])}`;
    enUso.set(clave, [...(enUso.get(clave) ?? []), Number(partes[2])]);
  }

  const contadores = await Counter.find({ _id: /^MAT-\d{4}-L\d+$/ });
  for (const contador of contadores) {
    const folios = enUso.get(String(contador._id)) ?? [];
    const maximo = folios.length ? Math.max(...folios) : 0;
    if (contador.seq !== maximo) {
      await Counter.updateOne({ _id: contador._id }, { $set: { seq: maximo } });
      console.log(`[migrate] Contador ${contador._id}: ${contador.seq} -> ${maximo}.`);
    }
    const huecos = maximo - folios.length;
    if (huecos > 0) {
      console.warn(`[migrate] AVISO ${contador._id}: ${huecos} hueco(s) en medio del libro (folios liberados que no se pueden reutilizar sin renumerar).`);
    }
  }

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
