import bcrypt from 'bcryptjs';
import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario, ROLES, Rol, TIPOS_DOCUMENTO, TipoDocumento } from '../constants/enums';
import { ROLES_CON_SEDE_OBLIGATORIA } from '../constants/roles';

const SALT_ROUNDS = 12;

export interface IUser {
  nombre: string;
  apellido: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email?: string | null;
  telefono: string | null;
  foto_url: string | null;
  password_hash: string;
  rol: Rol;
  estado: EstadoUsuario;
  /** Sedes autorizadas (M02): vacio = acceso global (uso tipico de ADMIN). */
  sedes_ids: Types.ObjectId[];
  /** Fuerza el cambio de contraseña en el proximo login (alta por admin o reseteo). */
  debe_cambiar_password: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  ultimo_login: Date | null;
  /** Se incrementa para invalidar los JWT ya emitidos (suspension, reseteo, cierre forzado). */
  version_sesion: number;
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
      required: false,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El email no tiene un formato valido.'],
    },
    telefono: { type: String, default: null, trim: true },
    foto_url: { type: String, default: null },
    password_hash: { type: String, required: true, select: false },
    rol: { type: String, enum: ROLES, required: true },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
    sedes_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Campus' }],
      default: [],
      validate: {
        validator(this: UserDocument, sedes: Types.ObjectId[]) {
          return !ROLES_CON_SEDE_OBLIGATORIA.includes(this.rol) || sedes.length > 0;
        },
        message: 'Este rol debe tener al menos una sede asignada.',
      },
    },
    debe_cambiar_password: { type: Boolean, default: false },
    intentos_fallidos: { type: Number, default: 0 },
    bloqueado_hasta: { type: Date, default: null },
    ultimo_login: { type: Date, default: null },
    // Sin select:false: se necesita en la mayoria de cargas para comparar contra
    // el JWT (auth.middleware); se oculta de las respuestas en el toJSON de abajo.
    version_sesion: { type: Number, default: 0 },
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
  if (!this.email || this.email.trim() === '') {
    this.email = undefined;
  }
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
    delete obj.version_sesion;
    delete obj.__v;
    return obj;
  },
});

export const User = model<IUser, UserModel>('User', userSchema);
export default User;
