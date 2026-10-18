import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { CANALES_RESPUESTA, CanalRespuesta, RESPUESTAS_ASISTENCIA, RespuestaAsistencia } from '../constants/citaciones';

/** Un acudiente convocado por un estudiante. El `token` es lo único que el correo necesita para que responda sin iniciar sesión. */
export interface ICitacionDestinatario {
  citacion_id: Types.ObjectId;
  student_id: Types.ObjectId;
  guardian_id: Types.ObjectId;
  /** Cuenta de portal del acudiente (M27), si la tiene: es a quien le llega la campanita. */
  user_id: Types.ObjectId | null;
  /** Copia del correo al convocar: si secretaría lo corrige después, el reenvío usa el nuevo. */
  email: string;
  /** 128 bits al azar: no se puede adivinar ni enumerar. */
  token: string;
  respuesta: RespuestaAsistencia;
  respondida_en: Date | null;
  canal_respuesta: CanalRespuesta | null;
  /** Versión de la citación a la que respondió: una respuesta a una fecha anterior no cuenta. */
  version_respondida: number | null;
  /** Último correo encolado para este acudiente. */
  correo_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CitacionDestinatarioDocument = HydratedDocument<ICitacionDestinatario>;

const citacionDestinatarioSchema = new Schema<ICitacionDestinatario, Model<ICitacionDestinatario>>(
  {
    citacion_id: { type: Schema.Types.ObjectId, ref: 'Citacion', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    guardian_id: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, default: '', trim: true, lowercase: true },
    token: { type: String, required: true, unique: true },
    respuesta: { type: String, enum: RESPUESTAS_ASISTENCIA, default: 'PENDIENTE' },
    respondida_en: { type: Date, default: null },
    canal_respuesta: { type: String, enum: [...CANALES_RESPUESTA, null], default: null },
    version_respondida: { type: Number, default: null },
    correo_id: { type: Schema.Types.ObjectId, ref: 'CorreoEnCola', default: null },
  },
  { timestamps: true }
);

citacionDestinatarioSchema.index({ citacion_id: 1, student_id: 1, guardian_id: 1 }, { unique: true });
citacionDestinatarioSchema.index({ guardian_id: 1, student_id: 1 });

export const CitacionDestinatario = model<ICitacionDestinatario, Model<ICitacionDestinatario>>('CitacionDestinatario', citacionDestinatarioSchema);
export default CitacionDestinatario;
