import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IStudyPlanAssignment {
  grade_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  porcentaje_en_area: number;
  createdAt: Date;
  updatedAt: Date;
}

export type StudyPlanAssignmentDocument = HydratedDocument<IStudyPlanAssignment>;
type StudyPlanAssignmentModel = Model<IStudyPlanAssignment>;

const studyPlanAssignmentSchema = new Schema<IStudyPlanAssignment, StudyPlanAssignmentModel>(
  {
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    porcentaje_en_area: { type: Number, required: true, min: 1, max: 100 },
  },
  { timestamps: true }
);

// Una asignatura solo puede aparecer una vez en la malla de un grado/año.
studyPlanAssignmentSchema.index({ grade_id: 1, subject_id: 1, academic_year_id: 1 }, { unique: true });

export const StudyPlanAssignment = model<IStudyPlanAssignment, StudyPlanAssignmentModel>(
  'StudyPlanAssignment',
  studyPlanAssignmentSchema
);
export default StudyPlanAssignment;
