import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_CARACTERES_COMENTARIO } from '../constants/actividades';
import { ROLES_LIST } from '../constants/roles';

export interface IComentarioActividad {
  activity_id: Types.ObjectId;
  autor_id: Types.ObjectId;
  /** El perfil con el que comentó: un docente que también es acudiente no se confunde entre sus dos perfiles. */
  autor_rol: string;
  texto: string;
  createdAt: Date;
}

export type ComentarioActividadDocument = HydratedDocument<IComentarioActividad>;
type ComentarioActividadModel = Model<IComentarioActividad>;

const comentarioSchema = new Schema<IComentarioActividad, ComentarioActividadModel>(
  {
    activity_id: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    autor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    autor_rol: { type: String, required: true, enum: ROLES_LIST },
    texto: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_CARACTERES_COMENTARIO },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

comentarioSchema.index({ activity_id: 1, createdAt: 1 });

export const ComentarioActividad = model<IComentarioActividad, ComentarioActividadModel>('ComentarioActividad', comentarioSchema);
export default ComentarioActividad;
