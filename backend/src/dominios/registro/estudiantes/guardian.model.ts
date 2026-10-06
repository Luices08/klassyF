import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario, TIPOS_DOCUMENTO, TipoDocumento } from '../../../constants/enums';

/**
 * Acudiente/familiar (M03): persona independiente de `User`. Solo tiene
 * `user_id` cuando se le habilita el portal (M27, rol ACUDIENTE) — un acudiente
 * de emergencia sin acceso al portal nunca necesita cuenta.
 */
export interface IGuardian {
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombre: string;
  apellido: string;
  telefono_principal: string;
  telefono_secundario?: string;
  email?: string;
  ocupacion?: string;
  direccion?: string;
  user_id: Types.ObjectId | null;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type GuardianDocument = HydratedDocument<IGuardian>;
type GuardianModel = Model<IGuardian>;

const guardianSchema = new Schema<IGuardian, GuardianModel>(
  {
    tipo_documento: { type: String, enum: TIPOS_DOCUMENTO, required: true },
    numero_documento: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    telefono_principal: { type: String, required: true, trim: true },
    telefono_secundario: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    ocupacion: { type: String, trim: true },
    direccion: { type: String, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

export const Guardian = model<IGuardian, GuardianModel>('Guardian', guardianSchema);
export default Guardian;
