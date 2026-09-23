import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_GRUPO, EstadoGrupo } from '../constants/enums';
import JornadaOperativa from './jornadaOperativa.model';

export interface IGroup {
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  grade_id: Types.ObjectId;
  jornada_id: Types.ObjectId;
  nomenclatura: string;
  max_capacity: number;
  cupos_ocupados: number;
  estado: EstadoGrupo;
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
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', required: true },
    nomenclatura: { type: String, required: true, trim: true, uppercase: true },
    max_capacity: { type: Number, required: true, min: 1 },
    cupos_ocupados: { type: Number, default: 0, min: 0 },
    estado: { type: String, enum: ESTADOS_GRUPO, default: 'ACTIVE' },
    director_grupo_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Regla de unicidad de M01: un mismo nombre de grupo no puede repetirse para
// la misma sede, jornada y grado dentro del mismo año lectivo.
groupSchema.index(
  { academic_year_id: 1, sede_id: 1, jornada_id: 1, grade_id: 1, nomenclatura: 1 },
  { unique: true }
);

groupSchema.pre('validate', function validateCupos(this: IGroup, next) {
  if (this.cupos_ocupados > this.max_capacity) {
    return next(new Error('cupos_ocupados no puede ser mayor que max_capacity.'));
  }
  next();
});

// La jornada asignada al grupo debe pertenecer a la misma sede del grupo: una
// jornada operativa es especifica de su sede (ver jornadaOperativa.model.ts),
// asi que no puede haber un grupo con jornada de otra sede.
groupSchema.pre('validate', async function validateJornadaDeLaSede(this: GroupDocument, next) {
  if (!this.jornada_id || !this.sede_id) return next();
  if (!this.isModified('jornada_id') && !this.isModified('sede_id')) return next();

  const jornada = await JornadaOperativa.findById(this.jornada_id);
  if (!jornada) {
    return next(new Error('jornada_id no corresponde a una jornada operativa existente.'));
  }
  if (String(jornada.sede_id) !== String(this.sede_id)) {
    return next(new Error('La jornada seleccionada no pertenece a la sede del grupo.'));
  }
  next();
});

groupSchema.virtual('cupos_disponibles').get(function cuposDisponibles(this: IGroup) {
  return this.max_capacity - this.cupos_ocupados;
});

groupSchema.set('toObject', { virtuals: true });
groupSchema.set('toJSON', { virtuals: true });

export const Group = model<IGroup, GroupModel>('Group', groupSchema);
export default Group;
