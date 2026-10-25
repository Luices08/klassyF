/**
 * Genera el modelo de demostración del módulo predictivo con la base de la SIMULACIÓN (`klassy_sim`, nunca la de trabajo): arma las filas
 * con el mismo código que usa el entrenamiento del ADMIN, entrena, prueba y escribe `src/modulos/predictivo/modeloDemostracion.ts`.
 * Solo lee la base. Uso (desde backend/, con la simulación ya corrida): npm run predictivo:modelo-demo
 */
import { MONGO_URI_SIM, nombreDeBase } from '../simulacion/nucleo/entorno';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { VERSION_ENTRADAS } from '../../src/modulos/predictivo/constants/predictivo';
import { armarConjunto } from '../../src/modulos/predictivo/services/conjunto.service';
import { entrenarYEvaluar } from '../../src/modulos/predictivo/utils/entrenamiento';
import { motivoDeRechazo } from '../../src/modulos/predictivo/utils/metricas';

const DESTINO = path.resolve(__dirname, '../../src/modulos/predictivo/modeloDemostracion.ts');

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI_SIM);
  try {
    console.log(`Leyendo «${nombreDeBase(MONGO_URI_SIM)}»…`);
    const { filas, anios } = await armarConjunto();
    if (filas.length === 0) throw new Error('La simulación no tiene años cerrados con cierre de promoción: corre primero npm run sim.');
    console.log(`  ${filas.length} filas de ${anios.join(', ')} (positivas: ${filas.filter((f) => f.y === 1).length}). Entrenando…`);
    const r = entrenarYEvaluar(filas);
    const motivo = motivoDeRechazo(r.metricas);
    console.log(`  prueba (${r.criterio_prueba}${r.anio_prueba ? ` ${r.anio_prueba}` : ''}): ${r.filas_prueba} filas · AUC ${r.metricas.auc} · Brier ${r.metricas.brier} (referencia ${r.metricas.brier_referencia})`);
    if (motivo) throw new Error(`El modelo no pasó la prueba: ${motivo}`);

    // Los pesos de Brain.js son float32: nueve cifras los conservan exactos y el literal no pierde precisión al leerse.
    const nueveCifras = (_: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(9)) : v);
    const modelo = { generado: new Date().toISOString(), version_entradas: VERSION_ENTRADAS, anios_usados: anios, metricas: r.metricas, red: r.red };
    const original = fs.readFileSync(DESTINO, 'utf8');
    const cabecera = original.slice(0, original.indexOf('export const MODELO_DEMOSTRACION'));
    fs.writeFileSync(DESTINO, `${cabecera}export const MODELO_DEMOSTRACION: ModeloDemostracion | null = ${JSON.stringify(modelo, nueveCifras)};\n`);
    console.log(`Escrito en ${path.relative(process.cwd(), DESTINO)}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
