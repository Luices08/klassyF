import { HydratedDocument, Model, Schema, model } from 'mongoose';

/** Reclamo de una tarea diaria: el `_id` (`<tarea>:<AAAA-MM-DD>`) único garantiza que corra una vez por día aunque haya varias instancias. */
export interface ITareaDiaria {
  _id: string;
  reclamada_en: Date;
}

export type TareaDiariaDocument = HydratedDocument<ITareaDiaria>;

const tareaDiariaSchema = new Schema<ITareaDiaria, Model<ITareaDiaria>>({
  _id: { type: String, required: true },
  reclamada_en: { type: Date, default: Date.now },
});

export const TareaDiaria = model<ITareaDiaria, Model<ITareaDiaria>>('TareaDiaria', tareaDiariaSchema);
export default TareaDiaria;
