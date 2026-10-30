import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ROLES, Rol } from '../constants/enums';
import { TIPOS_TERMINOS, TipoTerminos } from '../constants/terminos';

/**
 * Constancia de que una persona aceptó una versión de unos términos (habeas data, Ley 1581 de 2012): quién, con qué perfil, cuándo
 * y desde dónde. Una por persona, tipo y versión; no se edita: una versión nueva de los términos es otra constancia.
 */
export interface IAceptacionTerminos {
  usuario_id: Types.ObjectId;
  tipo: TipoTerminos;
  version: string;
  rol: Rol;
  ip: string | null;
  navegador: string | null;
  createdAt: Date;
}

export type AceptacionTerminosDocument = HydratedDocument<IAceptacionTerminos>;

const aceptacionTerminosSchema = new Schema<IAceptacionTerminos, Model<IAceptacionTerminos>>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tipo: { type: String, enum: TIPOS_TERMINOS, required: true },
    version: { type: String, required: true },
    rol: { type: String, enum: ROLES, required: true },
    ip: { type: String, default: null },
    navegador: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aceptacionTerminosSchema.index({ usuario_id: 1, tipo: 1, version: 1 }, { unique: true });

aceptacionTerminosSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Una aceptación de términos no se modifica.');
});

export const AceptacionTerminos = model<IAceptacionTerminos, Model<IAceptacionTerminos>>('AceptacionTerminos', aceptacionTerminosSchema);
export default AceptacionTerminos;
