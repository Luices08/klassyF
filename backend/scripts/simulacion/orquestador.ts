/**
 * Simulación multi-año de un colegio para poblar una base de demostración (y, más adelante, entrenar la predicción de
 * desempeño). Corre las fases en orden contra una base propia (`klassy_sim`), con el reloj del proceso movido a la fecha de cada
 * paso, y deja un respaldo al terminar cada fase para retomar desde ahí.
 *
 * Uso (desde backend/):
 *   npm run sim                         → corre todo lo que falte
 *   npm run sim -- --hasta=2024/inicio-anio
 *   npm run sim -- --desde=2024/preparar-anio --rehacer
 *   npm run sim -- --listar
 *   npm run sim -- --corte=2026-06-30   → simula solo hasta ese día (por defecto, el de la configuración)
 * Ver scripts/simulacion/LEEME.md.
 */
// El reloj y el entorno van primero: todo lo que se importe después ya ve la fecha simulada y la base de la simulación.
import { ahoraReal, alMoverReloj, horaReal, irA } from './nucleo/reloj';
import { MONGO_URI_SIM, RESPALDOS_DIR_SIM, UPLOADS_DIR_SIM, nombreDeBase } from './nucleo/entorno';
import path from 'path';
import mongoose from 'mongoose';
import { detenerApi, ErrorApi, iniciarApi } from './nucleo/api';
import { aLaHora, diaDelAnio, sumarDias } from './nucleo/fechas';
import { baseAjena, fases, registro } from './nucleo/registro';
import { existeRespaldo, respaldar, restaurar } from './nucleo/respaldo';
import { cargarConfiguracion, ConfigSimulacion } from './configuracion';
import { ContextoFase } from './fases/comun';
import { faseBase } from './fases/base';
import { fasePrepararAnio } from './fases/prepararAnio';
import { faseInicioAnio } from './fases/inicioAnio';
import { fasePeriodo } from './fases/periodo';
import { faseCierreAnio } from './fases/cierreAnio';
import { faseRematricula } from './fases/rematricula';

interface Fase {
  clave: string;
  correr: (ctx: ContextoFase) => Promise<void>;
}

