import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { TIPOS_SITUACION, TipoSituacion } from '../comun/convivencia.constants';
import { ESTADOS_USUARIO, EstadoUsuario } from '../../../constants/enums';

/**
 * Falta del manual de convivencia de la institución (M15), con su gravedad (Tipo I, II o III). La definen ADMIN y el
 * coordinador de convivencia, una a una o por carga de archivo. El docente elige una al registrar una falta y la gravedad
 * sale de ella: no tipifica. No hay faltas precargadas: cada colegio tiene su manual.
 */
export interface IFaltaConvivencia {
  institucion_id: Types.ObjectId;
  /** Numeral del manual (por ejemplo 2.15): identifica la falta y mantiene el orden del manual. */
  codigo: string;
  descripcion: string;
  gravedad: TipoSituacion;
  /**
   * Décimas que el manual descuenta a la nota de convivencia por esta falta. Solo se guarda: aplicar descuentos a notas
   * está diferido y no toca M12/M17.
   */
  descuento_decimas: number | null;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type FaltaConvivenciaDocument = HydratedDocument<IFaltaConvivencia>;
type FaltaConvivenciaModel = Model<IFaltaConvivencia>;

const faltaConvivenciaSchema = new Schema<IFaltaConvivencia, FaltaConvivenciaModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    codigo: { type: String, required: true, trim: true, maxlength: 20 },
    descripcion: { type: String, required: true, trim: true, maxlength: 400 },
    gravedad: { type: String, enum: TIPOS_SITUACION, required: true },
    descuento_decimas: { type: Number, min: 0, max: 5, default: null },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

faltaConvivenciaSchema.index({ institucion_id: 1, codigo: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });
faltaConvivenciaSchema.index({ institucion_id: 1, gravedad: 1, estado: 1 });

export const FaltaConvivencia = model<IFaltaConvivencia, FaltaConvivenciaModel>('FaltaConvivencia', faltaConvivenciaSchema);
export default FaltaConvivencia;
