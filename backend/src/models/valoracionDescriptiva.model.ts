import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_CARACTERES_DESCRIPTOR, NIVELES_VALORACION, NivelValoracion } from '../constants/valoracionDescriptiva';

/**
 * La valoración cualitativa de un estudiante de Preescolar en una asignatura (o dimensión) y un periodo. Reemplaza a la nota numérica de M12 en ese
 * nivel: no hay promedio ni cálculo, solo el nivel de avance y el texto del docente. Una por asignación + estudiante + periodo.
 */
export interface IValoracionDescriptiva {
  academic_year_id: Types.ObjectId;
  teacher_assignment_id: Types.ObjectId;
  student_id: Types.ObjectId;
  periodo_numero: number;
  nivel: NivelValoracion;
  fortalezas: string;
  recomendaciones: string;
  registrado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ValoracionDescriptivaDocument = HydratedDocument<IValoracionDescriptiva>;

const valoracionSchema = new Schema<IValoracionDescriptiva, Model<IValoracionDescriptiva>>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 12 },
    nivel: { type: String, enum: NIVELES_VALORACION, required: true },
    fortalezas: { type: String, required: true, trim: true, maxlength: MAX_CARACTERES_DESCRIPTOR },
    recomendaciones: { type: String, required: true, trim: true, maxlength: MAX_CARACTERES_DESCRIPTOR },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

valoracionSchema.index({ teacher_assignment_id: 1, student_id: 1, periodo_numero: 1 }, { unique: true });
valoracionSchema.index({ academic_year_id: 1, student_id: 1, periodo_numero: 1 });

export const ValoracionDescriptiva = model<IValoracionDescriptiva, Model<IValoracionDescriptiva>>('ValoracionDescriptiva', valoracionSchema);
export default ValoracionDescriptiva;
