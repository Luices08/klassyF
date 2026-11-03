import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_SOLICITUD_CLAVE, EstadoSolicitudClave } from '../constants/recuperacionClave';

export interface ISolicitudRecuperacionClave {
  user_id: Types.ObjectId;
  estado: EstadoSolicitudClave;
  /** Texto libre de quien pide (p. ej. su curso) para que la secretaría lo reconozca; no es un dato verificado. */
  nota: string | null;
  /** Sedes desde las que se atiende, copiadas al pedir: la de la matrícula del estudiante, las de sus hijos si es acudiente o las suyas si es personal. */
  sedes_ids: Types.ObjectId[];
  atendida_por: Types.ObjectId | null;
  atendida_en: Date | null;
  motivo_rechazo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SolicitudRecuperacionClaveDocument = HydratedDocument<ISolicitudRecuperacionClave>;

const solicitudSchema = new Schema<ISolicitudRecuperacionClave>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_SOLICITUD_CLAVE, default: 'PENDIENTE' },
    nota: { type: String, default: null, trim: true },
    sedes_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Campus' }], default: [] },
    atendida_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    atendida_en: { type: Date, default: null },
    motivo_rechazo: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

// Una solicitud pendiente por persona: repetir el botón no llena la bandeja.
solicitudSchema.index({ user_id: 1 }, { unique: true, partialFilterExpression: { estado: 'PENDIENTE' }, name: 'solicitud_clave_pendiente_unica' });
solicitudSchema.index({ estado: 1, createdAt: -1 });

const SolicitudRecuperacionClave: Model<ISolicitudRecuperacionClave> = model<ISolicitudRecuperacionClave>('SolicitudRecuperacionClave', solicitudSchema);

export default SolicitudRecuperacionClave;
