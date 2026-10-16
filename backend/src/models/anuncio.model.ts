import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { Rol } from '../constants/enums';
import { ROLES_LIST } from '../constants/roles';
import { CANALES_ANUNCIO, CanalAnuncio, ESTADOS_ANUNCIO, EstadoAnuncio, MAX_CUERPO_ANUNCIO, MAX_TITULO_ANUNCIO } from '../constants/notificaciones';

/** Aviso institucional masivo del tablero (M28): lo crean rectoría o coordinación para uno o varios perfiles. */
export interface IAnuncio {
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  publicar_desde: Date;
  /** null = no vence. */
  vence_el: Date | null;
  fijado: boolean;
  estado: EstadoAnuncio;
  canales: CanalAnuncio[];
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AnuncioDocument = HydratedDocument<IAnuncio>;

const anuncioSchema = new Schema<IAnuncio, Model<IAnuncio>>(
  {
    titulo: { type: String, required: true, trim: true, maxlength: MAX_TITULO_ANUNCIO },
    cuerpo: { type: String, required: true, trim: true, maxlength: MAX_CUERPO_ANUNCIO },
    roles_destino: {
      type: [{ type: String, enum: ROLES_LIST }],
      validate: { validator: (r: Rol[]) => r.length > 0 && new Set(r).size === r.length, message: 'Elige al menos un perfil, sin repetidos.' },
    },
    publicar_desde: { type: Date, required: true, default: Date.now },
    vence_el: { type: Date, default: null },
    fijado: { type: Boolean, default: false },
    estado: { type: String, enum: ESTADOS_ANUNCIO, default: 'ACTIVO' },
    canales: { type: [{ type: String, enum: CANALES_ANUNCIO }], default: ['TABLERO'] },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

anuncioSchema.index({ estado: 1, publicar_desde: -1 });

export const Anuncio = model<IAnuncio>('Anuncio', anuncioSchema);
export default Anuncio;
