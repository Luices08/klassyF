import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ALCANCES_NOTICIA, AlcanceNoticia, ESTADOS_HABILITACION, EstadoHabilitacion } from '../constants/noticias';

/**
 * Permiso para que un docente publique noticias: lo otorgan administración, coordinación o secretaría, con un alcance máximo y, si se quiere, solo ciertas
 * categorías (el docente de pastoral publica Pastoral para toda la institución; quien dirige un grupo, solo para el suyo). Dura hasta que alguien la revoque.
 * Es un registro propio del módulo: no toca al usuario.
 */
export interface IHabilitacionNoticias {
  docente_id: Types.ObjectId;
  alcance_maximo: AlcanceNoticia;
  /** Vacío = todas las categorías. */
  categorias_ids: Types.ObjectId[];
  estado: EstadoHabilitacion;
  otorgada_por: Types.ObjectId;
  revocada: { por: Types.ObjectId; fecha: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type HabilitacionNoticiasDocument = HydratedDocument<IHabilitacionNoticias>;

const habilitacionSchema = new Schema<IHabilitacionNoticias, Model<IHabilitacionNoticias>>(
  {
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    alcance_maximo: { type: String, enum: ALCANCES_NOTICIA, required: true },
    categorias_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'CategoriaNoticia' }], default: [] },
    estado: { type: String, enum: ESTADOS_HABILITACION, default: 'ACTIVA' },
    otorgada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revocada: {
      type: new Schema({ por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);

// Un docente tiene a lo sumo una habilitación activa; las revocadas quedan como historia.
habilitacionSchema.index({ docente_id: 1 }, { unique: true, partialFilterExpression: { estado: 'ACTIVA' }, name: 'habilitacion_activa_unica' });

export const HabilitacionNoticias = model<IHabilitacionNoticias>('HabilitacionNoticias', habilitacionSchema);
export default HabilitacionNoticias;
