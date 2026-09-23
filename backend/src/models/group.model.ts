import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { JORNADAS, Jornada } from '../constants/enums';

export interface IGroup {
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  grade_id: Types.ObjectId;
  jornada: Jornada;
  nomenclatura: string;
  cupo_maximo: number;
  cupos_ocupados: number;
  director_grupo_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupVirtuals {
  cupos_disponibles: number;
}

export type GroupDocument = HydratedDocument<IGroup> & IGroupVirtuals;
type GroupModel = Model<IGroup>;

const groupSchema = new Schema<IGroup, GroupModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    jornada: { type: String, enum: JORNADAS, required: true },
    nomenclatura: { type: String, required: true, trim: true, uppercase: true },
    cupo_maximo: { type: Number, required: true, min: 1 },
    cupos_ocupados: { type: Number, default: 0, min: 0 },
    director_grupo_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

groupSchema.index(
  { academic_year_id: 1, sede_id: 1, jornada: 1, grade_id: 1, nomenclatura: 1 },
  { unique: true }
);

groupSchema.pre('validate', function validateCupos(this: IGroup, next) {
  if (this.cupos_ocupados > this.cupo_maximo) {
    return next(new Error('cupos_ocupados no puede ser mayor que cupo_maximo.'));
  }
  next();
});

groupSchema.virtual('cupos_disponibles').get(function cuposDisponibles(this: IGroup) {
  return this.cupo_maximo - this.cupos_ocupados;
});

groupSchema.set('toObject', { virtuals: true });
groupSchema.set('toJSON', { virtuals: true });

export const Group = model<IGroup, GroupModel>('Group', groupSchema);
export default Group;
