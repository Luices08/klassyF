import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_ENTREGAS_POR_DIA_INICIAL, MAX_EVALUACIONES_POR_DIA_INICIAL } from '../constants/actividades';

/** Política de carga de actividades del colegio (una por instalación): no hay límites quemados en el código. */
export interface IConfiguracionActividades {
  institucion_id: Types.ObjectId;
  /** Evaluaciones que un grupo puede tener con la misma fecha de entrega; 0 = sin límite. Solo advierte, no bloquea. */
  max_evaluaciones_por_dia: number;
  /** Actividades de cualquier tipo con la misma fecha de entrega para un grupo; 0 = sin límite. */
  max_entregas_por_dia: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionActividadesDocument = HydratedDocument<IConfiguracionActividades>;
type ConfiguracionActividadesModel = Model<IConfiguracionActividades>;

const configuracionActividadesSchema = new Schema<IConfiguracionActividades, ConfiguracionActividadesModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    max_evaluaciones_por_dia: { type: Number, min: 0, max: 20, default: MAX_EVALUACIONES_POR_DIA_INICIAL },
    max_entregas_por_dia: { type: Number, min: 0, max: 50, default: MAX_ENTREGAS_POR_DIA_INICIAL },
  },
  { timestamps: true }
);

export const ConfiguracionActividades = model<IConfiguracionActividades, ConfiguracionActividadesModel>(
  'ConfiguracionActividades',
  configuracionActividadesSchema
);
export default ConfiguracionActividades;
