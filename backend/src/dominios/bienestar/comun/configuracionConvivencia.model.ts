import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  PLAZO_ANULACION_HORAS_INICIAL,
  PLAZO_ENMIENDA_HORAS_INICIAL,
  PLAZO_REMISION_TIPO_III_HORAS_INICIAL,
  QUORUM_PORCENTAJE_INICIAL,
} from './convivencia.constants';

/** Política de convivencia de la institución (una por instalación). Crece con M15 (alertas, retención, reincidencia). */
export interface IConfiguracionConvivencia {
  institucion_id: Types.ObjectId;
  /** Horas durante las que el autor puede enmendar su observación; pasado el plazo solo coordinación/ADMIN. */
  plazo_enmienda_horas: number;
  plazo_anulacion_horas: number;
  /** Horas que un caso tipo III puede estar abierto sin remisión antes de mostrar la alerta. */
  plazo_remision_tipo_iii_horas: number;
  /** Porcentaje mínimo de miembros presentes para que una sesión (y cada caso que trata) tenga quórum. */
  quorum_porcentaje: number;
  /**
   * Años que se conservan las observaciones y los casos (según la tabla de retención documental de la institución). `null` = la
   * institución todavía no definió el plazo: el sistema no asume ninguno ni borra nada; solo informa lo vencido cuando se defina.
   */
  retencion_anios_observaciones: number | null;
  retencion_anios_casos: number | null;
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
    quorum_porcentaje: { type: Number, min: 1, max: 100, default: QUORUM_PORCENTAJE_INICIAL },
    retencion_anios_observaciones: { type: Number, min: 1, max: 100, default: null },
    retencion_anios_casos: { type: Number, min: 1, max: 100, default: null },
  },
  { timestamps: true }
);

export const ConfiguracionConvivencia = model<IConfiguracionConvivencia, ConfiguracionConvivenciaModel>(
  'ConfiguracionConvivencia',
  configuracionConvivenciaSchema
);
export default ConfiguracionConvivencia;
