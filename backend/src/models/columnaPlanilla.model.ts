import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/**
 * Una casilla "suelta" de la planilla de una clase y periodo: una nota que el docente lleva sin que sea una actividad de M11
 * (una exposición oral, la autoevaluación, el comportamiento...). Las actividades de M11 NO se guardan aquí: ellas mismas son
 * casillas (su bloque y su peso viven en `Activity`). Las notas de esta casilla viven en `CalificacionAsignatura.notas_columnas`.
 */
export interface IColumnaPlanilla {
  academic_year_id: Types.ObjectId;
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  /** Clave del bloque del molde del año (Heteroevaluación, Autoevaluación...). */
  bloque_clave: string;
  nombre: string;
  /** Porcentaje que pesa dentro del bloque; null = automático (las casillas sin peso se reparten lo que queda, por partes iguales). */
  peso: number | null;
  orden: number;
  creada_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ColumnaPlanillaDocument = HydratedDocument<IColumnaPlanilla>;
type ColumnaPlanillaModel = Model<IColumnaPlanilla>;

const columnaPlanillaSchema = new Schema<IColumnaPlanilla, ColumnaPlanillaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    bloque_clave: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9_]{2,40}$/ },
    nombre: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    peso: { type: Number, default: null, min: 0, max: 100 },
    orden: { type: Number, default: 0 },
    creada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

columnaPlanillaSchema.index({ teacher_assignment_id: 1, periodo_numero: 1, orden: 1 });

export const ColumnaPlanilla = model<IColumnaPlanilla, ColumnaPlanillaModel>('ColumnaPlanilla', columnaPlanillaSchema);
export default ColumnaPlanilla;
