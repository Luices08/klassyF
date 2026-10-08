import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  DECLARACION_ESTABLECIMIENTO_INICIAL,
  DECLARACION_FAMILIA_INICIAL,
  PLAZO_ELABORACION_DIAS_INICIAL,
  SEGUIMIENTOS_MINIMOS_INICIAL,
  VERSION_POLITICA_DATOS_INICIAL,
} from '../constants/inclusion';

/** Política de inclusión de la institución (una por instalación). Nada de esto está quemado en las reglas del módulo. */
export interface IConfiguracionInclusion {
  institucion_id: Types.ObjectId;
  /** Días para elaborar el PIAR desde el inicio del año (o la matrícula, si es posterior). Solo alerta, no bloquea. */
  plazo_elaboracion_dias: number;
  /** Seguimientos mínimos por ajuste en el año (el formato pide mínimo 3, según la periodicidad del SIEE). */
  seguimientos_minimos_anio: number;
  /** Años de conservación de la historia escolar de inclusión; `null` = el colegio aún no lo definió (no se asume ni se borra). */
  retencion_anios: number | null;
  declaracion_establecimiento: string;
  declaracion_familia: string;
  /** Versión del texto de autorización de datos sensibles que firma el responsable legal. */
  version_politica_datos: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionInclusionDocument = HydratedDocument<IConfiguracionInclusion>;
type ConfiguracionInclusionModel = Model<IConfiguracionInclusion>;

const configuracionInclusionSchema = new Schema<IConfiguracionInclusion, ConfiguracionInclusionModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    plazo_elaboracion_dias: { type: Number, min: 1, max: 365, default: PLAZO_ELABORACION_DIAS_INICIAL },
    seguimientos_minimos_anio: { type: Number, min: 1, max: 12, default: SEGUIMIENTOS_MINIMOS_INICIAL },
    retencion_anios: { type: Number, min: 1, max: 100, default: null },
    declaracion_establecimiento: { type: String, maxlength: 1000, default: DECLARACION_ESTABLECIMIENTO_INICIAL },
    declaracion_familia: { type: String, maxlength: 1000, default: DECLARACION_FAMILIA_INICIAL },
    version_politica_datos: { type: String, maxlength: 30, default: VERSION_POLITICA_DATOS_INICIAL },
  },
  { timestamps: true }
);

export const ConfiguracionInclusion = model<IConfiguracionInclusion, ConfiguracionInclusionModel>('ConfiguracionInclusion', configuracionInclusionSchema);
export default ConfiguracionInclusion;
