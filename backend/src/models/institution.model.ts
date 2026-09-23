import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IInstitution {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  rector_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InstitutionDocument = HydratedDocument<IInstitution>;
type InstitutionModel = Model<IInstitution>;

const institutionSchema = new Schema<IInstitution, InstitutionModel>(
  {
    nombre: { type: String, required: true, trim: true },
    codigo_dane: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{12}$/, 'El codigo DANE debe tener exactamente 12 digitos numericos.'],
    },
    nit: { type: String, required: true, trim: true },
    resolucion_aprobacion: { type: String, required: true, trim: true },
    rector_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const Institution = model<IInstitution, InstitutionModel>('Institution', institutionSchema);
export default Institution;
