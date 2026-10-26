import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';
import { PATRON_CODIGO_CONDICION, TIPOS_EXPEDIENTE, TipoExpediente } from '../constants/inclusion';

/**
 * Una condición que origina un expediente de inclusión (M16): una categoría de discapacidad para el PIAR o una necesidad del plan de
 * apoyo. Cada una declara a qué tipo de expediente pertenece, así el tipo se deduce de la condición elegida. La define el colegio
 * (ADMIN y orientación); el código identifica la condición en los expedientes y por eso no cambia.
 */
export interface ICondicionApoyo {
  codigo: string;
  nombre: string;
  tipo_expediente: TipoExpediente;
  descripcion: string;
  orden: number;
  estado: EstadoUsuario;
  /** Las usa el sistema por defecto (`POR_CONFIRMAR`, `OTRA`): no se eliminan, no se desactivan y no cambian de tipo. */
  sistema: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CondicionApoyoDocument = HydratedDocument<ICondicionApoyo>;
type CondicionApoyoModel = Model<ICondicionApoyo>;

const condicionApoyoSchema = new Schema<ICondicionApoyo, CondicionApoyoModel>(
  {
    codigo: { type: String, required: true, trim: true, uppercase: true, match: PATRON_CODIGO_CONDICION, immutable: true },
    nombre: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    tipo_expediente: { type: String, enum: TIPOS_EXPEDIENTE, required: true },
    descripcion: { type: String, trim: true, maxlength: 300, default: '' },
    orden: { type: Number, default: 0, min: 0, max: 999 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
    sistema: { type: Boolean, default: false, immutable: true },
  },
  { timestamps: true }
);

condicionApoyoSchema.index({ codigo: 1 }, { unique: true });
condicionApoyoSchema.index({ tipo_expediente: 1, estado: 1, orden: 1 });

export const CondicionApoyo = model<ICondicionApoyo, CondicionApoyoModel>('CondicionApoyo', condicionApoyoSchema);
export default CondicionApoyo;
