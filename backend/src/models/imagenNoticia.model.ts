import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/**
 * La imagen de una noticia, en su propia colección: así listar noticias, que se hace en cada inicio, no arrastra megabytes de bytes. Una por noticia.
 * Se sirve solo con sesión y solo a quien puede ver esa noticia (los niños pueden salir en las fotos de un evento): nunca pública.
 */
export interface IImagenNoticia {
  noticia_id: Types.ObjectId;
  mime: string;
  datos: Buffer;
  tamano: number;
  subida_por: Types.ObjectId;
  actualizada_en: Date;
}

export type ImagenNoticiaDocument = HydratedDocument<IImagenNoticia>;

const imagenNoticiaSchema = new Schema<IImagenNoticia, Model<IImagenNoticia>>({
  noticia_id: { type: Schema.Types.ObjectId, ref: 'Noticia', required: true, unique: true },
  mime: { type: String, required: true },
  datos: { type: Buffer, required: true },
  tamano: { type: Number, required: true },
  subida_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actualizada_en: { type: Date, default: Date.now },
});

export const ImagenNoticia = model<IImagenNoticia, Model<IImagenNoticia>>('ImagenNoticia', imagenNoticiaSchema);
export default ImagenNoticia;
