import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  PLAZO_ANULACION_HORAS_INICIAL,
  PLAZO_ENMIENDA_HORAS_INICIAL,
  PLAZO_REMISION_TIPO_III_HORAS_INICIAL,
} from '../constants/convivencia';

/** Política de convivencia de la institución (una por instalación). Crece con M15 (alertas, retención, reincidencia). */
export interface IConfiguracionConvivencia {
  institucion_id: Types.ObjectId;
  /** Horas durante las que el autor puede enmendar su observación; pasado el plazo solo coordinación/ADMIN. */
  plazo_enmienda_horas: number;
  plazo_anulacion_horas: number;
  /** Horas que un caso tipo III puede estar abierto sin remisión antes de mostrar la alerta. */
  plazo_remision_tipo_iii_horas: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionConvivenciaDocument = HydratedDocument<IConfiguracionConvivencia>;
type ConfiguracionConvivenciaModel = Model<IConfiguracionConvivencia>;

const configuracionConvivenciaSchema = new Schema<IConfiguracionConvivencia, ConfiguracionConvivenciaModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    plazo_enmienda_horas: { type: Number, min: 0, max: 720, default: PLAZO_ENMIENDA_HORAS_INICIAL },
    plazo_anulacion_horas: { type: Number, min: 0, max: 720, default: PLAZO_ANULACION_HORAS_INICIAL },
    plazo_remision_tipo_iii_horas: { type: Number, min: 0, max: 720, default: PLAZO_REMISION_TIPO_III_HORAS_INICIAL },
  },
  { timestamps: true }
);

export const ConfiguracionConvivencia = model<IConfiguracionConvivencia, ConfiguracionConvivenciaModel>(
  'ConfiguracionConvivencia',
  configuracionConvivenciaSchema
);
export default ConfiguracionConvivencia;
