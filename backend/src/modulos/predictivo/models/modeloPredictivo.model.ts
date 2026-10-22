/**
 * Una versión del modelo predictivo: nace PENDIENTE cuando el ADMIN pide entrenar, el proceso en segundo plano la toma (EN_CURSO) y termina
 * LISTO (pasó la prueba), RECHAZADO (entrenó pero no la pasó: queda para consultar, nunca se activa) o FALLIDO (error). Solo una está
 * activa a la vez (índice único parcial). La red guardada es el JSON de Brain.js; las listas no la traen.
 */
import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_MODELO, EstadoModelo } from '../constants/predictivo';

export interface IModeloPredictivo {
  version: number;
  estado: EstadoModelo;
  activo: boolean;
  /** true mientras está PENDIENTE o EN_CURSO: un índice único impide dos entrenamientos a la vez aunque dos peticiones lleguen juntas. */
  en_cola: boolean;
  solicitado_por: Types.ObjectId | null;
  iniciado_en: Date | null;
  terminado_en: Date | null;
  /** Mientras está EN_CURSO: hasta cuándo es de quien lo tomó (si el proceso muere, otro lo retoma después). */
  reservado_hasta: Date | null;
  version_entradas: number;
  anios_usados: number[];
  /** Años cerrados con resultado de promoción con que se entrenó; con menos de `ANIOS_REALES_MINIMOS` es un modelo de demostración. */
  anios_reales: number;
  es_demostracion: boolean;
  filas_entrenamiento: number;
  filas_prueba: number;
  criterio_prueba: 'ANIO' | 'ESTUDIANTES' | null;
  anio_prueba: number | null;
  error_entrenamiento: number | null;
  iteraciones: number | null;
  metricas: unknown;
  motivo_rechazo: string | null;
  error: string | null;
  red: unknown;
  activado_por: Types.ObjectId | null;
  activado_en: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ModeloPredictivoDocument = HydratedDocument<IModeloPredictivo>;
type ModeloPredictivoModel = Model<IModeloPredictivo>;

const modeloSchema = new Schema<IModeloPredictivo, ModeloPredictivoModel>(
  {
    version: { type: Number, required: true, unique: true },
    estado: { type: String, enum: ESTADOS_MODELO, default: 'PENDIENTE' },
    activo: { type: Boolean, default: false },
    en_cola: { type: Boolean, default: true },
    solicitado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    iniciado_en: { type: Date, default: null },
    terminado_en: { type: Date, default: null },
    reservado_hasta: { type: Date, default: null },
    version_entradas: { type: Number, required: true },
    anios_usados: { type: [Number], default: [] },
    anios_reales: { type: Number, default: 0 },
    es_demostracion: { type: Boolean, default: false },
    filas_entrenamiento: { type: Number, default: 0 },
    filas_prueba: { type: Number, default: 0 },
    criterio_prueba: { type: String, enum: ['ANIO', 'ESTUDIANTES', null], default: null },
    anio_prueba: { type: Number, default: null },
    error_entrenamiento: { type: Number, default: null },
    iteraciones: { type: Number, default: null },
    metricas: { type: Schema.Types.Mixed, default: null },
    motivo_rechazo: { type: String, default: null },
    error: { type: String, default: null },
    red: { type: Schema.Types.Mixed, default: null, select: false },
    activado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    activado_en: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

modeloSchema.index({ activo: 1 }, { unique: true, partialFilterExpression: { activo: true }, name: 'modelo_activo_unico' });
modeloSchema.index({ en_cola: 1 }, { unique: true, partialFilterExpression: { en_cola: true }, name: 'un_entrenamiento_a_la_vez' });
modeloSchema.index({ estado: 1, version: 1 });

export const ModeloPredictivo = model<IModeloPredictivo, ModeloPredictivoModel>('ModeloPredictivo', modeloSchema);
export default ModeloPredictivo;
