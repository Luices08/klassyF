import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { MAX_LONGITUD_FRASE, TIPOS_FRASE_BOLETIN, TipoFraseBoletin } from '../constants/boletin';
import { NIVELES_DESEMPENO, NivelDesempeno } from '../constants/enums';

/**
 * El texto que el boletín muestra por cada nivel de desempeño (M17): una descripción y una recomendación por nivel.
 * Es del colegio (SIEE), no del sistema; una sola instalación = una institución, por eso no lleva `institucion_id`.
 * `texto` vacío significa que ese nivel no lleva esa parte en el boletín.
 */
export interface IFraseDesempeno {
  nivel: NivelDesempeno;
  tipo: TipoFraseBoletin;
  texto: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FraseDesempenoDocument = HydratedDocument<IFraseDesempeno>;
type FraseDesempenoModel = Model<IFraseDesempeno>;

const fraseDesempenoSchema = new Schema<IFraseDesempeno, FraseDesempenoModel>(
  {
    nivel: { type: String, enum: NIVELES_DESEMPENO, required: true },
    tipo: { type: String, enum: TIPOS_FRASE_BOLETIN, required: true },
    texto: { type: String, trim: true, maxlength: MAX_LONGITUD_FRASE, default: '' },
  },
  { timestamps: true }
);

fraseDesempenoSchema.index({ nivel: 1, tipo: 1 }, { unique: true });

export const FraseDesempeno = model<IFraseDesempeno, FraseDesempenoModel>('FraseDesempeno', fraseDesempenoSchema);
export default FraseDesempeno;
