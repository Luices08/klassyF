import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { NIVELES_EDUCATIVOS, NivelEducativo } from '../constants/enums';

export interface IGrade {
  nivel: NivelEducativo;
  numero: number;
  nombre: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GradeDocument = HydratedDocument<IGrade>;
type GradeModel = Model<IGrade>;

const gradeSchema = new Schema<IGrade, GradeModel>(
  {
    nivel: { type: String, enum: NIVELES_EDUCATIVOS, required: true },
    // numero (numeric_order) admite -2 y -1 para Pre-jardin y Jardin: Preescolar
    // incluye subniveles previos a Transicion (numero 0) segun el documento maestro.
    numero: { type: Number, required: true, min: -2, max: 11 },
    nombre: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

gradeSchema.index({ numero: 1 }, { unique: true });

export const Grade = model<IGrade, GradeModel>('Grade', gradeSchema);
export default Grade;
