import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { CLAVES_IMAGEN_INSTITUCIONAL, ClaveImagenInstitucional } from '../constants/imagenesInstitucionales';

/**
 * Fotos de la institución (login y futuros tableros) en su propia colección: así `GET /institution`, que leen todas las pantallas,
 * no arrastra megabytes de imagen.
 */
export interface IImagenInstitucional {
  clave: ClaveImagenInstitucional;
  mime: string;
  datos: Buffer;
  actualizada_en: Date;
}

export type ImagenInstitucionalDocument = HydratedDocument<IImagenInstitucional>;

const imagenInstitucionalSchema = new Schema<IImagenInstitucional, Model<IImagenInstitucional>>({
  clave: { type: String, enum: CLAVES_IMAGEN_INSTITUCIONAL, required: true, unique: true },
  mime: { type: String, required: true },
  datos: { type: Buffer, required: true },
  actualizada_en: { type: Date, default: Date.now },
});

export const ImagenInstitucional = model<IImagenInstitucional, Model<IImagenInstitucional>>('ImagenInstitucional', imagenInstitucionalSchema);
export default ImagenInstitucional;
