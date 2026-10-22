/**
 * Depura los archivos adjuntos de las entregas de un periodo CERRADO (M11) para liberar disco en el VPS. Borra solo el archivo
 * físico: la nota, la retroalimentación, el estado y las fechas de entrega quedan intactos en la base, y la entrega pasa a mostrar
 * «Archivo depurado por política institucional». No se puede deshacer: haz respaldo de `uploads/` antes (`deploy/respaldar.sh`).
 *
 * Uso: npm run storage:purge-periodo -- --periodoId=<_id del periodo> [--olderThanDays=30] [--dry-run]
 *   --periodoId       `_id` del periodo dentro del año lectivo (AcademicYear.periodos[]._id).
 *   --olderThanDays   días de espera tras terminar el periodo (o tras la entrega, si fue posterior). Por defecto 30.
 *   --dry-run         solo cuenta lo que borraría; no toca disco ni base.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { depurarArchivosDePeriodo } from '../src/services/purgaAlmacenamiento.service';
import { interpretarArgumentosPurga } from '../src/utils/purgaAlmacenamiento';

async function run(): Promise<void> {
  const { periodoId, dias, simular } = interpretarArgumentosPurga(process.argv.slice(2));

  await mongoose.connect(env.mongoUri);
  try {
    const r = await depurarArchivosDePeriodo(periodoId, { dias, simular });
    const accion = simular ? 'se borrarían' : 'borrados';
    console.log(`[storage] Año ${r.periodo.anio}, ${r.periodo.nombre} (periodo ${r.periodo.numero})${simular ? ' — SIMULACIÓN, no se tocó nada' : ''}`);
    console.log(`[storage] Archivos ${accion}: ${r.archivos_borrados} en ${r.entregas_afectadas} entregas`);
    console.log(`[storage] Espacio ${simular ? 'por liberar' : 'liberado'}: ${r.mb_liberados} MB`);
    if (r.archivos_ya_ausentes > 0) console.log(`[storage] Ya no estaban en disco (se marcaron como depurados): ${r.archivos_ya_ausentes}`);
    if (r.archivos_recientes > 0) console.log(`[storage] Omitidos por tener menos de ${r.dias} días: ${r.archivos_recientes}`);
    if (r.errores.length > 0) {
      console.error(`[storage] Con errores (${r.errores.length}); vuelve a correr para reintentarlos:`);
      r.errores.forEach((e) => console.error(`  - ${e}`));
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('[storage] Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