/** Último día simulado: `--corte=AAAA-MM-DD`, o el de la configuración, o hoy. */
function diaDeCorte(config: ConfigSimulacion): Date {
  const texto = opcion('corte') ?? config.fecha_corte ?? ahoraReal().toISOString();
  const dia = new Date(`${texto.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(dia.getTime())) throw new Error(`La fecha de corte «${texto}» no es válida (AAAA-MM-DD).`);
  return dia;
}

/**
 * Las fases en el orden en que se ejecutan: la base y, por cada año, preparar el año, matricular (el primero desde cero y los
 * demás con el paso de año), los periodos y el cierre. Solo entran las que empiezan antes del corte: el año de hoy queda abierto,
 * con el periodo en curso a medias.
 */
function planDeFases(config: ConfigSimulacion, corte: Date): Fase[] {
  const fases: Fase[] = [{ clave: 'base', correr: faseBase }];
  const cal = config.calendario;
  const ultimo = cal.periodos[cal.periodos.length - 1];
  config.anios.forEach((anio, i) => {
    if (diaDelAnio(anio, '01-08') > corte) return;
    fases.push({ clave: `${anio}/preparar-anio`, correr: (ctx) => fasePrepararAnio(ctx, anio) });
    fases.push(i === 0 ? { clave: `${anio}/inicio-anio`, correr: (ctx) => faseInicioAnio(ctx, anio) } : { clave: `${anio}/inicio-anio`, correr: (ctx) => faseRematricula(ctx, anio) });
    for (const p of cal.periodos) {
      if (diaDelAnio(anio, p.inicio) <= corte) fases.push({ clave: `${anio}/periodo-${p.numero}`, correr: (ctx) => fasePeriodo(ctx, anio, p.numero) });
    }
    // El cierre ocurre unos días después de la fecha límite de la recuperación final.
    if (ultimo && sumarDias(diaDelAnio(anio, cal.recuperacion_final.limite_resultados), 3) <= corte) fases.push({ clave: `${anio}/cierre-anio`, correr: (ctx) => faseCierreAnio(ctx, anio) });
  });
  return fases;
}

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}
const bandera = (nombre: string) => process.argv.includes(`--${nombre}`);

function log(mensaje: string): void {
  console.log(`[sim] ${mensaje}`);
}

async function prepararColecciones(): Promise<void> {
  // En una base vacía, crear colecciones e índices antes de la primera transacción evita choques de catálogo y deja listos los índices únicos.
  for (const nombre of mongoose.modelNames()) {
    const modelo = mongoose.model(nombre);
    await modelo.createCollection().catch(() => undefined);
    await modelo.init();
  }
}

async function main(): Promise<void> {
  const rutaConfig = opcion('config') ?? path.join(__dirname, 'config', 'colegio-pequeno.json');
  const config = cargarConfiguracion(rutaConfig);
  const semilla = Number(opcion('semilla') ?? config.semilla);
  const corte = diaDeCorte(config);
  const plan = planDeFases(config, corte);

  if (bandera('listar')) {
    for (const f of plan) console.log(f.clave);
    return;
  }

  irA(aLaHora(new Date(config.inicio_simulacion), '08:00'));
  await mongoose.connect(MONGO_URI_SIM);
  // Mongoose da la conexión por caída si su último latido parece de hace más de dos intervalos (lo mide con el reloj
  // simulado): al saltar en el tiempo se corre también esa marca, o las transacciones esperan una reconexión que nunca llega.
  alMoverReloj((salto) => {
    const conexion = mongoose.connection as unknown as { _lastHeartbeatAt: number | null };
    if (conexion._lastHeartbeatAt != null) conexion._lastHeartbeatAt += salto;
  });
  log(`Base: ${nombreDeBase(MONGO_URI_SIM)} · archivos: ${UPLOADS_DIR_SIM} · respaldos: ${RESPALDOS_DIR_SIM}`);
  if (await baseAjena()) {
    throw new Error('La base tiene usuarios que no creó la simulación. Usa una base vacía (SIM_MONGO_URI) para no tocar datos reales.');
  }
  await iniciarApi();
  await prepararColecciones();

  const claves = plan.map((f) => f.clave);
  const indice = (clave: string | undefined, nombre: string) => {
    if (clave === undefined) return undefined;
    const i = claves.indexOf(clave);
    if (i < 0) throw new Error(`--${nombre}=${clave} no es una fase. Fases: ${claves.join(', ')}`);
    return i;
  };
  const terminadas = new Set(await fases.terminadas());
  const solo = indice(opcion('solo'), 'solo');
  let desde = solo ?? indice(opcion('desde'), 'desde') ?? claves.findIndex((c) => !terminadas.has(c));
  const hasta = solo ?? indice(opcion('hasta'), 'hasta') ?? claves.length - 1;
  if (desde < 0) {
    log('Todas las fases del plan ya están hechas. Usa --desde=<fase> --rehacer para repetir una.');
    return;
  }

  const yaHechas = claves.slice(desde, hasta + 1).filter((c) => terminadas.has(c));
  // Una fase que falló a medias deja la base con datos sueltos: se vuelve siempre al respaldo de la fase anterior.
  const aMedias = await registro.leerOpcional<string>('fase-en-curso');
  if (yaHechas.length > 0 && !bandera('rehacer')) {
    throw new Error(`Ya están hechas: ${yaHechas.join(', ')}. Agrega --rehacer para volver a correrlas desde el respaldo anterior.`);
  }
  if (yaHechas.length > 0 || aMedias) {
    if (aMedias) log(`La fase ${aMedias} quedó a medias.`);
    const anterior = claves[desde - 1];
    if (anterior && !existeRespaldo(RESPALDOS_DIR_SIM, anterior)) throw new Error(`No hay respaldo de ${anterior} para rehacer desde ${claves[desde]}.`);
    await mongoose.connection.dropDatabase();
    if (anterior) {
      log(`Restaurando el respaldo de ${anterior}…`);
      restaurar(MONGO_URI_SIM, UPLOADS_DIR_SIM, RESPALDOS_DIR_SIM, anterior);
    }
    await prepararColecciones();
  }
  const hechas = new Set(await fases.terminadas());
  const faltantes = claves.slice(0, desde).filter((c) => !hechas.has(c));
  if (faltantes.length > 0) throw new Error(`Antes de ${claves[desde]} falta: ${faltantes.join(', ')}.`);

  const ctx: ContextoFase = {
    config,
    semilla,
    claveAdmin: process.env.SIM_ADMIN_PASSWORD || 'KlassySim2024*',
    claveUsuarios: process.env.SIM_USUARIOS_PASSWORD || 'Klassy2024*',
    corte,
    log,
  };

  for (; desde <= hasta; desde += 1) {
    const fase = plan[desde] as Fase;
    const inicio = ahoraReal().getTime();
    log(`▶ ${fase.clave}`);
    await registro.guardar('fase-en-curso', fase.clave);
    await fase.correr(ctx);
    await fases.marcar({ clave: fase.clave, semilla, terminada_at: new Date(), duracion_ms: ahoraReal().getTime() - inicio });
    await registro.guardar('fase-en-curso', null);
    if (!bandera('sin-respaldo')) respaldar(MONGO_URI_SIM, UPLOADS_DIR_SIM, RESPALDOS_DIR_SIM, fase.clave);
    log(`✓ ${fase.clave} (${Math.round((ahoraReal().getTime() - inicio) / 1000)} s)`);
  }
  horaReal();
}

main()
  .catch((err: unknown) => {
    if (err instanceof ErrorApi && err.detalles) console.error('[sim] Detalles:', JSON.stringify(err.detalles, null, 2));
    console.error(`[sim] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await detenerApi();
    await mongoose.disconnect();
  });
