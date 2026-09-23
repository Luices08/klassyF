import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface ICampus {
  institucion_id: Types.ObjectId;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  es_principal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CampusDocument = HydratedDocument<ICampus>;
type CampusModel = Model<ICampus>;

const campusSchema = new Schema<ICampus, CampusModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true },
    codigo_dane_sede: {
      type: String,
      required: true,
      match: [/^\d{12}$/, 'El codigo DANE de la sede debe tener exactamente 12 digitos numericos.'],
    },
    direccion: { type: String, required: true, trim: true },
    es_principal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Una sede (por su codigo DANE) es unica dentro de una institucion.
campusSchema.index({ institucion_id: 1, codigo_dane_sede: 1 }, { unique: true });

export const Campus = model<ICampus, CampusModel>('Campus', campusSchema);
export default Campus;
