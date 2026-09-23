import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_AREA, EstadoArea } from '../constants/enums';

export interface IArea {
  institucion_id: Types.ObjectId;
  nombre: string;
  codigo: string;
  estado: EstadoArea;
  createdAt: Date;
  updatedAt: Date;
}

export type AreaDocument = HydratedDocument<IArea>;
type AreaModel = Model<IArea>;

const areaSchema = new Schema<IArea, AreaModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true },
    codigo: { type: String, required: true, trim: true, uppercase: true },
    estado: { type: String, enum: ESTADOS_AREA, default: 'activo' },
  },
  { timestamps: true }
);

// El codigo de area (ej. "CNAT") es unico dentro de una institucion.
areaSchema.index({ institucion_id: 1, codigo: 1 }, { unique: true });

export const Area = model<IArea, AreaModel>('Area', areaSchema);
export default Area;
