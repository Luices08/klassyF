/**
 * Lo que la simulación guarda de sí misma, en colecciones `sim_*` (no son del sistema ni agregan campos a sus modelos):
 *  - `sim_fases`: fases terminadas, para retomar o detenerse donde se pida.
 *  - `sim_registro`: claves de la configuración → ids reales («docente:MAT1» → ObjectId), para que una fase corrida en otro
 *    proceso encuentre lo que creó la anterior sin adivinar por nombre.
 *  - `sim_perfiles`: la «verdad oculta» de cada estudiante (sirve para evaluar la IA, nunca para entrenarla).
 */
import mongoose from 'mongoose';

export interface FaseTerminada {
  clave: string;
  semilla: number;
  terminada_at: Date;
  duracion_ms: number;
}

function coleccion(nombre: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('La base de la simulación no está conectada.');
  return db.collection(nombre);
}

export const fases = {
  async terminadas(): Promise<string[]> {
    const filas = await coleccion('sim_fases').find({}).sort({ terminada_at: 1 }).toArray();
    return filas.map((f) => String(f.clave));
  },
  async marcar(fase: FaseTerminada): Promise<void> {
    await coleccion('sim_fases').updateOne({ clave: fase.clave }, { $set: fase }, { upsert: true });
  },
  async borrarDesde(claves: string[]): Promise<void> {
    await coleccion('sim_fases').deleteMany({ clave: { $in: claves } });
  },
};

export const registro = {
  async guardar(clave: string, valor: unknown): Promise<void> {
    await coleccion('sim_registro').updateOne({ clave }, { $set: { clave, valor } }, { upsert: true });
  },
  async leer<T = string>(clave: string): Promise<T> {
    const fila = await coleccion('sim_registro').findOne({ clave });
    if (!fila) throw new Error(`La simulación no encuentra «${clave}»: ¿se corrió la fase que lo crea?`);
    return fila.valor as T;
  },
  async leerOpcional<T = string>(clave: string): Promise<T | null> {
    const fila = await coleccion('sim_registro').findOne({ clave });
    return fila ? (fila.valor as T) : null;
  },
  /** Todas las claves con un prefijo («docente:») como mapa clave-sin-prefijo → valor. */
  async porPrefijo<T = string>(prefijo: string): Promise<Map<string, T>> {
    const filas = await coleccion('sim_registro')
      .find({ clave: { $regex: `^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } })
      .toArray();
    return new Map(filas.map((f) => [String(f.clave).slice(prefijo.length), f.valor as T]));
  },
};

export interface PerfilSimulado {
  student_id: string;
  cohorte: number;
  categoria_inicial: string;
  latentes: Record<string, unknown>;
  por_anio: Array<{ anio: number; grado: number; categoria: string; latentes: Record<string, unknown> }>;
}

export const perfiles = {
  async guardarVarios(lista: PerfilSimulado[]): Promise<void> {
    if (lista.length === 0) return;
    await coleccion('sim_perfiles').bulkWrite(
      lista.map((p) => ({ updateOne: { filter: { student_id: p.student_id }, update: { $set: p }, upsert: true } }))
    );
  },
  async contar(): Promise<number> {
    return coleccion('sim_perfiles').countDocuments();
  },
};

/** ¿La base tiene datos que no creó la simulación? (usuarios y ninguna fase registrada). */
export async function baseAjena(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return false;
  const [usuarios, fasesHechas] = await Promise.all([db.collection('users').countDocuments(), coleccion('sim_fases').countDocuments()]);
  return usuarios > 0 && fasesHechas === 0;
}
