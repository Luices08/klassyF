import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_MATRICULA, EstadoMatricula } from '../constants/enums';

export interface IEnrollment {
  student_id: Types.ObjectId;
  group_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  folio_matricula: string;
  estado: EstadoMatricula;
  fecha_matricula: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentDocument = HydratedDocument<IEnrollment>;
type EnrollmentModel = Model<IEnrollment>;

const enrollmentSchema = new Schema<IEnrollment, EnrollmentModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    folio_matricula: { type: String, required: true, unique: true },
    estado: { type: String, enum: ESTADOS_MATRICULA, default: 'PREINSCRITO' },
    fecha_matricula: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student_id: 1, academic_year_id: 1 });
enrollmentSchema.index({ group_id: 1 });

export const Enrollment = model<IEnrollment, EnrollmentModel>('Enrollment', enrollmentSchema);
export default Enrollment;
