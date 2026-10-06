import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { PROCESOS_IMPORTACION, ProcesoImportacion } from './importacionConvivencia.constants';

/** Una carga masiva ya aplicada: quién, qué archivo (solo su huella, el archivo no se conserva) y qué produjo. */
export interface ILoteImportacion {
  proceso: ProcesoImportacion;
  usuario_id: Types.ObjectId;
  archivo_nombre: string;
  formato: 'xlsx' | 'csv';
  hash: string;
  filas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  createdAt: Date;
}
export type LoteImportacionDocument = HydratedDocument<ILoteImportacion>;

const loteSchema = new Schema<ILoteImportacion, Model<ILoteImportacion>>(
  {
    proceso: { type: String, enum: PROCESOS_IMPORTACION, required: true },
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivo_nombre: { type: String, default: '', maxlength: 200 },
    formato: { type: String, enum: ['xlsx', 'csv'], required: true },
    hash: { type: String, required: true },
    filas: { type: Number, default: 0 },
    creados: { type: Number, default: 0 },
    actualizados: { type: Number, default: 0 },
    omitidos: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
loteSchema.index({ usuario_id: 1, createdAt: -1 });
export const LoteImportacion = model<ILoteImportacion>('LoteImportacion', loteSchema);
export default LoteImportacion;
