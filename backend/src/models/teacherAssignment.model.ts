import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface ITeacherAssignment {
  docente_id: Types.ObjectId;
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  horas_semanales: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TeacherAssignmentDocument = HydratedDocument<ITeacherAssignment>;
type TeacherAssignmentModel = Model<ITeacherAssignment>;

const teacherAssignmentSchema = new Schema<ITeacherAssignment, TeacherAssignmentModel>(
  {
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    horas_semanales: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// Evita asignar dos veces al mismo docente la misma materia en el mismo grupo/año.
teacherAssignmentSchema.index(
  { docente_id: 1, group_id: 1, subject_id: 1, academic_year_id: 1 },
  { unique: true }
);

export const TeacherAssignment = model<ITeacherAssignment, TeacherAssignmentModel>(
  'TeacherAssignment',
  teacherAssignmentSchema
);
export default TeacherAssignment;
