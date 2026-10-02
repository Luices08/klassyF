import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';
import { TIPOS_SITUACION, TipoSituacion } from '../constants/convivencia';

/**
 * Frase del catálogo. En un tipo disciplinario es una **falta del manual de convivencia** de la institución: con su
 * código y el tipo de situación (I/II/III) que ese manual le asigna. Así el docente elige la falta y no tipifica.
 */
export interface IDescriptor {
  institucion_id: Types.ObjectId;
  tipo_id: Types.ObjectId;
  categoria_id: Types.ObjectId | null;
  codigo: string | null;
  texto: string;
  /** Solo en tipos disciplinarios. */
  tipo_situacion: TipoSituacion | null;
  /**
   * Décimas que el manual descuenta a la nota de convivencia por esta falta. Solo se guarda: aplicar descuentos a
   * notas está diferido (M12/M17 no se tocan).
   */
  descuento_decimas: number | null;
  orden: number;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type DescriptorDocument = HydratedDocument<IDescriptor>;
type DescriptorModel = Model<IDescriptor>;

const descriptorSchema = new Schema<IDescriptor, DescriptorModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    tipo_id: { type: Schema.Types.ObjectId, ref: 'TipoObservacion', required: true },
    categoria_id: { type: Schema.Types.ObjectId, ref: 'CategoriaDescriptor', default: null },
    codigo: { type: String, trim: true, maxlength: 20, default: null },
    texto: { type: String, required: true, trim: true, maxlength: 400 },
    tipo_situacion: { type: String, enum: [...TIPOS_SITUACION, null], default: null },
    descuento_decimas: { type: Number, min: 0, default: null },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

// Un código identifica una falta dentro de su tipo; las frases sin código no compiten entre sí.
descriptorSchema.index({ tipo_id: 1, codigo: 1 }, { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } });
descriptorSchema.index({ tipo_id: 1, estado: 1, orden: 1 });

export const Descriptor = model<IDescriptor, DescriptorModel>('Descriptor', descriptorSchema);
export default Descriptor;
