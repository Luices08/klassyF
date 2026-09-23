import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { JORNADAS, Jornada } from '../constants/enums';

// Una jornada operativa (core_shifts en el grafo de dependencias) es una jornada
// (MANANA, TARDE, UNICA, NOCTURNA) habilitada para una sede especifica. Pertenece
// a la sede y no a la institucion: una sede puede operar Jornada Unica mientras
// otra sede de la misma institucion opera Mañana/Tarde.
export interface IJornadaOperativa {
  sede_id: Types.ObjectId;
  nombre: Jornada;
  createdAt: Date;
  updatedAt: Date;
}

export type JornadaOperativaDocument = HydratedDocument<IJornadaOperativa>;
type JornadaOperativaModel = Model<IJornadaOperativa>;

const jornadaOperativaSchema = new Schema<IJornadaOperativa, JornadaOperativaModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    nombre: { type: String, enum: JORNADAS, required: true },
  },
  { timestamps: true }
);

// Una jornada (por nombre) es unica dentro de una sede.
jornadaOperativaSchema.index({ sede_id: 1, nombre: 1 }, { unique: true });

export const JornadaOperativa = model<IJornadaOperativa, JornadaOperativaModel>(
  'JornadaOperativa',
  jornadaOperativaSchema
);
export default JornadaOperativa;
