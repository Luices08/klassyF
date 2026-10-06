import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_AREA, EstadoArea, NIVELES_EDUCATIVOS, NivelEducativo, TIPOS_ASIGNATURA, TipoAsignatura } from '../../../constants/enums';

export interface ISubject {
  area_id: Types.ObjectId;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  estado: EstadoArea;
  // "Todos los niveles educativos" del documento de analisis no es un valor
  // propio: se representa seleccionando los 4 niveles existentes en el array.
  niveles_educativos: NivelEducativo[];
  createdAt: Date;
  updatedAt: Date;
}

export type SubjectDocument = HydratedDocument<ISubject>;
type SubjectModel = Model<ISubject>;

const subjectSchema = new Schema<ISubject, SubjectModel>(
  {
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    nombre: { type: String, required: true, trim: true },
    abreviatura: { type: String, required: true, trim: true, uppercase: true },
    descripcion: { type: String, required: true, trim: true },
    tipo: { type: String, enum: TIPOS_ASIGNATURA, required: true },
    estado: { type: String, enum: ESTADOS_AREA, default: 'activo' },
    niveles_educativos: {
      type: [{ type: String, enum: NIVELES_EDUCATIVOS }],
      required: true,
      validate: {
        validator: (niveles: NivelEducativo[]) =>
          Array.isArray(niveles) && niveles.length > 0 && new Set(niveles).size === niveles.length,
        message: 'niveles_educativos debe tener al menos un nivel, sin repetidos.',
      },
    },
  },
  { timestamps: true }
);

subjectSchema.index({ area_id: 1, nombre: 1 }, { unique: true });

export const Subject = model<ISubject, SubjectModel>('Subject', subjectSchema);
export default Subject;
