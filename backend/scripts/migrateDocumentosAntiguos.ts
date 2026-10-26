/**
 * Adapta un colegio ya instalado a «los antiguos no entregan documentos» (M04): identidad, foto, EPS, documento del acudiente y diagnóstico de
 * inclusión pasan a pedirse solo al ingreso nuevo y al traslado. Respeta lo que el colegio haya personalizado en «Documentos que se piden».
 * Por defecto SOLO SIMULA; no toca ninguna matrícula salvo que se pida con --limpiar-matriculas.
 *
 * Uso: npm run migrate:documentos-antiguos                                        (simula)
 *      npm run migrate:documentos-antiguos -- --aplicar                           (cambia el catálogo)
 *      npm run migrate:documentos-antiguos -- --aplicar --limpiar-matriculas      (además retira lo pendiente de las pre-matrículas de antiguos)
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

import { env } from '../src/config/env';
import { adaptarDocumentosDeAntiguos, type AccionSobreRequisito } from '../src/services/migracionDocumentosAntiguos.service';

const TEXTO: Record<AccionSobreRequisito, string> = {
  ACTUALIZAR: 'se pedía a todos → pasa a ingreso nuevo y traslado',
  YA_ESTABA: 'ya era solo de ingreso nuevo y traslado',
  PERSONALIZADO: 'el colegio lo personalizó: no se toca',
  NO_EXISTE: 'el colegio lo eliminó del catálogo: no hay nada que hacer',
};

async function run(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const limpiarMatriculas = process.argv.includes('--limpiar-matriculas');
  await mongoose.connect(env.mongoUri);
  console.log(`[migrate] Conectado a MongoDB${aplicar ? '' : ' (simulación: no se escribe nada, usa --aplicar)'}.`);

  const resultado = await adaptarDocumentosDeAntiguos({ aplicar, limpiar_matriculas: limpiarMatriculas });
  for (const r of resultado.requisitos) console.log(`[migrate]  ${r.clave}: ${TEXTO[r.accion]}`);
  if (limpiarMatriculas) {
    const m = resultado.matriculas;
    console.log(`[migrate] Matrículas de antiguos con esos documentos pendientes: ${m.con_pendientes} (${m.items_retirados} documento(s) por retirar, ${m.pasan_a_definitiva} condicional(es) pasarían a definitiva).`);
  } else {
    console.log('[migrate] Ninguna matrícula se toca (usa --limpiar-matriculas para retirar lo pendiente de las pre-matrículas de antiguos).');
  }
  console.log(aplicar ? '[migrate] Aplicado.' : '[migrate] Simulación terminada: nada cambió.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[migrate] Falló:', err);
  await mongoose.disconnect();
  process.exit(1);
});
