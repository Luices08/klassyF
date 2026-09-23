import bcrypt from 'bcryptjs';
import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario, ROLES, Rol, TIPOS_DOCUMENTO, TipoDocumento } from '../constants/enums';

const SALT_ROUNDS = 12;

export interface IUser {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email: string;
  password_hash: string;
  rol: Rol;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
  /** Virtual de escritura (no persistido): password en texto plano, hasheado en pre('validate'). */
  password?: string;
  /** Transiente: nunca se persiste (no declarado en el schema). */
  _plainPassword?: string;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    tipo_documento: { type: String, enum: TIPOS_DOCUMENTO, required: true },
    numero_documento: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El email no tiene un formato valido.'],
    },
    password_hash: { type: String, required: true, select: false },
    rol: { type: String, enum: ROLES, required: true },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

// Virtual de escritura: permite `user.password = 'texto-plano'` y lo hashea en pre-validate.
userSchema
  .virtual('password')
  .set(function setPassword(this: UserDocument, value: string) {
    this._plainPassword = value;
  })
  .get(function getPassword(this: UserDocument) {
    return this._plainPassword;
  });

// pre('validate'), no pre('save'): la validacion de `required` sobre
// password_hash corre ANTES de los hooks de save, asi que el hash debe
// existir para cuando Mongoose valide el documento.
userSchema.pre('validate', async function hashPassword(this: UserDocument, next) {
  if (!this._plainPassword) return next();
  this.password_hash = await bcrypt.hash(this._plainPassword, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  this: UserDocument,
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password_hash);
};

userSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.password_hash;
    delete obj.__v;
    return obj;
  },
});

export const User = model<IUser, UserModel>('User', userSchema);
export default User;
