import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ROLES_LIST } from '../constants/roles';
import { Rol } from '../constants/enums';
import {
  CANALES_ENTREGA,
  CanalEntrega,
  ESTADOS_ENTREGA,
  EstadoEntrega,
  EVENTOS_NOTIFICACION,
  EventoNotificacion,
  SEVERIDADES_NOTIFICACION,
  SeveridadNotificacion,
} from '../constants/notificaciones';
import type { DatosNotificacion } from '../utils/notificaciones';

/**
 * Alerta de la campanita (M28). Una fila por (usuario, perfil, evento, entidad) MIENTRAS NO SE LEA: si llega otro hecho igual
 * se incrementa `contador` (upsert) en vez de insertar una fila nueva. Al leerla se cierra y la siguiente abre una nueva.
 */
export interface INotificacion {
  usuario_id: Types.ObjectId;
  /** Perfil con el que se ve: una docente que también es acudiente tiene campanitas distintas. */
  rol: Rol;
  evento: EventoNotificacion;
  /** Qué agrupa: la actividad, el plan, el grupo+periodo… (como cadena: no siempre es un ObjectId). */
  entidad_id: string;
  severidad: SeveridadNotificacion;
  contador: number;
  datos: DatosNotificacion;
  /** Pantalla a la que lleva al hacer clic. */
  ruta: string | null;
  leida: boolean;
  leida_en: Date | null;
  /** Por dónde debe llegar y si ya llegó. El correo queda PENDIENTE hasta que exista su envío. */
  entregas: Array<{ canal: CanalEntrega; estado: EstadoEntrega }>;
  actualizada_en: Date;
  createdAt: Date;
}

export type NotificacionDocument = HydratedDocument<INotificacion>;

const notificacionSchema = new Schema<INotificacion, Model<INotificacion>>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rol: { type: String, enum: ROLES_LIST, required: true },
    evento: { type: String, enum: EVENTOS_NOTIFICACION, required: true },
    entidad_id: { type: String, required: true },
    severidad: { type: String, enum: SEVERIDADES_NOTIFICACION, required: true },
    contador: { type: Number, required: true, min: 1, default: 1 },
    datos: { type: Schema.Types.Mixed, default: {} },
    ruta: { type: String, default: null },
    leida: { type: Boolean, default: false },
    leida_en: { type: Date, default: null },
    entregas: {
      type: [{ _id: false, canal: { type: String, enum: CANALES_ENTREGA, required: true }, estado: { type: String, enum: ESTADOS_ENTREGA, required: true } }],
      default: [],
    },
    actualizada_en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Solo una alerta SIN LEER por usuario+perfil+evento+entidad: es lo que hace posible el upsert y cierra la carrera entre dos hechos simultáneos.
notificacionSchema.index(
  { usuario_id: 1, rol: 1, evento: 1, entidad_id: 1 },
  { unique: true, partialFilterExpression: { leida: false }, name: 'alerta_sin_leer_unica' }
);
notificacionSchema.index({ usuario_id: 1, rol: 1, actualizada_en: -1 });

export const Notificacion = model<INotificacion>('Notificacion', notificacionSchema);
export default Notificacion;
