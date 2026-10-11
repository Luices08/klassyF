import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { PARENTESCOS, Parentesco } from '../constants/enums';

/**
 * Vinculo N:M Estudiante-Acudiente (M03): un acudiente registrado una sola vez
 * puede estar vinculado a varios hijos; un estudiante puede tener varios
 * acudientes (padre, madre, tutor, contacto de emergencia).
 */
export interface IStudentGuardian {
  student_id: Types.ObjectId;
  guardian_id: Types.ObjectId;
  parentesco: Parentesco;
  /** Responsable legal: firma matricula, recibe citaciones, habilita cuenta de portal (M27). */
  es_principal: boolean;
  /** Autorizado para retirar al estudiante de la sede / contacto de emergencia. */
  autorizado_retiro: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentGuardianDocument = HydratedDocument<IStudentGuardian>;
type StudentGuardianModel = Model<IStudentGuardian>;

const studentGuardianSchema = new Schema<IStudentGuardian, StudentGuardianModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    guardian_id: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    parentesco: { type: String, enum: PARENTESCOS, required: true },
    es_principal: { type: Boolean, default: false },
    autorizado_retiro: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentGuardianSchema.index({ student_id: 1, guardian_id: 1 }, { unique: true });

// Garantiza que un estudiante tenga maximo 1 acudiente principal:
// al marcar un vinculo como principal, cualquier otro del mismo estudiante se desmarca.
studentGuardianSchema.pre('save', async function asegurarUnicoPrincipalHook(next) {
  if (this.isModified('es_principal') && this.es_principal) {
    await model('StudentGuardian').updateMany(
      { student_id: this.student_id, _id: { $ne: this._id } },
      { $set: { es_principal: false } }
    );
  }
  next();
});

export const StudentGuardian = model<IStudentGuardian, StudentGuardianModel>(
  'StudentGuardian',
  studentGuardianSchema
);
export default StudentGuardian;
