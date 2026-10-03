import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';

/**
 * Tipo de observación configurable por institución (M14): Académica, Comportamental u otros que defina el coordinador. Solo
 * clasifica la observación; lo disciplinario no es un tipo de observación sino una falta del manual (M15). Ninguna lógica
 * compara por nombre.
 */
export interface ITipoObservacion {
  institucion_id: Types.ObjectId;
  nombre: string;
  /** Se copia a cada observación al guardarla: cambiarlo no revela ni oculta lo ya registrado. */
  visible_estudiante: boolean;
  orden: number;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type TipoObservacionDocument = HydratedDocument<ITipoObservacion>;
type TipoObservacionModel = Model<ITipoObservacion>;

const tipoObservacionSchema = new Schema<ITipoObservacion, TipoObservacionModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    visible_estudiante: { type: Boolean, default: false },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

tipoObservacionSchema.index({ institucion_id: 1, nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });

export const TipoObservacion = model<ITipoObservacion, TipoObservacionModel>('TipoObservacion', tipoObservacionSchema);
export default TipoObservacion;
