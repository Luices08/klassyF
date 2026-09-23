import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface ISubject {
  area_id: Types.ObjectId;
  nombre: string;
  intensidad_horaria_semanal: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SubjectDocument = HydratedDocument<ISubject>;
type SubjectModel = Model<ISubject>;

const subjectSchema = new Schema<ISubject, SubjectModel>(
  {
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    nombre: { type: String, required: true, trim: true },
    intensidad_horaria_semanal: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

subjectSchema.index({ area_id: 1, nombre: 1 }, { unique: true });

export const Subject = model<ISubject, SubjectModel>('Subject', subjectSchema);
export default Subject;
