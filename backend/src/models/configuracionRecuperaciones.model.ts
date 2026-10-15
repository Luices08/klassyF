import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  EFECTOS_RECUPERACION,
  MAX_CARACTERES_TEXTO_SIEE,
  MAX_INTENTOS_RECUPERACION,
  MODOS_INTEGRACION,
  MOMENTOS_RECUPERACION,
} from '../constants/recuperaciones';
import { INTEGRACION_INICIAL } from '../utils/integracionRecuperacion';
import { PoliticaRecuperacion } from '../utils/recuperaciones';

/**
 * Política de recuperaciones del colegio para un año lectivo (M18): qué periodos se recuperan, cuándo, qué pasa con la nota y si hay
 * recuperación de fin de año. Una por año; un año nuevo parte de la del anterior. Que las reglas calcen con los periodos del año
 * lo valida el servicio (`validarPolitica`), no el modelo, porque depende del año.
 */
export interface IConfiguracionRecuperaciones extends PoliticaRecuperacion {
  academic_year_id: Types.ObjectId;
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionRecuperacionesDocument = HydratedDocument<IConfiguracionRecuperaciones>;
type ConfiguracionRecuperacionesModel = Model<IConfiguracionRecuperaciones>;

const reglaPeriodoSchema = new Schema(
  {
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    aplica: { type: Boolean, required: true },
    momento: { type: String, enum: MOMENTOS_RECUPERACION, required: true },
  },
  { _id: false }
);

const intentosSchema = { type: Number, required: true, min: 1, max: MAX_INTENTOS_RECUPERACION };

/** Cómo entra la recuperación a la nota de la asignatura (ver `constants/recuperaciones.ts`). Se reusa en `Recuperacion`, que la congela. */
export const integracionSchema = new Schema(
  {
    modo: { type: String, enum: MODOS_INTEGRACION, default: INTEGRACION_INICIAL.modo },
    bloque_clave: { type: String, trim: true, default: INTEGRACION_INICIAL.bloque_clave },
    peso: { type: Number, min: 0, max: 100, default: INTEGRACION_INICIAL.peso },
    solo_si_mejora: { type: Boolean, default: INTEGRACION_INICIAL.solo_si_mejora },
    tope_aprobatoria: { type: Boolean, default: INTEGRACION_INICIAL.tope_aprobatoria },
    cuenta_en_boletin: { type: Boolean, default: INTEGRACION_INICIAL.cuenta_en_boletin },
  },
  { _id: false }
);

const configuracionRecuperacionesSchema = new Schema<IConfiguracionRecuperaciones, ConfiguracionRecuperacionesModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, unique: true },
    periodos: { type: [reglaPeriodoSchema], default: [] },
    periodo: {
      type: new Schema(
        {
          efecto: { type: String, enum: EFECTOS_RECUPERACION, required: true },
          max_intentos: intentosSchema,
          integracion: { type: integracionSchema, default: () => ({}) },
        },
        { _id: false }
      ),
      required: true,
    },
    anual: {
      type: new Schema(
        {
          aplica: { type: Boolean, required: true },
          efecto: { type: String, enum: EFECTOS_RECUPERACION, required: true },
          max_intentos: intentosSchema,
          max_asignaturas_pendientes: { type: Number, required: true, min: 0, max: 50 },
        },
        { _id: false }
      ),
      required: true,
    },
    texto_siee: { type: String, trim: true, maxlength: MAX_CARACTERES_TEXTO_SIEE, default: '' },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const ConfiguracionRecuperaciones = model<IConfiguracionRecuperaciones, ConfiguracionRecuperacionesModel>(
  'ConfiguracionRecuperaciones',
  configuracionRecuperacionesSchema
);
export default ConfiguracionRecuperaciones;
