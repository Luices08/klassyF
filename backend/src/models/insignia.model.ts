import { Model, Schema, Types, model } from 'mongoose';
import { Rol } from '../constants/enums';
import { ROLES_LIST } from '../constants/roles';

/**
 * Contador de «trabajo pendiente» incrustado en el menú (M28). No es un mensaje: no tiene canal ni se agrupa por entidad, solo suma por
 * pantalla (`ruta`) y, opcionalmente, por pestaña. Desaparece cuando el usuario entra a esa pantalla o pestaña.
 */
export interface IInsignia {
  usuario_id: Types.ObjectId;
  rol: Rol;
  ruta: string;
  /** Cadena vacía = la pantalla completa. */
  pestana: string;
  contador: number;
}

const insigniaSchema = new Schema<IInsignia, Model<IInsignia>>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rol: { type: String, enum: ROLES_LIST, required: true },
    ruta: { type: String, required: true },
    pestana: { type: String, default: '' },
    contador: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

insigniaSchema.index({ usuario_id: 1, rol: 1, ruta: 1, pestana: 1 }, { unique: true });

export const Insignia = model<IInsignia>('Insignia', insigniaSchema);
export default Insignia;
