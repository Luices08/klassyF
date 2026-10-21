import { HydratedDocument, Model, Schema, model } from 'mongoose';

/** Imágenes del carrusel de la página pública, en su propia colección para que la configuración se lea liviana. */
export interface IImagenSitio {
  orden: number;
  mime: string;
  datos: Buffer;
  actualizada_en: Date;
}

export type ImagenSitioDocument = HydratedDocument<IImagenSitio>;

const imagenSitioSchema = new Schema<IImagenSitio, Model<IImagenSitio>>({
  orden: { type: Number, required: true },
  mime: { type: String, required: true },
  datos: { type: Buffer, required: true },
  actualizada_en: { type: Date, default: Date.now },
});

export const ImagenSitio = model<IImagenSitio, Model<IImagenSitio>>('ImagenSitio', imagenSitioSchema);
export default ImagenSitio;
