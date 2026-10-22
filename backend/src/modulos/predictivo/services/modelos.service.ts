/**
 * Versiones del modelo y su cola de entrenamiento. El ADMIN pide entrenar desde su pantalla; la petición queda PENDIENTE y un proceso en
 * segundo plano (arrancado en `server.ts`) la toma, arma las filas con lo que hay en la base, entrena en un hilo aparte y guarda la versión
 * con sus métricas. Si la prueba es aceptable reemplaza a la activa; si no, queda RECHAZADA para consultarla y la activa sigue. La cola vive
 * en Mongo (como la de correos): el reclamo es atómico, así que varias instancias no entrenan lo mismo dos veces.
 */
import path from 'path';
import { Worker } from 'worker_threads';
import { Types } from 'mongoose';
import Counter from '../../../models/counter.model';
import { UserDocument } from '../../../models/user.model';
import { registrarEvento } from '../../../services/audit.service';
import { ApiError } from '../../../utils/ApiError';
import { runTransaction } from '../../../utils/runTransaction';
import { ANIOS_REALES_MINIMOS, INTERVALO_COLA_MS, RESERVA_ENTRENAMIENTO_MS, VERSION_ENTRADAS } from '../constants/predictivo';
import { MODELO_DEMOSTRACION } from '../modeloDemostracion';
import ModeloPredictivo, { ModeloPredictivoDocument } from '../models/modeloPredictivo.model';
import { entrenarYEvaluar, FilaEntrenamiento, ResultadoEntrenamiento } from '../utils/entrenamiento';
import { motivoDeRechazo } from '../utils/metricas';
import { armarConjunto } from './conjunto.service';

export function vistaModelo(m: ModeloPredictivoDocument) {
  return {
    _id: String(m._id),
    version: m.version,
    estado: m.estado,
    activo: m.activo,
    solicitado_por: m.solicitado_por ? String(m.solicitado_por) : null,
    createdAt: m.createdAt,
    iniciado_en: m.iniciado_en,
    terminado_en: m.terminado_en,
    anios_usados: m.anios_usados,
    anios_reales: m.anios_reales,
    es_demostracion: m.es_demostracion,
    filas_entrenamiento: m.filas_entrenamiento,
    filas_prueba: m.filas_prueba,
    criterio_prueba: m.criterio_prueba,
    anio_prueba: m.anio_prueba,
    error_entrenamiento: m.error_entrenamiento,
    iteraciones: m.iteraciones,
    metricas: m.metricas,
    motivo_rechazo: m.motivo_rechazo,
    error: m.error,
    activado_en: m.activado_en,
    vigente: m.version_entradas === VERSION_ENTRADAS,
  };
}

export async function listarModelos() {
  const modelos = await ModeloPredictivo.find({}).sort({ version: -1 }).limit(50);
  return {
    modelos: modelos.map(vistaModelo),
    en_cola: modelos.some((m) => m.en_cola),
    demostracion: MODELO_DEMOSTRACION
      ? { disponible: true, generado: MODELO_DEMOSTRACION.generado, metricas: MODELO_DEMOSTRACION.metricas }
      : { disponible: false, generado: null, metricas: null },
  };
}

