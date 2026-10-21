import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';
import { MAX_NOMBRE_CATEGORIA, TONOS_CATEGORIA, TonoCategoria } from '../constants/noticias';

/** Una categoría de noticia (Deportivo, Ambiental, Pastoral…): la define el colegio, no el código. */
export interface ICategoriaNoticia {
  nombre: string;
  tono: TonoCategoria;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoriaNoticiaDocument = HydratedDocument<ICategoriaNoticia>;

const categoriaNoticiaSchema = new Schema<ICategoriaNoticia, Model<ICategoriaNoticia>>(
  {
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_CATEGORIA },
    tono: { type: String, enum: TONOS_CATEGORIA, default: 'blue' },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

// El nombre no se repite sin importar mayúsculas ni tildes (la comparación fina la hace el servicio; el índice cubre la carrera entre dos altas iguales).
categoriaNoticiaSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 1 } });

export const CategoriaNoticia = model<ICategoriaNoticia>('CategoriaNoticia', categoriaNoticiaSchema);
export default CategoriaNoticia;
