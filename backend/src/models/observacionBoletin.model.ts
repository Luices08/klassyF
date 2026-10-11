import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_LONGITUD_OBSERVACION } from '../constants/boletin';

/**
 * La observación que el docente titular escribe a un estudiante en su asignatura y periodo, y que sale en el boletín (M17).
 * Vive aparte de `CalificacionAsignatura` (M12): es texto del informe, no parte del cálculo de la nota. `group_id` y
 * `subject_id` se copian de la asignación (no cambian) para armar el boletín de un grupo sin cruzarla.
 */
export interface IObservacionBoletin {
  academic_year_id: Types.ObjectId;
  teacher_assignment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  periodo_numero: number;
  student_id: Types.ObjectId;
  texto: string;
  autor_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ObservacionBoletinDocument = HydratedDocument<IObservacionBoletin>;
type ObservacionBoletinModel = Model<IObservacionBoletin>;

const observacionBoletinSchema = new Schema<IObservacionBoletin, ObservacionBoletinModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    periodo_numero: { type: Number, required: true, min: 1 },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    texto: { type: String, trim: true, required: true, maxlength: MAX_LONGITUD_OBSERVACION },
    autor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

observacionBoletinSchema.index({ teacher_assignment_id: 1, periodo_numero: 1, student_id: 1 }, { unique: true });
observacionBoletinSchema.index({ group_id: 1, academic_year_id: 1, periodo_numero: 1 });

export const ObservacionBoletin = model<IObservacionBoletin, ObservacionBoletinModel>('ObservacionBoletin', observacionBoletinSchema);
export default ObservacionBoletin;