export async function solicitarEntrenamiento(usuario: UserDocument, ip?: string | null) {
  if (await ModeloPredictivo.exists({ en_cola: true })) throw new ApiError(409, 'Ya hay un entrenamiento en cola o en curso: espera a que termine.');
  const contador = await Counter.findOneAndUpdate({ _id: 'PREDICTIVO-VERSION' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  let modelo: ModeloPredictivoDocument;
  try {
    modelo = await ModeloPredictivo.create({ version: contador.seq, version_entradas: VERSION_ENTRADAS, solicitado_por: usuario._id });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ya hay un entrenamiento en cola o en curso: espera a que termine.');
    throw err;
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'PREDICTIVO_ENTRENAMIENTO_SOLICITADO', entidad: 'ModeloPredictivo', entidad_id: modelo._id, detalle: `Versión ${modelo.version}`, ip });
  despertarCola();
  return vistaModelo(modelo);
}

async function marcarActivo(id: Types.ObjectId | string, usuarioId: Types.ObjectId | string | null): Promise<void> {
  await runTransaction(async (session) => {
    await ModeloPredictivo.updateMany({ activo: true }, { $set: { activo: false } }, { session });
    await ModeloPredictivo.updateOne({ _id: id }, { $set: { activo: true, activado_por: usuarioId, activado_en: new Date() } }, { session });
  });
}

/** El ADMIN vuelve a una versión anterior que pasó la prueba (p. ej. si la nueva no le convence). Una RECHAZADA nunca se activa. */
export async function activarModelo(id: string, usuario: UserDocument, ip?: string | null) {
  const modelo = await ModeloPredictivo.findById(id);
  if (!modelo) throw new ApiError(404, 'Versión del modelo no encontrada.');
  if (modelo.estado !== 'LISTO') throw new ApiError(409, 'Solo se activa una versión que pasó la prueba.');
  if (modelo.version_entradas !== VERSION_ENTRADAS) throw new ApiError(409, 'Esta versión se entrenó con otras entradas: hay que entrenar de nuevo.');
  await marcarActivo(modelo._id, usuario._id);
  await registrarEvento({ usuario_id: usuario._id, accion: 'PREDICTIVO_MODELO_ACTIVADO', entidad: 'ModeloPredictivo', entidad_id: modelo._id, detalle: `Versión ${modelo.version}`, ip });
  return vistaModelo((await ModeloPredictivo.findById(id)) as ModeloPredictivoDocument);
}

// ---------------------------------------------------------------- proceso en segundo plano

const ext = path.extname(__filename);

function entrenarEnHilo(filas: FilaEntrenamiento[]): Promise<ResultadoEntrenamiento> {
  return new Promise((resolve, reject) => {
    // Compilado, el hilo es el .js de dist. En desarrollo (tsx) el hilo arranca con un cargador de una línea que registra tsx para
    // CommonJS: con `--import tsx` el hilo resolvía los `import` sin extensión como ESM y fallaba.
    const archivo = path.join(__dirname, '..', `entrenamiento.worker${ext}`);
    const hilo =
      ext === '.ts'
        ? new Worker(`require('tsx/cjs'); require(${JSON.stringify(archivo)});`, { eval: true, workerData: { filas } })
        : new Worker(archivo, { workerData: { filas } });
    hilo.once('message', (m: { ok: boolean; resultado?: ResultadoEntrenamiento; error?: string }) => (m.ok && m.resultado ? resolve(m.resultado) : reject(new Error(m.error ?? 'El entrenamiento falló.'))));
    hilo.once('error', reject);
    hilo.once('exit', (codigo) => codigo !== 0 && reject(new Error(`El hilo de entrenamiento terminó con código ${codigo}.`)));
  });
}

class MotivoParaElAdmin extends Error {}

/** Toma la siguiente petición de la cola y la entrena. Devuelve false si no había nada. `enHilo: false` entrena aquí mismo (pruebas). */
export async function procesarSiguiente({ enHilo = true }: { enHilo?: boolean } = {}): Promise<boolean> {
  const ahora = new Date();
  const modelo = await ModeloPredictivo.findOneAndUpdate(
    { en_cola: true, $or: [{ estado: 'PENDIENTE' }, { estado: 'EN_CURSO', reservado_hasta: { $lt: ahora } }] },
    { $set: { estado: 'EN_CURSO', iniciado_en: ahora, reservado_hasta: new Date(ahora.getTime() + RESERVA_ENTRENAMIENTO_MS) } },
    { sort: { version: 1 }, new: true }
  );
  if (!modelo) return false;

  try {
    const { filas, anios } = await armarConjunto();
    if (filas.length === 0) throw new MotivoParaElAdmin('No hay años cerrados con cierre de promoción para entrenar. Se puede usar el modelo de demostración mientras tanto.');
    const resultado = enHilo ? await entrenarEnHilo(filas) : entrenarYEvaluar(filas);
    const motivo = motivoDeRechazo(resultado.metricas);
    await ModeloPredictivo.updateOne(
      { _id: modelo._id },
      {
        $set: {
          estado: motivo ? 'RECHAZADO' : 'LISTO',
          en_cola: false,
          terminado_en: new Date(),
          reservado_hasta: null,
          anios_usados: anios,
          anios_reales: anios.length,
          es_demostracion: anios.length < ANIOS_REALES_MINIMOS,
          filas_entrenamiento: resultado.filas_entrenamiento,
          filas_prueba: resultado.filas_prueba,
          criterio_prueba: resultado.criterio_prueba,
          anio_prueba: resultado.anio_prueba,
          error_entrenamiento: resultado.error_entrenamiento,
          iteraciones: resultado.iteraciones,
          metricas: resultado.metricas,
          motivo_rechazo: motivo,
          red: resultado.red,
        },
      }
    );
    if (!motivo) await marcarActivo(modelo._id, null);
  } catch (error) {
    // Al ADMIN solo le llega un motivo que pueda entender; el detalle técnico (rutas, pila) se queda en el registro del servidor.
    if (!(error instanceof MotivoParaElAdmin)) console.error(`Entrenamiento predictivo v${modelo.version} falló:`, error);
    const mensaje = error instanceof MotivoParaElAdmin ? error.message : 'Falló por un error interno del servidor. El detalle quedó en el registro del servidor.';
    await ModeloPredictivo.updateOne({ _id: modelo._id }, { $set: { estado: 'FALLIDO', en_cola: false, terminado_en: new Date(), reservado_hasta: null, error: mensaje } });
  }
  return true;
}

let temporizador: NodeJS.Timeout | null = null;
let procesando = false;

export async function procesarCola(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    while (await procesarSiguiente()) {
      // sigue mientras haya peticiones
    }
  } catch (error) {
    console.error('Cola de entrenamiento predictivo:', error);
  } finally {
    procesando = false;
  }
}

export function iniciarColaEntrenamiento(): void {
  if (temporizador) return;
  temporizador = setInterval(() => void procesarCola(), INTERVALO_COLA_MS);
  temporizador.unref();
  setTimeout(() => void procesarCola(), 5_000).unref();
}

export function detenerColaEntrenamiento(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

/** Sin la cola arrancada (pruebas, scripts) no hace nada: quien llama decide cuándo procesar. */
export function despertarCola(): void {
  if (temporizador) void procesarCola();
}
