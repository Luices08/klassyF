import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';

/** Agrupa descriptores (p. ej. "Compromisos académicos", "Filosofía institucional" en un manual de convivencia). */
export interface ICategoriaDescriptor {
  institucion_id: Types.ObjectId;
  nombre: string;
  orden: number;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoriaDescriptorDocument = HydratedDocument<ICategoriaDescriptor>;
type CategoriaDescriptorModel = Model<ICategoriaDescriptor>;

const categoriaDescriptorSchema = new Schema<ICategoriaDescriptor, CategoriaDescriptorModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

categoriaDescriptorSchema.index(
  { institucion_id: 1, nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
);

export const CategoriaDescriptor = model<ICategoriaDescriptor, CategoriaDescriptorModel>(
  'CategoriaDescriptor',
  categoriaDescriptorSchema
);
export default CategoriaDescriptor;
