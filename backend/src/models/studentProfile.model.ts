import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { GRUPOS_SANGUINEOS, GrupoSanguineo } from '../constants/enums';

export interface IStudentProfile {
  user_id: Types.ObjectId;
  acudiente_id: Types.ObjectId | null;
  fecha_nacimiento: Date;
  eps?: string;
  rh?: GrupoSanguineo;
  estrato?: number;
  direccion_residencia?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentProfileDocument = HydratedDocument<IStudentProfile>;
type StudentProfileModel = Model<IStudentProfile>;

const studentProfileSchema = new Schema<IStudentProfile, StudentProfileModel>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    acudiente_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_nacimiento: { type: Date, required: true },
    eps: { type: String, trim: true },
    rh: { type: String, enum: GRUPOS_SANGUINEOS },
    estrato: { type: Number, min: 1, max: 6 },
    direccion_residencia: { type: String, trim: true },
  },
  { timestamps: true }
);

export const StudentProfile = model<IStudentProfile, StudentProfileModel>('StudentProfile', studentProfileSchema);
export default StudentProfile;
