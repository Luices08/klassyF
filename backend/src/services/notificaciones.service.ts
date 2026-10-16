import { AnyBulkWriteOperation, Types } from 'mongoose';
import { Rol } from '../constants/enums';
import { EventoNotificacion, METADATOS_EVENTO } from '../constants/notificaciones';
import Insignia from '../models/insignia.model';
import Notificacion, { INotificacion, NotificacionDocument } from '../models/notificacion.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { DatosNotificacion, renderizarNotificacion } from '../utils/notificaciones';

type IdLike = Types.ObjectId | string;

export interface AvisarInput {
  /** Usuarios que lo reciben (sin repetidos: se limpian aquí). */
  destinatarios: IdLike[];
  /** Perfil con el que lo ven: la campanita es por perfil. */
  rol: Rol;
  evento: EventoNotificacion;
  /** Qué agrupa los avisos: la actividad, el plan, el grupo y periodo… */
  entidad_id: string;
  datos?: DatosNotificacion;
  ruta?: string | null;
  /** Cuántos hechos representa este aviso (por defecto 1). */
  cantidad?: number;
}

const unicos = (ids: IdLike[]) => [...new Set(ids.map(String))];

/**
 * Agrega un aviso a la campanita de cada destinatario. Si ya tiene uno SIN LEER del mismo evento y entidad, no crea otra fila:
 * suma al contador (`$inc`). Es lo que evita una fila por cada entrega de cada estudiante.
 */
export async function avisar(input: AvisarInput): Promise<void> {
  const destinatarios = unicos(input.destinatarios);
  if (destinatarios.length === 0) return;
  const meta = METADATOS_EVENTO[input.evento];
  const ahora = new Date();
  const cantidad = Math.max(1, input.cantidad ?? 1);

  const operaciones: AnyBulkWriteOperation<INotificacion>[] = destinatarios.map((usuario) => ({
    updateOne: {
      filter: { usuario_id: new Types.ObjectId(usuario), rol: input.rol, evento: input.evento, entidad_id: input.entidad_id, leida: false },
      update: {
        $inc: { contador: cantidad },
        $set: { datos: input.datos ?? {}, ruta: input.ruta ?? null, actualizada_en: ahora },
        $setOnInsert: {
          severidad: meta.severidad,
          leida_en: null,
          entregas: meta.canales.map((canal) => ({ canal, estado: canal === 'CAMPANITA' ? 'ENTREGADA' : 'PENDIENTE' })),
        },
      },
      upsert: true,
    },
  }));

  try {
    await Notificacion.bulkWrite(operaciones, { ordered: false });
  } catch (err) {
    // Dos hechos simultáneos pueden intentar crear la misma fila: el índice único deja pasar a uno y el otro reintenta ya como incremento.
    if ((err as { code?: number }).code !== 11000) throw err;
    await Notificacion.bulkWrite(operaciones, { ordered: false });
  }
}

export interface SumarInsigniaInput {
  destinatarios: IdLike[];
  rol: Rol;
  ruta: string;
  pestana?: string;
  cantidad?: number;
}

/** Suma «trabajo pendiente» al menú de cada destinatario, en esa pantalla (o pestaña). No genera ninguna alerta. */
export async function sumarInsignia(input: SumarInsigniaInput): Promise<void> {
  const destinatarios = unicos(input.destinatarios);
  if (destinatarios.length === 0) return;
  const cantidad = Math.max(1, input.cantidad ?? 1);
  const operaciones = destinatarios.map((usuario) => ({
    updateOne: {
      filter: { usuario_id: new Types.ObjectId(usuario), rol: input.rol, ruta: input.ruta, pestana: input.pestana ?? '' },
      update: { $inc: { contador: cantidad } },
      upsert: true,
    },
  }));
  try {
    await Insignia.bulkWrite(operaciones, { ordered: false });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    await Insignia.bulkWrite(operaciones, { ordered: false });
  }
}

/** El usuario entró a la pantalla (o pestaña): su contador se va. */
export async function marcarVisto(usuario: UserDocument, ruta: string, pestana = ''): Promise<void> {
  await Insignia.deleteOne({ usuario_id: usuario._id, rol: usuario.rol, ruta, pestana });
}

// --- Lectura (campanita del perfil activo) ---

export interface NotificacionVista {
  id: string;
  evento: EventoNotificacion;
  severidad: INotificacion['severidad'];
  titulo: string;
  mensaje: string;
  contador: number;
  ruta: string | null;
  leida: boolean;
  fecha: Date;
}

function vista(n: NotificacionDocument | (INotificacion & { _id: Types.ObjectId })): NotificacionVista {
  const { titulo, mensaje } = renderizarNotificacion(n.evento, n.contador, n.datos);
  return { id: String(n._id), evento: n.evento, severidad: n.severidad, titulo, mensaje, contador: n.contador, ruta: n.ruta, leida: n.leida, fecha: n.actualizada_en };
}

export async function listarNotificaciones(usuario: UserDocument, opciones: { solo_no_leidas?: boolean; limite?: number } = {}): Promise<NotificacionVista[]> {
  const filtro: Record<string, unknown> = { usuario_id: usuario._id, rol: usuario.rol };
  if (opciones.solo_no_leidas) filtro.leida = false;
  const docs = await Notificacion.find(filtro)
    .sort({ actualizada_en: -1 })
    .limit(Math.min(opciones.limite ?? 30, 100))
    .lean();
  return docs.map((d) => vista(d as INotificacion & { _id: Types.ObjectId }));
}

export interface ResumenNotificaciones {
  no_leidas: number;
  insignias: Array<{ ruta: string; pestana: string; contador: number }>;
}

/** Lo que el encabezado y el menú necesitan en una sola llamada: el número de la campanita y los contadores por pantalla. */
export async function resumenNotificaciones(usuario: UserDocument): Promise<ResumenNotificaciones> {
  const [no_leidas, insignias] = await Promise.all([
    Notificacion.countDocuments({ usuario_id: usuario._id, rol: usuario.rol, leida: false }),
    Insignia.find({ usuario_id: usuario._id, rol: usuario.rol }).select('ruta pestana contador').lean(),
  ]);
  return { no_leidas, insignias: insignias.map((i) => ({ ruta: i.ruta, pestana: i.pestana, contador: i.contador })) };
}

export async function marcarLeida(usuario: UserDocument, id: string): Promise<void> {
  const r = await Notificacion.updateOne(
    { _id: id, usuario_id: usuario._id, rol: usuario.rol, leida: false },
    { $set: { leida: true, leida_en: new Date() } }
  );
  if (r.matchedCount === 0 && !(await Notificacion.exists({ _id: id, usuario_id: usuario._id, rol: usuario.rol }))) {
    throw new ApiError(404, 'Notificación no encontrada.');
  }
}

export async function marcarTodasLeidas(usuario: UserDocument): Promise<number> {
  const r = await Notificacion.updateMany({ usuario_id: usuario._id, rol: usuario.rol, leida: false }, { $set: { leida: true, leida_en: new Date() } });
  return r.modifiedCount;
}
