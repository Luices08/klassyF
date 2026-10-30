/**
 * Migración única: un estudiante tiene una sola matrícula viva (PREINSCRITO o MATRICULADO_*) por año lectivo.
 * Antes nada lo impedía y quedaron estudiantes matriculados en dos grupos con dos folios. Este script:
 *   1. Lista los estudiantes con más de una matrícula viva en el mismo año.
 *   2. Con `--aplicar`, conserva una (`--conservar=reciente`, por defecto, o `--conservar=antigua`) y ANULA las demás con
 *      su motivo: libera el cupo del grupo y deja el folio como asiento del Libro de Matrícula (no se renumera).
 *   3. Reemplaza el índice no único `student_id_1_academic_year_id_1` y crea el único parcial `matricula_viva_unica`.
 * Por defecto solo simula y no toca índices. Es idempotente.
 *
 * Uso: npm run migrate:matricula-unica [-- --aplicar] [-- --conservar=antigua]
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { ESTADOS_MATRICULA_VIVOS } from '../src/constants/enums';
import Enrollment from '../src/models/enrollment.model';
import Group from '../src/models/group.model';
import User from '../src/models/user.model';

const aplicar = process.argv.includes('--aplicar');
const conservar = process.argv.includes('--conservar=antigua') ? 'antigua' : 'reciente';

async function run(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] Conectado a MongoDB. Modo: ${aplicar ? 'APLICAR' : 'simulación'}; se conserva la matrícula más ${conservar}.`);

  const duplicados = await Enrollment.aggregate<{ _id: { student_id: mongoose.Types.ObjectId; academic_year_id: mongoose.Types.ObjectId }; ids: mongoose.Types.ObjectId[] }>([
    { $match: { estado: { $in: ESTADOS_MATRICULA_VIVOS } } },
    { $group: { _id: { student_id: '$student_id', academic_year_id: '$academic_year_id' }, ids: { $push: '$_id' }, total: { $sum: 1 } } },
    { $match: { total: { $gt: 1 } } },
  ]);
  console.log(`[migrate] ${duplicados.length} estudiante(s) con más de una matrícula viva en el mismo año.`);

  let anuladas = 0;
  for (const { _id, ids } of duplicados) {
    const matriculas = await Enrollment.find({ _id: { $in: ids } }).sort({ createdAt: 1 });
    const estudiante = await User.findById(_id.student_id).select('nombre apellido numero_documento');
    console.log(`\n[migrate] ${estudiante?.apellido ?? '?'} ${estudiante?.nombre ?? ''} (${estudiante?.numero_documento ?? _id.student_id}):`);
    const conservada = conservar === 'antigua' ? matriculas[0]! : matriculas[matriculas.length - 1]!;
    for (const m of matriculas) {
      const grupo = await Group.findById(m.group_id).select('nomenclatura');
      const etiqueta = `${grupo?.nomenclatura ?? m.group_id} · ${m.estado} · folio ${m.folio_matricula ?? 'sin folio'}`;
      if (m._id.equals(conservada._id)) {
        console.log(`   se conserva: ${etiqueta}`);
        continue;
      }
      console.log(`   se anula:    ${etiqueta}`);
      if (!aplicar) continue;
      m.estado = 'ANULADO';
      m.motivo_retiro = `Matrícula duplicada: el estudiante ya tenía otra en el mismo año (se conservó el folio ${conservada.folio_matricula ?? 'sin folio'}).`;
      await m.save();
      await Group.updateOne({ _id: m.group_id, cupos_ocupados: { $gt: 0 } }, { $inc: { cupos_ocupados: -1 } });
      anuladas += 1;
    }
  }

  if (!aplicar && duplicados.length > 0) {
    console.log('\n[migrate] Simulación: no se cambió nada. Revisa la lista y corre de nuevo con --aplicar (haz respaldo de Mongo antes).');
  } else {
    await Enrollment.createCollection();
    const coleccion = Enrollment.collection;
    const indices = await coleccion.indexes();
    const viejo = indices.find((i) => i.name === 'student_id_1_academic_year_id_1');
    if (viejo) {
      await coleccion.dropIndex('student_id_1_academic_year_id_1');
      console.log('[migrate] Índice student_id_1_academic_year_id_1 eliminado.');
    }
    await Enrollment.createIndexes();
    console.log(`[migrate] ${anuladas} matrícula(s) anulada(s); índice único matricula_viva_unica creado.`);
  }

  await mongoose.disconnect();
  console.log('[migrate] Listo.');
}

run().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
