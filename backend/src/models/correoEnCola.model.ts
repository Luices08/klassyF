import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_CORREO, EstadoCorreo, TIPOS_CORREO, TipoCorreo } from '../constants/citaciones';

/**
 * Cola de envío de correo. Vive en Mongo (ya es parte de la instalación y se respalda con ella) en vez de en un servicio aparte:
 * quien convoca solo escribe estas filas, y un proceso en segundo plano las envía de a pocas con reintentos.
 * El mensaje NO se guarda armado: se arma al enviar con los datos de ese momento, así una citación cancelada o reprogramada
 * mientras el correo esperaba su turno no sale con información vieja.
 */
export interface ICorreoEnCola {
  tipo: TipoCorreo;
  /** Entidad que origina el correo (hoy el `CitacionDestinatario`). */
  referencia_id: Types.ObjectId;
  /** Solo en los avisos a la familia: lo mínimo para armarlos al enviar (guardian, fecha, grupo, periodo). */
  datos: Record<string, unknown> | null;
  /** Evita duplicar un aviso (misma familia, estudiante y hecho). Las citaciones no la usan. */
  clave?: string;
  para: string;
  estado: EstadoCorreo;
  intentos: number;
  proximo_intento: Date;
  /** Mientras se envía, hasta cuándo es suyo: si el proceso muere, otro lo retoma al vencer. */
  reservado_hasta: Date | null;
  ultimo_error: string;
  enviado_en: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CorreoEnColaDocument = HydratedDocument<ICorreoEnCola>;

const correoEnColaSchema = new Schema<ICorreoEnCola, Model<ICorreoEnCola>>(
  {
    tipo: { type: String, enum: TIPOS_CORREO, required: true },
    referencia_id: { type: Schema.Types.ObjectId, required: true },
    datos: { type: Schema.Types.Mixed, default: null },
    clave: { type: String },
    para: { type: String, required: true, trim: true, lowercase: true },
    estado: { type: String, enum: ESTADOS_CORREO, default: 'PENDIENTE' },
    intentos: { type: Number, default: 0 },
    proximo_intento: { type: Date, default: Date.now },
    reservado_hasta: { type: Date, default: null },
    ultimo_error: { type: String, default: '', maxlength: 300 },
    enviado_en: { type: Date, default: null },
  },
  { timestamps: true }
);

correoEnColaSchema.index({ estado: 1, proximo_intento: 1 });
correoEnColaSchema.index({ referencia_id: 1 });
correoEnColaSchema.index({ clave: 1 }, { unique: true, partialFilterExpression: { clave: { $type: 'string' } }, name: 'aviso_unico' });

export const CorreoEnCola = model<ICorreoEnCola, Model<ICorreoEnCola>>('CorreoEnCola', correoEnColaSchema);
export default CorreoEnCola;
