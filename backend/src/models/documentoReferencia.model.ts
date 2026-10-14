import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_DESCRIPCION_PLAN, MAX_TITULO_PLAN } from '../constants/planeacion';
import type { ArchivoPlaneacion } from '../utils/almacenPlaneacion';
import { archivoPlaneacionSchema } from './planeacionSubesquemas';

/**
 * PDF de apoyo (DBA, estándares, lineamientos) que coordinación carga y asigna a un área y a los grados donde aplica. Es solo
 * consulta: ningún plan, actividad ni nota se liga a un documento por llave, así que no hay un banco que mantener sincronizado.
 */
export interface IDocumentoReferencia {
  titulo: string;
  descripcion: string;
  area_id: Types.ObjectId;
  grados_ids: Types.ObjectId[];
  archivo: ArchivoPlaneacion;
  subido_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentoReferenciaDocument = HydratedDocument<IDocumentoReferencia>;
type DocumentoReferenciaModel = Model<IDocumentoReferencia>;

const documentoReferenciaSchema = new Schema<IDocumentoReferencia, DocumentoReferenciaModel>(
  {
    titulo: { type: String, required: true, trim: true, maxlength: MAX_TITULO_PLAN },
    descripcion: { type: String, trim: true, maxlength: MAX_DESCRIPCION_PLAN, default: '' },
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    grados_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Grade' }],
      validate: {
        validator: (grados: Types.ObjectId[]) => Array.isArray(grados) && grados.length > 0 && new Set(grados.map(String)).size === grados.length,
        message: 'El documento debe aplicar al menos a un grado, sin repetidos.',
      },
    },
    archivo: { type: archivoPlaneacionSchema, required: true },
    subido_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

documentoReferenciaSchema.index({ area_id: 1, grados_ids: 1 });

export const DocumentoReferencia = model<IDocumentoReferencia, DocumentoReferenciaModel>('DocumentoReferencia', documentoReferenciaSchema);
export default DocumentoReferencia;
