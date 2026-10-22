import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { CRITERIOS_DESEMPATE, CRITERIOS_INICIALES, CriterioConfigurado, TOLERANCIA_OCUPACION_POR_DEFECTO } from '../constants/rematricula';

/**
 * Cómo el colegio decide la rematrícula cuando faltan cupos (reglas del SIEE): el orden de los criterios de prioridad y cuánta diferencia
 * de ocupación se tolera entre grupos paralelos al balancearlos. Una por instalación; nace con los valores de partida.
 */
export interface IConfiguracionRematricula {
  criterios_desempate: CriterioConfigurado[];
  tolerancia_ocupacion_pct: number;
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionRematriculaDocument = HydratedDocument<IConfiguracionRematricula>;
type ConfiguracionRematriculaModel = Model<IConfiguracionRematricula>;

const configuracionSchema = new Schema<IConfiguracionRematricula, ConfiguracionRematriculaModel>(
  {
    criterios_desempate: {
      type: [new Schema({ criterio: { type: String, enum: CRITERIOS_DESEMPATE, required: true }, activo: { type: Boolean, default: true } }, { _id: false })],
      default: () => structuredClone(CRITERIOS_INICIALES),
    },
    tolerancia_ocupacion_pct: { type: Number, min: 0, max: 50, default: TOLERANCIA_OCUPACION_POR_DEFECTO },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const ConfiguracionRematricula = model<IConfiguracionRematricula, ConfiguracionRematriculaModel>('ConfiguracionRematricula', configuracionSchema);
export default ConfiguracionRematricula;
